const { verifyAuth, cors } = require('../_lib/auth');
const connectDB = require('../_lib/db');
const { ProductionRecord, ProductionUpload, CommissionAgreement } = require('../_lib/models');

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
// Returns array of normalized records
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
            const text = iconv.decode(buf, 'win1255');
            const parsed = parseMenoraCSV(text);
            if (parsed.length === 0) return res.status(400).json({ message: 'לא נמצאו שורות תקפות בקובץ.' });

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
