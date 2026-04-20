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

// Shlomo XLS uses numeric branch codes only (no Hebrew name in the sheet).
// Standard elementary insurance product codes mapped to display names.
const SHLOMO_BRANCH_NAMES = {
    '31':  'אופנוע',
    '100': 'רכב פרטי',
    '113': 'חובה רכב פרטי',
    '114': 'מקיף רכב פרטי',
    '120': "צד ג' רכב פרטי",
    '210': 'דירה',
    '820': 'חבות מעבידים',
    '850': 'עסק',
    '910': 'תאונות אישיות',
    '920': 'בריאות / תאונות'
};

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
            branchName: SHLOMO_BRANCH_NAMES[branchCode] || '',
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

// Parse "דוח קליטת פרודוקציה" HTML report.
// Generic plaintext-in-HTML format produced by the agent's intake tool — observed for
// Migdal, Harel, Shirbit, and Hachshara. Always preferred over raw FL files.
//
// Layout per customer:
//   [customer name]
//   ת.ז.: [id] כתובת: [...]
//   פוליסות:
//       [policy]-[suffix] תאריך תחילה: [d] תאריך סיום: [d]
//       פרמיה: [amount] סוג ביטוח: [type]
function parseProductionHTML(text) {
    // Strip HTML wrapper
    const m = text.match(/<pre[^>]*>([\s\S]+?)<\/pre>/i);
    const body = m ? m[1] : text;

    // Detected insurer from title — surfaced for UI sanity check
    const insurerMatch = body.match(/קליטת פרודוקציה מחברת ביטוח\s+([^\n]+?)(?:\n|$)/);
    const detectedInsurer = insurerMatch ? insurerMatch[1].replace(/ביטוח\s*$/, '').trim() : null;

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

        // Extract all policy entries.
        // Pattern: "POLICY-SUFFIX[/SUBID] תאריך תחילה: DATE תאריך סיום: DATE\n    פרמיה: AMOUNT   סוג ביטוח: TYPE"
        // Some Migdal/Harel exports append "/NNNN" after the 2-digit suffix (e.g. 103802450725-00/0006).
        // Use ` +` (space-only) inside-line — \s would consume newlines and capture content from
        // the next block (saw `</body></html>` getting captured when סוג ביטוח was empty).
        const policyRegex = /(\d{8,})-(\d{2})(?:\/\d+)? +תאריך תחילה: *(\d{1,2}\/\d{1,2}\/\d{4}) +תאריך סיום: *(\d{1,2}\/\d{1,2}\/\d{4})[^\n]*\n[^\n]*פרמיה: *(-?[\d.]+)[^\n]*סוג ביטוח: *([^\n<]*?) *(?:\n|$)/g;

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
                commissionDifferential: 0,
                detectedInsurer
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
// cp862 (DOS Hebrew), fixed-width ~198-char records, Hebrew text REVERSED.
//
// TWO RECORD-TYPE DIALECTS observed in the wild:
//
// MIGDAL-style (006-prefix files, types 0010/0021/0070/0101/0103/0200/0300/0371):
//   0010 = block header (date)        0021 = customer (ID + name + address)
//   0070 = period info                0100/0101/0103/6101 = policy header
//                                       — premium at pos 73-81 in agorot
//   0200 = coverage description       0300 = totals breakdown
//   0371/0372 = commission footer     — commission at body offset 33 / 100 → NIS
//
// HAREL-style (025-prefix files, types 0001/0002/0007/0008/0009/0010/0020/0030):
//   0001 = block header (date)        0002 = customer (ID + name)
//   0007 = period                     0008 = premium item
//   0009 = commission line            — commission chunk at offset 144 / 10000 → NIS
//   0010 = vehicle info (license, model name)
//   0020 = coverage line              0030 = totals
//                                       — code 15 (16-char chunks) / 100 → NIS
//
// Block key = chars 14-30. Production date at body of first 0010 / 0001 record (YYMMDD).
function parseFLBuffer(buffer, iconv) {
    const text = iconv.decode(buffer, 'cp862');
    const lines = text.split(/\r?\n/).filter(l => l.length > 50);
    if (lines.length === 0) return [];

    // Detect dialect by record types
    const types = new Set();
    for (const l of lines) types.add(l.substring(30, 38).slice(-4));
    const isHarel = types.has('0030') && !types.has('0300');

    // Production year-month from first block header
    let prodYM = null, prodMonth = null;
    const headerType = isHarel ? '0001' : '0010';
    const firstHeader = lines.find(l => l.substring(30, 38).slice(-4) === headerType);
    if (firstHeader) {
        const m = firstHeader.substring(38).match(/^0+([2-3]\d)([0-1]\d)([0-3]\d)/);
        if (m) {
            prodYM = '20' + m[1] + '-' + m[2];
            const monthAbbrs = ['ינו','פבר','מרץ','אפר','מאי','יונ','יול','אוג','ספט','אוק','נוב','דצמ'];
            prodMonth = monthAbbrs[parseInt(m[2], 10) - 1] + '-' + m[1];
        }
    }

    const blockMap = new Map();
    for (const line of lines) {
        if (line.length < 40) continue;
        const blockKey = line.substring(14, 30);
        const typeShort = line.substring(30, 38).slice(-4);
        let block = blockMap.get(blockKey);
        if (!block) {
            block = { blockKey, types: {}, coverages: [] };
            blockMap.set(blockKey, block);
        }
        if (!block.types[typeShort]) block.types[typeShort] = line;
        const covType = isHarel ? '0020' : '0200';
        if (typeShort === covType) {
            const heb = line.substring(38, 100).match(/[\u0590-\u05FF\s]{3,}/);
            if (heb) {
                const name = reverseHebrew(heb[0].trim());
                if (name && !block.coverages.includes(name)) block.coverages.push(name);
            }
        }
    }

    const records = [];
    const seenKeys = new Set();
    for (const b of blockMap.values()) {
        const r = {
            productionMonth: prodMonth,
            productionYearMonth: prodYM,
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

        if (isHarel) extractHarelBlock(b, r); else extractMigdalBlock(b, r);

        if (!r.policyNumber) r.policyNumber = b.blockKey.replace(/^0+/, '') || b.blockKey;
        if (!r.branchName && b.coverages.length) r.branchName = b.coverages[0];
        if (!r.insuredName && r.netPremium === 0 && !r.licenseNumber) continue;

        const dedupKey = r.policyNumber + '|' + r.netPremium + '|' + r.insuredName;
        if (seenKeys.has(dedupKey)) continue;
        seenKeys.add(dedupKey);
        records.push(r);
    }
    return records;
}

function extractMigdalBlock(b, r) {
    const t = b.types;

    // Customer in 0021 / 6021 (6XXX variants appear in same file as renewal-prefix records).
    const cust = t['0021'] || t['6021'];
    if (cust) {
        const id = cust.substring(38, 50).match(/(\d{9,10})/);
        if (id) r.insuredId = id[1].replace(/^0+/, '') || id[1];
        const heb = cust.substring(50, 130).match(/[\u0590-\u05FF\s]{3,}/);
        if (heb) r.insuredName = reverseHebrew(heb[0].trim());
    }

    const pol = t['0103'] || t['0101'] || t['0100'] || t['6101'] || t['6103'] || t['6100'];
    if (pol) {
        const polMatch = pol.substring(38, 50).match(/(\d{6,10})/);
        if (polMatch) r.policyNumber = polMatch[1].replace(/^0+/, '') || polMatch[1];

        const heb = pol.substring(50, 73).match(/[\u0590-\u05FF\s]{3,}/);
        if (heb) r.branchName = reverseHebrew(heb[0].trim());

        const premStr = pol.substring(73, 81).replace(/[^0-9]/g, '');
        if (premStr.length >= 6) {
            const nis = parseInt(premStr, 10) / 100;
            if (nis > 0 && nis < 500000) r.netPremium = nis;
        }

        const lic = pol.substring(85, 130).match(/(\d{7,8})/);
        if (lic) r.licenseNumber = lic[1].replace(/^0+/, '') || lic[1];
    }

    r.grossPremium = r.netPremium;
    r.grossWithCreditFees = r.netPremium;

    // Commission only from 0371 / 6371 (primary). 0370/0372 are auxiliary records
    // with different field semantics — extracting from them produces garbage.
    // Body layout: '1' prefix + 16-char chunks of (14-digit amount + 2-digit padding).
    // Chunk #3 carries commission as a 10-digit amount (offset 33-43) at 2 implied decimals.
    const comm = t['0371'] || t['6371'];
    if (comm) {
        const body = comm.substring(38);
        const cAg = parseInt(body.substring(33, 43), 10);
        if (!isNaN(cAg) && cAg > 0 && cAg < 100000000) {
            r.commissionPaid = cAg / 100;
        }
    }
}

function extractHarelBlock(b, r) {
    const t = b.types;

    const cust = t['0002'];
    if (cust) {
        const id = cust.substring(38, 56).match(/(\d{9})/);
        if (id) r.insuredId = id[1];
        const heb = cust.substring(50, 130).match(/[\u0590-\u05FF\s]{3,}/);
        if (heb) r.insuredName = reverseHebrew(heb[0].trim());
    }

    // Policy number: block key chars 2-10 hold the canonical 8-digit policy id
    // (e.g. "0025207607026020" → "25207607"). Same number is repeated inside several records.
    const polFromKey = b.blockKey.substring(2, 10);
    if (/^\d{8}$/.test(polFromKey)) r.policyNumber = polFromKey;

    const veh = t['0010'];
    if (veh) {
        if (!r.policyNumber) {
            const polMatch = veh.substring(38, 50).match(/(\d{6,10})/);
            if (polMatch) r.policyNumber = polMatch[1].replace(/^0+/, '') || polMatch[1];
        }
        const heb = veh.substring(50, 80).match(/[\u0590-\u05FF\s]{3,}/);
        if (heb) r.branchName = reverseHebrew(heb[0].trim());
        // License plate is the last 7-8 digit run before trailing zeros
        const allNums = veh.substring(80, 130).match(/\d{7,8}/g) || [];
        if (allNums.length) r.licenseNumber = allNums[allNums.length - 1].replace(/^0+/, '') || allNums[allNums.length - 1];
    }

    // Totals 0030: 16-char chunks of (2-digit code + 14-digit amount). Code 15 = total premium /100.
    // Some non-vehicle blocks (e.g. home insurance) use a 3-digit code variant where the parse
    // yields huge numbers — clamp anything above 500K NIS (=5e7 in agorot) to filter junk.
    const totals = t['0030'];
    if (totals) {
        const body = totals.substring(38);
        let total = 0, base = 0;
        for (let i = 0; i + 16 <= body.length; i += 16) {
            const code = body.substring(i, i + 2);
            const amt = parseInt(body.substring(i + 2, i + 16), 10);
            if (isNaN(amt) || amt < 0 || amt > 5e7) continue;
            if (code === '01') base = amt / 100;
            if (code === '15') total = amt / 100;
        }
        r.netPremium = total || base;
        r.grossPremium = r.netPremium;
        r.grossWithCreditFees = r.netPremium;
    }

    // Commission 0009: scan 16-char chunks, last non-zero chunk holds commission with 10 implied decimals.
    // Observed across blocks: chunk like "0000475604000000" (raw int 475604000000) → 47.5604 NIS.
    const comm = t['0009'];
    if (comm) {
        const body = comm.substring(38);
        let lastVal = 0;
        for (let i = 0; i + 16 <= body.length; i += 16) {
            const v = parseInt(body.substring(i, i + 16), 10);
            if (!isNaN(v) && v > 100 && v < 1e15) lastVal = v;
        }
        if (lastVal > 0) r.commissionPaid = lastVal / 1e10;
    }
}

// Auto-detect format by file extension or content sniff.
// Returns 'fl' for FL files, 'fl-zip' for FL packed in a ZIP (e.g. Harel C* file in smsdir).
// XLSX files are also ZIP-prefixed; we tell them apart by extension first, then by ZIP entry names.
function detectFormat(fileName, buffer) {
    const lower = (fileName || '').toLowerCase();
    if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
    if (lower.endsWith('.csv') || lower.endsWith('.txt')) return 'csv';
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xls';
    if (lower.endsWith('.fl')) return 'fl';
    if (lower.endsWith('.zip')) return 'fl-zip';
    // sniff by content
    if (buffer && buffer.length >= 5) {
        const firstBytes = buffer.slice(0, 100).toString('ascii').toLowerCase();
        if (/<html|<!doctype/i.test(firstBytes)) return 'html';
        if (buffer[0] === 0x50 && buffer[1] === 0x4B) return 'fl-zip'; // PK ZIP
        if (buffer[0] === 0xD0 && buffer[1] === 0xCF) return 'xls'; // OLE2 (XLS)
    }
    return 'csv';
}

// Extract the FL data file from a ZIP archive (Harel format: smsdir/<agent>/C*.NN)
async function extractFLFromZip(buffer) {
    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(buffer);
    let target = null;
    zip.forEach((path, file) => {
        if (file.dir) return;
        const base = path.split('/').pop();
        // Prefer files matching C[0-9]+.[0-9]+ (Harel data file pattern)
        if (/^C\d+\.\d+$/i.test(base)) { target = file; return; }
        if (!target && /\.fl$/i.test(base)) target = file;
    });
    if (!target) {
        // Fallback: largest non-trivial entry
        let largest = null, size = 0;
        zip.forEach((path, file) => {
            if (file.dir) return;
            const s = file._data ? file._data.uncompressedSize : 0;
            if (s > size) { size = s; largest = file; }
        });
        target = largest;
    }
    if (!target) throw new Error('לא נמצא קובץ FL בתוך ה-ZIP');
    return await target.async('nodebuffer');
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
                parsed = parseProductionHTML(text);
            } else if (fmt === 'fl') {
                parsed = parseFLBuffer(buf, iconv);
            } else if (fmt === 'fl-zip') {
                const flBuf = await extractFLFromZip(buf);
                parsed = parseFLBuffer(flBuf, iconv);
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

                // Build a friendly branch key: prefer "code - name" when both differ;
                // collapse to single side when one is missing or duplicated.
                const code = (r.branchCode || '').trim();
                const name = (r.branchName || '').trim();
                let bkey;
                if (code && name && code !== name) bkey = code + ' - ' + name;
                else bkey = name || code || 'לא ידוע';
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
