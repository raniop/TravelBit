const { verifyAuth, cors } = require('../_lib/auth');
const connectDB = require('../_lib/db');
const { ProductionRecord, ProductionUpload, CommissionAgreement } = require('../_lib/models');
const XLSX = require('xlsx');

let _iconvCached = null;
function getIconv() {
    if (_iconvCached) return _iconvCached;
    try { _iconvCached = require('iconv-lite'); }
    catch (_) {
        try { _iconvCached = require('../../server/node_modules/iconv-lite'); }
        catch (_) { _iconvCached = null; }
    }
    return _iconvCached;
}

// Hebrew month abbreviations → month number
const HEB_MONTH_MAP = {
    'ינו': '01', 'פבר': '02', 'מרץ': '03', 'אפר': '04', 'מאי': '05', 'יונ': '06',
    'יול': '07', 'אוג': '08', 'ספט': '09', 'אוק': '10', 'נוב': '11', 'דצמ': '12'
};

function toYearMonth(hebMonthStr) {
    if (!hebMonthStr) return null;
    const m = hebMonthStr.match(/([^-\s]+)[\s-]+(\d{2,4})/);
    if (!m) return null;
    const monthAbbr = m[1].slice(0, 3);
    const month = HEB_MONTH_MAP[monthAbbr];
    if (!month) return null;
    let year = m[2];
    if (year.length === 2) year = '20' + year;
    return year + '-' + month;
}

function parseDateDMY(s) {
    if (!s) return null;
    const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
}

function parseNumber(s) {
    if (s === null || s === undefined || s === '' || s === '-') return 0;
    const n = parseFloat(String(s).replace(/[,₪\s]/g, ''));
    return isNaN(n) ? 0 : n;
}

// Simple CSV parser — handles quoted commas
function parseCSVLine(line) {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { inQ = !inQ; }
        else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
        else cur += c;
    }
    out.push(cur);
    return out;
}

// Parse Menora elementary production CSV
function parseMenoraCSV(text) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const records = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length < 23) continue;
        records.push({
            productionMonth: cols[0],
            productionYearMonth: toYearMonth(cols[0]),
            mainAgentCode: cols[1],
            mainAgentName: cols[2],
            subAgentCode: cols[3],
            subAgentName: cols[4],
            policyNumber: cols[5],
            licenseNumber: cols[6],
            branchCode: cols[7],
            branchName: cols[8],
            startDate: parseDateDMY(cols[9]),
            endDate: parseDateDMY(cols[10]),
            transactionType: cols[11],
            insuredName: cols[12],
            insuredId: cols[13],
            customerNumber: cols[14],
            netPremium: parseNumber(cols[17]),
            fees: parseNumber(cols[18]),
            grossPremium: parseNumber(cols[19]),
            creditFees: parseNumber(cols[20]),
            grossWithCreditFees: parseNumber(cols[21]),
            commissionPaid: parseNumber(cols[22]),
            commissionManual: parseNumber(cols[23]),
            commissionDifferential: parseNumber(cols[24])
        });
    }
    return records;
}

// Parse Shlomo XLS production
// Format: row 0 = date, row 1 = meta (agent), row 2 = header, rows 3+ = data
// Header: מספר פוליסה | תוספת | ענף בטוח | שם מבוטח | מספר רכב | פרמיה נטו | דמים | פרמיה ברוטו | אשראי | פרמיה כולל אשראי | הנחה | עמלה | עמלה % | סוג מסמך | תאריך תחילה
function parseShlomoXLS(buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (rows.length < 4) return [];

    // Extract production month from row 0 (year, month, day)
    let productionMonth = null;
    let productionYearMonth = null;
    if (rows[0] && rows[0].length >= 3) {
        const y = parseInt(rows[0][0]);
        const m = parseInt(rows[0][1]);
        if (y && m) {
            const monthAbbrs = ['ינו','פבר','מרץ','אפר','מאי','יונ','יול','אוג','ספט','אוק','נוב','דצמ'];
            productionMonth = monthAbbrs[m-1] + '-' + String(y).slice(-2);
            productionYearMonth = y + '-' + String(m).padStart(2,'0');
        }
    }

    // Find header row (look for "מספר פוליסה")
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
        if (rows[i] && rows[i][0] && /מספר פוליסה/.test(String(rows[i][0]))) {
            headerRowIdx = i;
            break;
        }
    }
    if (headerRowIdx < 0) return [];

    const records = [];
    let lastPolicy = null;
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.length < 13) continue;
        const rawCell = String(r[0] || '').trim();
        // Continuation row marker: '"' (with optional RTL marks) means same policy as above
        const isContinuation = /^[\u200E\u200F]*"[\u200E\u200F]*$/.test(rawCell);
        let policyNumber = rawCell.replace(/[\u200E\u200F]/g, '').trim();
        if (isContinuation) {
            policyNumber = lastPolicy;
        } else {
            // Strip leading/trailing quotes only (not internal)
            policyNumber = policyNumber.replace(/^"+|"+$/g, '');
            if (policyNumber === '' || policyNumber === '-') continue;
            lastPolicy = policyNumber;
        }
        if (!policyNumber) continue;

        const branchCode = String(r[2] || '').trim();
        if (!branchCode) continue;
        const insuredName = String(r[3] || '').trim();
        const licenseNumber = String(r[4] || '').trim();
        const netPremium = parseNumber(r[5]);
        const fees = parseNumber(r[6]);
        const grossPremium = parseNumber(r[7]);
        const creditFees = parseNumber(r[8]);
        const grossWithCreditFees = parseNumber(r[9]);
        const commissionPaid = parseNumber(r[11]);
        // Skip total/empty rows
        if (!insuredName && !branchCode) continue;

        records.push({
            productionMonth, productionYearMonth,
            policyNumber,
            licenseNumber,
            branchCode,
            branchName: '', // not in this format
            insuredName,
            insuredId: '',
            customerNumber: '',
            transactionType: String(r[13] || '').trim(),
            startDate: null, endDate: null,
            netPremium, fees, grossPremium, creditFees, grossWithCreditFees,
            commissionPaid,
            commissionManual: 0,
            commissionDifferential: 0
        });
    }
    return records;
}

// Parse Hachshara HTML/TXT production report
// Format: text dump with structure:
//   [customer name]
//   ת.ז.: [id] כתובת: [...]
//   פוליסות:
//       [policy]-[suffix] תאריך תחילה: [d] תאריך סיום: [d]
//       פרמיה: [amount] סוג ביטוח: [type]
function parseHachsharaHTML(text) {
    // Strip HTML wrapper
    const m = text.match(/<pre[^>]*>([\s\S]+?)<\/pre>/i);
    const body = m ? m[1] : text;

    // Detect production month from policy dates (use most common start date month)
    let prodYM = null, prodMonth = null;
    const dateMatches = body.match(/תאריך תחילה:\s*\d{1,2}\/(\d{1,2})\/(\d{4})/g);
    if (dateMatches && dateMatches.length > 0) {
        const monthCounts = {};
        for (const dm of dateMatches) {
            const mm = dm.match(/(\d{1,2})\/(\d{4})/);
            if (mm) {
                const k = mm[2] + '-' + String(mm[1]).padStart(2, '0');
                monthCounts[k] = (monthCounts[k] || 0) + 1;
            }
        }
        let best = null, bestCount = 0;
        for (const [k, c] of Object.entries(monthCounts)) {
            if (c > bestCount) { best = k; bestCount = c; }
        }
        if (best) {
            prodYM = best;
            const [y, m] = best.split('-');
            const abbr = ['ינו','פבר','מרץ','אפר','מאי','יונ','יול','אוג','ספט','אוק','נוב','דצמ'];
            prodMonth = abbr[parseInt(m) - 1] + '-' + y.slice(-2);
        }
    }

    const records = [];
    // Split on 3+ consecutive newlines (customer separator) — within a customer, only 2 newlines between policies
    const customerBlocks = body.split(/\n{3,}/).filter(b => /ת\.ז\./.test(b));

    for (const block of customerBlocks) {
        const lines = block.split(/\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length < 3) continue;
        const customerName = lines[0].trim();
        const idMatch = block.match(/ת\.ז\.:\s*(\d+)/);
        const insuredId = idMatch ? idMatch[1] : '';

        // Extract all policy entries
        // Pattern: "POLICY-SUFFIX תאריך תחילה: DATE תאריך סיום: DATE\n    פרמיה: AMOUNT   סוג ביטוח: TYPE"
        const policyRegex = /(\d{8,})-(\d{2})\s+תאריך תחילה:\s*(\d{1,2}\/\d{1,2}\/\d{4})\s+תאריך סיום:\s*(\d{1,2}\/\d{1,2}\/\d{4})[^\n]*\n[^\n]*פרמיה:\s*(-?[\d.]+)[^\n]*סוג ביטוח:\s*([^\n]+?)(?:\n|$)/g;

        let mm;
        while ((mm = policyRegex.exec(block)) !== null) {
            const [, polNum, suffix, startDateStr, endDateStr, premiumStr, branchType] = mm;
            records.push({
                productionMonth: prodMonth,
                productionYearMonth: prodYM,
                policyNumber: polNum + '-' + suffix,
                licenseNumber: '',
                branchCode: branchType.trim(),
                branchName: branchType.trim(),
                insuredName: customerName,
                insuredId,
                customerNumber: '',
                transactionType: parseInt(suffix) > 0 ? 'תוספת' : 'חדש',
                startDate: parseDateDMY(startDateStr),
                endDate: parseDateDMY(endDateStr),
                netPremium: parseNumber(premiumStr),
                fees: 0,
                grossPremium: parseNumber(premiumStr),
                creditFees: 0,
                grossWithCreditFees: parseNumber(premiumStr),
                commissionPaid: 0, // not in this report
                commissionManual: 0,
                commissionDifferential: 0
            });
        }
    }

    return records;
}

// Reverse Hebrew text from DOS bidi rendering
function reverseHebrew(s) {
    if (!s) return '';
    return s.split('').reverse().join('');
}

// Parse FL ("מבנה אחיד / איגוד לקלע")
// Format: cp862 (DOS Hebrew), fixed-width ~198-char records, Hebrew text REVERSED
// Each policy block identified by chars 14-30 (16-char block key).
// Record types (last 4 chars of position 30-38):
//   0010, 6010 = file/block header
//   0021, 6021 = customer info (ID + name + address)
//   0070, 6070 = period info
//   0101, 0103, 6101 = policy header (with product name + license plate)
//   *200 = coverage line items (with amounts)
//   *300, *370, *371, *372, *373 = footers/totals
function parseFLBuffer(buffer, iconv) {
    const text = iconv.decode(buffer, 'cp862');
    const lines = text.split(/\r?\n/).filter(l => l.length > 50);
    if (lines.length === 0) return [];

    const blockMap = new Map();

    for (const line of lines) {
        if (line.length < 40) continue;
        const blockKey = line.substring(14, 30);
        const typeCode = line.substring(30, 38);
        const typeShort = typeCode.slice(-4);

        let block = blockMap.get(blockKey);
        if (!block) {
            block = {
                blockKey,
                policyNumber: null,
                licenseNumber: '',
                branchName: '',
                insuredName: '',
                insuredId: '',
                netPremium: 0,
                commissionPaid: 0,
                coverages: []
            };
            blockMap.set(blockKey, block);
        }

        // Customer info (0021 / 6021): ID at pos 38-50, Hebrew name at pos 50-100
        if (typeShort === '0021') {
            const idMatch = line.substring(38, 50).match(/(\d{9,10})/);
            if (idMatch && !block.insuredId) block.insuredId = idMatch[1];
            const hebMatches = line.substring(50, 130).match(/[\u0590-\u05FF\s]{3,}/g);
            if (hebMatches && hebMatches.length > 0 && !block.insuredName) {
                block.insuredName = reverseHebrew(hebMatches[0].trim());
            }
        }

        // Policy header (0100 / 0101 / 0103 / 6101): contains TOTAL PREMIUM at fixed position
        // Layout: pos 38-50 = policy number, pos 50-72 = Hebrew product name (fixed width),
        // pos 73-80 = premium in agorot (8 digits), pos 80-89 = license plate
        if (typeShort === '0100' || typeShort === '0101' || typeShort === '0103' || typeShort === '6101') {
            const polMatch = line.substring(38, 50).match(/(\d{6,10})/);
            if (polMatch && !block.policyNumber) {
                block.policyNumber = polMatch[1].replace(/^0+/, '') || polMatch[1];
            }
            const heb = line.substring(50, 73).match(/[\u0590-\u05FF\s]{3,}/);
            if (heb && !block.branchName) block.branchName = reverseHebrew(heb[0].trim());

            // Premium at pos 73-81 (8 digits, in agorot)
            const premSegment = line.substring(73, 81);
            const premMatch = premSegment.match(/(\d{8})/);
            if (premMatch) {
                const agorot = parseInt(premMatch[1], 10);
                const premNIS = agorot / 100;
                if (premNIS > 0 && premNIS < 500000) {
                    block.netPremium = Math.max(block.netPremium, premNIS);
                }
            }

            // License plate at pos 90-99 (after spaces)
            const lic = line.substring(85, 105).match(/(\d{7,8})/);
            if (lic && !block.licenseNumber) block.licenseNumber = lic[1];
        }

        // Coverage line (X200): SKIP for premium calculation - these are mostly informational
        // (terms/conditions). Premium is taken from the policy header only.
        if (typeShort === '0200') {
            const heb = line.substring(38, 80).match(/[\u0590-\u05FF\s]{3,}/);
            if (heb) {
                const coverageName = reverseHebrew(heb[0].trim());
                if (coverageName) block.coverages.push({ name: coverageName });
            }
        }

        // Commission/totals footer (0371): commission at pos 50-69 (in agorot)
        if (typeShort === '0371') {
            // Look for non-zero amounts in the data section
            const dataSegment = line.substring(50, 90);
            const amounts = (dataSegment.match(/(\d{4,})/g) || [])
                .map(a => parseInt(a.replace(/^0+/, '') || '0', 10))
                .filter(n => n > 100 && n < 100000000);
            if (amounts.length > 0) {
                // First reasonable amount is usually commission (in agorot)
                const commAgorot = amounts[0];
                const commNIS = commAgorot / 100;
                if (commNIS > 0 && commNIS < 100000) {
                    block.commissionPaid = Math.max(block.commissionPaid || 0, commNIS);
                }
            }
        }
    }

    // Convert to ProductionRecord format, deduplicating by policy+premium
    const records = [];
    const seenKeys = new Set();
    for (const b of blockMap.values()) {
        const polNum = b.policyNumber || b.blockKey;
        if (!polNum) continue;
        // Skip empty blocks (no customer AND no premium AND no license)
        if (!b.insuredName && b.netPremium === 0 && !b.licenseNumber) continue;
        // Dedupe: same policy+premium+name = same record
        const dedupKey = polNum + '|' + b.netPremium + '|' + b.insuredName;
        if (seenKeys.has(dedupKey)) continue;
        seenKeys.add(dedupKey);

        records.push({
            productionMonth: null, productionYearMonth: null,
            policyNumber: polNum,
            licenseNumber: b.licenseNumber,
            branchCode: '',
            branchName: b.branchName,
            insuredName: b.insuredName || 'לא זוהה',
            insuredId: b.insuredId || '',
            customerNumber: '',
            transactionType: '',
            startDate: null, endDate: null,
            netPremium: b.netPremium,
            fees: 0, grossPremium: b.netPremium, creditFees: 0, grossWithCreditFees: b.netPremium,
            commissionPaid: b.commissionPaid || 0,
            commissionManual: 0, commissionDifferential: 0
        });
    }
    return records;
}

function parseFLBuffer_OLD_unused(buffer, iconv) {
    const text = iconv.decode(buffer, 'win1255');
    const lines = text.split(/\r?\n/).filter(l => l.length > 50);

    // Detect agent code from common header (position 5-14, 11 digits with leading zeros)
    let agentCode = null;
    if (lines.length > 0) {
        const m = lines[0].match(/^.{5}(\d{6,12})/);
        if (m) agentCode = m[1].replace(/^0+/, '');
    }

    // Group records by "block" — each policy block typically has multiple record types.
    // The grouping key seems to be in the header (chars ~15-30 = policy ref).
    // For each block, extract: policy num, customer name, branch, premium, commission

    // Strategy: scan for records with type 6101 (policy summary) and 6020 (customer)
    // and aggregate them per block.

    const records = [];
    let currentBlock = null;
    const flushBlock = () => {
        if (currentBlock && currentBlock.policyNumber) {
            records.push(currentBlock);
        }
        currentBlock = null;
    };

    for (const line of lines) {
        if (line.length < 40) continue;
        const typeCode = line.substring(30, 38);
        const blockKey = line.substring(15, 30);

        // New block
        if (!currentBlock || currentBlock._key !== blockKey) {
            flushBlock();
            currentBlock = {
                _key: blockKey,
                productionMonth: null,
                productionYearMonth: null,
                policyNumber: null,
                licenseNumber: '',
                branchCode: '',
                branchName: '',
                insuredName: '',
                insuredId: '',
                customerNumber: '',
                transactionType: '',
                startDate: null, endDate: null,
                netPremium: 0, fees: 0, grossPremium: 0, creditFees: 0, grossWithCreditFees: 0,
                commissionPaid: 0, commissionManual: 0, commissionDifferential: 0
            };
        }

        // Type 6101 — policy summary line. Contains policy number around pos 38-50
        if (/6101/.test(typeCode)) {
            const seg = line.substring(38, 100);
            const polMatch = seg.match(/(\d{6,})/);
            if (polMatch) currentBlock.policyNumber = polMatch[1];
        }

        // Type 6020 — customer name (Hebrew text in middle of record)
        if (/6020/.test(typeCode)) {
            const heb = line.substring(45, 90).trim();
            if (heb && /[\u0590-\u05FF]/.test(heb)) {
                currentBlock.insuredName = heb;
            }
        }

        // Type ending in 200 — premium/commission lines
        if (/200$/.test(typeCode)) {
            // Look for amounts in expected positions
            const amts = line.substring(60, 198).match(/\d{6,}/g) || [];
            // Take largest reasonable amount as premium candidate
            for (const a of amts) {
                const n = parseInt(a, 10);
                if (n > 100 && n < 100000000) {
                    if (currentBlock.netPremium === 0) currentBlock.netPremium = n;
                    break;
                }
            }
        }
    }
    flushBlock();

    // Filter out blocks without a real policy number
    return records.filter(r => r.policyNumber).map(r => {
        const { _key, ...rest } = r;
        return rest;
    });
}

// Auto-detect format by file extension or content sniff
function detectFormat(fileName, buffer) {
    const lower = (fileName || '').toLowerCase();
    if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
    if (lower.endsWith('.csv') || lower.endsWith('.txt')) return 'csv';
    if (lower.endsWith('.xls') || lower.endsWith('.xlsx')) return 'xls';
    if (lower.endsWith('.fl')) return 'fl';
    // sniff by content
    if (buffer && buffer.length >= 5) {
        const firstBytes = buffer.slice(0, 100).toString('ascii').toLowerCase();
        if (/<html|<!doctype/i.test(firstBytes)) return 'html';
        if (buffer[0] === 0x50 && buffer[1] === 0x4B) return 'xls'; // ZIP (XLSX)
        if (buffer[0] === 0xD0 && buffer[1] === 0xCF) return 'xls'; // OLE2 (XLS)
    }
    return 'csv';
}

// Build a lookup map of branchCode → expectedRate from a commission agreement
function buildRateMap(agreement) {
    const map = new Map();
    if (!agreement || !Array.isArray(agreement.rates)) return map;
    for (const r of agreement.rates) {
        if (!r.productCode) continue;
        // Codes might be comma-separated like "32,232" or single like "21"
        const parts = String(r.productCode).split(/[,/]/).map(s => s.trim()).filter(Boolean);
        for (const p of parts) {
            if (!map.has(p)) map.set(p, Number(r.rate) || 0);
        }
    }
    return map;
}

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    await connectDB();
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ message: 'אין הרשאת גישה.' });

    let companyId;
    if (user.role === 'admin') {
        companyId = req.query.companyId;
        if (!companyId && req.method !== 'POST') return res.status(400).json({ message: 'companyId חסר.' });
        if (!companyId && req.method === 'POST') companyId = req.body.companyId;
    } else {
        companyId = String(user.companyId || '');
        if (!companyId) return res.status(403).json({ message: 'אין חברה משויכת.' });
    }

    try {
        const url = req.url.split('?')[0];

        // POST — upload new file
        if (req.method === 'POST') {
            const { insurer, fileName, csvBase64, replaceExisting } = req.body;
            if (!insurer || !csvBase64) return res.status(400).json({ message: 'חסר insurer או csvBase64.' });

            const iconv = getIconv();
            if (!iconv) return res.status(500).json({ message: 'iconv-lite לא זמין בשרת.' });

            const buf = Buffer.from(csvBase64, 'base64');
            const fmt = detectFormat(fileName, buf);
            let parsed = [];

            if (fmt === 'xls') {
                parsed = parseShlomoXLS(buf);
            } else if (fmt === 'html') {
                const text = iconv.decode(buf, 'win1255');
                parsed = parseHachsharaHTML(text);
            } else if (fmt === 'fl') {
                parsed = parseFLBuffer(buf, iconv);
            } else {
                const text = iconv.decode(buf, 'win1255');
                parsed = parseMenoraCSV(text);
            }

            if (parsed.length === 0) return res.status(400).json({ message: 'לא נמצאו שורות תקפות בקובץ. (פורמט מזוהה: ' + fmt + ')' });

            const agreement = await CommissionAgreement.findOne({ companyId, insurer, isActive: true }).lean();
            const rateMap = buildRateMap(agreement);

            const monthsCovered = [...new Set(parsed.map(p => p.productionYearMonth).filter(Boolean))].sort();

            // If replaceExisting: delete records for this insurer + months covered
            if (replaceExisting) {
                await ProductionRecord.deleteMany({
                    companyId, insurer, productionYearMonth: { $in: monthsCovered }
                });
            }

            const upload = await ProductionUpload.create({
                companyId, insurer,
                fileName: fileName || 'untitled.csv',
                rowCount: parsed.length,
                monthsCovered,
                uploadedBy: user._id
            });

            let totalNet = 0, totalCommission = 0, totalExpected = 0, totalGap = 0;
            const docs = parsed.map(p => {
                const expectedRate = rateMap.has(p.branchCode) ? rateMap.get(p.branchCode) : null;
                const expectedCommission = expectedRate !== null ? (p.netPremium * expectedRate / 100) : null;
                const commissionGap = expectedCommission !== null ? (p.commissionPaid - expectedCommission) : null;

                totalNet += p.netPremium;
                totalCommission += p.commissionPaid;
                if (expectedCommission !== null) {
                    totalExpected += expectedCommission;
                    totalGap += commissionGap;
                }

                return {
                    companyId, insurer,
                    productionMonth: p.productionMonth,
                    productionYearMonth: p.productionYearMonth,
                    policyNumber: p.policyNumber,
                    licenseNumber: p.licenseNumber,
                    branchCode: p.branchCode,
                    branchName: p.branchName,
                    insuredName: p.insuredName,
                    insuredId: p.insuredId,
                    customerNumber: p.customerNumber,
                    transactionType: p.transactionType,
                    startDate: p.startDate,
                    endDate: p.endDate,
                    netPremium: p.netPremium,
                    fees: p.fees,
                    grossPremium: p.grossPremium,
                    creditFees: p.creditFees,
                    grossWithCreditFees: p.grossWithCreditFees,
                    commissionPaid: p.commissionPaid,
                    commissionManual: p.commissionManual,
                    commissionDifferential: p.commissionDifferential,
                    expectedRate,
                    expectedCommission,
                    commissionGap,
                    raw: p,
                    uploadId: upload._id
                };
            });

            await ProductionRecord.insertMany(docs);

            upload.totalNetPremium = totalNet;
            upload.totalCommission = totalCommission;
            upload.totalExpectedCommission = totalExpected;
            upload.totalGap = totalGap;
            await upload.save();

            return res.status(201).json({
                message: 'העלאה הצליחה',
                upload,
                rowsImported: docs.length
            });
        }

        // GET /production/uploads — list of uploads
        if (req.method === 'GET' && url.endsWith('/uploads')) {
            const uploads = await ProductionUpload.find({ companyId }).sort({ createdAt: -1 }).lean();
            return res.json(uploads);
        }

        // GET /production — records (with optional filters)
        if (req.method === 'GET') {
            const { insurer, month, branchCode } = req.query;
            const q = { companyId };
            if (insurer) q.insurer = insurer;
            if (month) q.productionYearMonth = month;
            if (branchCode) q.branchCode = branchCode;

            const records = await ProductionRecord.find(q).sort({ productionYearMonth: -1 }).limit(2000).lean();

            // Aggregate summary
            const summary = {
                totalRecords: records.length,
                totalNetPremium: 0,
                totalCommission: 0,
                totalExpectedCommission: 0,
                totalGap: 0,
                byBranch: {},
                byMonth: {},
                byInsurer: {}
            };
            for (const r of records) {
                summary.totalNetPremium += r.netPremium || 0;
                summary.totalCommission += r.commissionPaid || 0;
                if (r.expectedCommission !== null && r.expectedCommission !== undefined) {
                    summary.totalExpectedCommission += r.expectedCommission;
                    summary.totalGap += r.commissionGap || 0;
                }

                const bkey = r.branchCode + ' - ' + (r.branchName || '');
                summary.byBranch[bkey] = summary.byBranch[bkey] || { count: 0, premium: 0, commission: 0, expected: 0, gap: 0 };
                summary.byBranch[bkey].count++;
                summary.byBranch[bkey].premium += r.netPremium || 0;
                summary.byBranch[bkey].commission += r.commissionPaid || 0;
                if (r.expectedCommission !== null && r.expectedCommission !== undefined) {
                    summary.byBranch[bkey].expected += r.expectedCommission;
                    summary.byBranch[bkey].gap += r.commissionGap || 0;
                }

                const mkey = r.productionYearMonth || '?';
                summary.byMonth[mkey] = summary.byMonth[mkey] || { count: 0, premium: 0, commission: 0 };
                summary.byMonth[mkey].count++;
                summary.byMonth[mkey].premium += r.netPremium || 0;
                summary.byMonth[mkey].commission += r.commissionPaid || 0;

                summary.byInsurer[r.insurer] = summary.byInsurer[r.insurer] || { count: 0, premium: 0, commission: 0 };
                summary.byInsurer[r.insurer].count++;
                summary.byInsurer[r.insurer].premium += r.netPremium || 0;
                summary.byInsurer[r.insurer].commission += r.commissionPaid || 0;
            }

            return res.json({ records, summary });
        }

        // DELETE /production/uploads/:id — delete an upload + its records
        if (req.method === 'DELETE') {
            if (user.role !== 'admin' && String(user.companyId) !== companyId) {
                return res.status(403).json({ message: 'אין הרשאה.' });
            }
            const segments = url.split('/').filter(Boolean);
            const uploadId = segments[segments.length - 1];
            if (!uploadId || uploadId === 'production') return res.status(400).json({ message: 'חסר מזהה העלאה.' });

            const upload = await ProductionUpload.findOne({ _id: uploadId, companyId });
            if (!upload) return res.status(404).json({ message: 'לא נמצאה העלאה.' });

            await ProductionRecord.deleteMany({ uploadId: upload._id });
            await ProductionUpload.deleteOne({ _id: upload._id });
            return res.json({ message: 'נמחק.' });
        }

        return res.status(405).json({ message: 'Method not allowed' });
    } catch (err) {
        console.error('Production API error:', err);
        return res.status(500).json({ message: 'שגיאת שרת.', debug: { name: err.name, message: err.message } });
    }
};
