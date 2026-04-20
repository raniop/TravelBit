const { verifyAuth, cors } = require('../_lib/auth');
const connectDB = require('../_lib/db');
const { LifeHealthCommissionEntry, LifeHealthCommissionUpload } = require('../_lib/models');
const XLSX = require('xlsx');

function parseDateDMY(s) {
    if (!s) return null;
    if (s instanceof Date) return s;
    const m = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (!m) return null;
    let y = parseInt(m[3]);
    if (y < 100) y += 2000;
    return new Date(y, parseInt(m[2]) - 1, parseInt(m[1]));
}

function parseExcelDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return v;
    if (typeof v === 'number' && v > 0) {
        // XLSX serial date — days since 1900-01-01 (with the Lotus 1900 bug)
        const epoch = Date.UTC(1899, 11, 30);
        return new Date(epoch + v * 86400000);
    }
    return parseDateDMY(v);
}

function parseNumber(v) {
    if (v == null || v === '' || v === '-') return 0;
    const n = parseFloat(String(v).replace(/[,₪\s]/g, ''));
    return isNaN(n) ? 0 : n;
}

// Categorize a transaction by its description text.
function categorize(desc) {
    const d = String(desc || '');
    if (/תשלום\s*עמלה/.test(d)) return 'commission';
    if (/תשלום\s*מע/.test(d)) return 'vat-paid';
    if (/זיכוי\s*מע/.test(d)) return 'vat-credit';
    if (/מקדמ/.test(d)) return 'advance';
    return 'other';
}

// Parse the "פירוט תנועות עו"ש - עמלות שוטפות" XLSX format.
// Header row (row 0): תאריך ערך | תיאור תנועה | סכום חובה | זכות | יתרה לתאריך ערך | תאריך הזנת תנועה | מספר סוכן | שם סוכן | בעלים
function parseBankStatementXLSX(buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (rows.length < 2) return [];

    // Find header row (look for "תאריך ערך" or "תאריך פרעון")
    let headerIdx = -1;
    for (let i = 0; i < Math.min(5, rows.length); i++) {
        if (rows[i] && rows[i].some(c => /תאריך\s*(ערך|פרעון)/.test(String(c || '')))) {
            headerIdx = i;
            break;
        }
    }
    if (headerIdx < 0) return [];

    const records = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.length < 4) continue;
        const valueDate = parseExcelDate(r[0]);
        if (!valueDate) continue;
        const description = String(r[1] || '').trim();
        if (!description) continue;
        const debit = parseNumber(r[2]);
        const credit = parseNumber(r[3]);
        const balance = r[4] !== '' && r[4] !== null && r[4] !== undefined ? parseNumber(r[4]) : null;
        const postingDate = parseExcelDate(r[5]) || valueDate;
        const agentCode = String(r[6] || '').trim();
        const agentName = String(r[7] || '').trim();
        const ownerId = String(r[8] || '').trim();
        const yearMonth = valueDate.getFullYear() + '-' + String(valueDate.getMonth() + 1).padStart(2, '0');

        records.push({
            valueDate, postingDate, yearMonth,
            description, debit, credit, balance,
            agentCode, agentName, ownerId,
            category: categorize(description)
        });
    }
    return records;
}

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    await connectDB();
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ message: 'אין הרשאת גישה.' });

    let companyId;
    if (user.role === 'admin') {
        companyId = req.query.companyId || (req.body && req.body.companyId);
        if (!companyId && req.method !== 'POST') return res.status(400).json({ message: 'companyId חסר.' });
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

            const buf = Buffer.from(csvBase64, 'base64');
            const parsed = parseBankStatementXLSX(buf);
            if (parsed.length === 0) return res.status(400).json({ message: 'לא נמצאו תנועות בקובץ.' });

            const monthsCovered = [...new Set(parsed.map(p => p.yearMonth))].sort();
            if (replaceExisting) {
                await LifeHealthCommissionEntry.deleteMany({
                    companyId, insurer, yearMonth: { $in: monthsCovered }
                });
            }

            const upload = await LifeHealthCommissionUpload.create({
                companyId, insurer,
                fileName: fileName || 'untitled.xlsx',
                rowCount: parsed.length,
                monthsCovered,
                uploadedBy: user._id
            });

            // The file is the insurer's settlement ledger:
            //   debit  = "we paid the agent"  (money out of insurer = INTO agent's bank)
            //   credit = "we owe the agent"   (accrual, not yet paid)
            // For "money in bank" we sum DEBIT for commission/VAT-payment rows.
            let totalCommission = 0, totalVatPaid = 0, totalVatCredit = 0;
            const docs = parsed.map(p => {
                if (p.category === 'commission') totalCommission += (p.debit || 0);
                if (p.category === 'vat-paid')   totalVatPaid   += (p.debit || 0);
                if (p.category === 'vat-credit') totalVatCredit += (p.credit || 0);
                return { companyId, insurer, ...p, raw: p, uploadId: upload._id };
            });
            await LifeHealthCommissionEntry.insertMany(docs);

            upload.totalCommission = totalCommission;
            upload.totalVatPaid = totalVatPaid;
            upload.totalVatCredit = totalVatCredit;
            // Net cash that hit the bank account: commission paid + VAT paid - VAT credited back.
            upload.totalNet = totalCommission + totalVatPaid - totalVatCredit;
            await upload.save();

            return res.status(201).json({ message: 'העלאה הצליחה', upload, rowsImported: docs.length });
        }

        if (req.method === 'GET' && url.endsWith('/uploads')) {
            const uploads = await LifeHealthCommissionUpload.find({ companyId }).sort({ createdAt: -1 }).lean();
            return res.json(uploads);
        }

        if (req.method === 'GET') {
            const { insurer, month } = req.query;
            const q = { companyId };
            if (insurer) q.insurer = insurer;
            if (month) q.yearMonth = month;
            const entries = await LifeHealthCommissionEntry.find(q).sort({ valueDate: -1 }).limit(5000).lean();

            // Insurer-side ledger: debit = paid to agent (money in bank).
            const summary = {
                totalEntries: entries.length,
                totalCommission: 0, totalVatPaid: 0, totalVatCredit: 0, totalAdvance: 0, totalOther: 0,
                totalNet: 0,
                byMonth: {}, byInsurer: {}, byAgent: {}, byCategory: {}
            };
            for (const e of entries) {
                if (e.category === 'commission') summary.totalCommission += (e.debit || 0);
                else if (e.category === 'vat-paid') summary.totalVatPaid += (e.debit || 0);
                else if (e.category === 'vat-credit') summary.totalVatCredit += (e.credit || 0);
                else if (e.category === 'advance') summary.totalAdvance += ((e.debit || 0) - (e.credit || 0));
                else summary.totalOther += ((e.debit || 0) - (e.credit || 0));

                const mk = e.yearMonth || '?';
                summary.byMonth[mk] = summary.byMonth[mk] || { count: 0, commission: 0, vatPaid: 0, vatCredit: 0, net: 0 };
                summary.byMonth[mk].count++;
                if (e.category === 'commission') summary.byMonth[mk].commission += (e.debit || 0);
                if (e.category === 'vat-paid') summary.byMonth[mk].vatPaid += (e.debit || 0);
                if (e.category === 'vat-credit') summary.byMonth[mk].vatCredit += (e.credit || 0);
                summary.byMonth[mk].net = summary.byMonth[mk].commission + summary.byMonth[mk].vatPaid - summary.byMonth[mk].vatCredit;

                summary.byInsurer[e.insurer] = summary.byInsurer[e.insurer] || { count: 0, commission: 0, net: 0 };
                summary.byInsurer[e.insurer].count++;
                if (e.category === 'commission') summary.byInsurer[e.insurer].commission += (e.debit || 0);

                const ak = (e.agentCode || '?') + (e.agentName ? ' - ' + e.agentName : '');
                summary.byAgent[ak] = summary.byAgent[ak] || { count: 0, commission: 0 };
                summary.byAgent[ak].count++;
                if (e.category === 'commission') summary.byAgent[ak].commission += (e.debit || 0);

                summary.byCategory[e.category || 'other'] = (summary.byCategory[e.category || 'other'] || 0) + 1;
            }
            summary.totalNet = summary.totalCommission + summary.totalVatPaid - summary.totalVatCredit;
            for (const k of Object.keys(summary.byInsurer)) {
                const v = summary.byInsurer[k];
                v.net = v.commission;
            }

            return res.json({ entries, summary });
        }

        if (req.method === 'DELETE') {
            const segments = url.split('/').filter(Boolean);
            const uploadId = segments[segments.length - 1];
            if (!uploadId || uploadId === 'life-health-commissions') return res.status(400).json({ message: 'חסר מזהה העלאה.' });
            const upload = await LifeHealthCommissionUpload.findOne({ _id: uploadId, companyId });
            if (!upload) return res.status(404).json({ message: 'לא נמצאה העלאה.' });
            await LifeHealthCommissionEntry.deleteMany({ uploadId: upload._id });
            await LifeHealthCommissionUpload.deleteOne({ _id: upload._id });
            return res.json({ message: 'נמחק.' });
        }

        return res.status(405).json({ message: 'Method not allowed' });
    } catch (err) {
        console.error('Life-Health commissions API error:', err);
        return res.status(500).json({ message: 'שגיאת שרת.', debug: { name: err.name, message: err.message } });
    }
};
