const { verifyAuth, cors } = require('../_lib/auth');
const connectDB = require('../_lib/db');
const { CommissionAgreement, Company } = require('../_lib/models');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    await connectDB();
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ message: 'אין הרשאת גישה.' });

    // Determine which company's commissions to access:
    // - admin: any company via ?companyId=
    // - company user: only their own
    let companyId;
    if (user.role === 'admin') {
        companyId = req.query.companyId;
        if (!companyId) return res.status(400).json({ message: 'companyId חסר.' });
    } else {
        companyId = String(user.companyId || '');
        if (!companyId) return res.status(403).json({ message: 'אין חברה משויכת.' });
    }

    const url = req.url.split('?')[0];
    const segments = url.split('/').filter(Boolean);
    const agreementId = segments[segments.length - 1] !== 'commissions' ? segments[segments.length - 1] : null;

    try {
        // GET — list all agreements for company, or a single agreement
        if (req.method === 'GET') {
            if (agreementId) {
                const ag = await CommissionAgreement.findOne({ _id: agreementId, companyId }).lean();
                if (!ag) return res.status(404).json({ message: 'לא נמצא.' });
                return res.json(ag);
            }
            const list = await CommissionAgreement.find({ companyId, isActive: true })
                .sort({ insurer: 1 })
                .lean();
            return res.json(list);
        }

        // POST — create new agreement (admin only)
        if (req.method === 'POST') {
            if (user.role !== 'admin') return res.status(403).json({ message: 'מותר רק לאדמין.' });
            const { insurer, branch, effectiveDate, agentCode, agentCodeSecondary, documentRef, rates, notes } = req.body;
            if (!insurer) return res.status(400).json({ message: 'חסר שם חברת ביטוח.' });

            const ag = await CommissionAgreement.create({
                companyId,
                insurer: insurer.trim(),
                branch: branch || 'אלמנטרי',
                effectiveDate: effectiveDate || null,
                agentCode: agentCode || '',
                agentCodeSecondary: agentCodeSecondary || '',
                documentRef: documentRef || '',
                rates: Array.isArray(rates) ? rates : [],
                notes: Array.isArray(notes) ? notes : (notes ? [notes] : []),
                isActive: true
            });
            return res.status(201).json(ag);
        }

        // PUT — update agreement (admin only)
        if (req.method === 'PUT') {
            if (user.role !== 'admin') return res.status(403).json({ message: 'מותר רק לאדמין.' });
            if (!agreementId) return res.status(400).json({ message: 'חסר מזהה הסכם.' });

            const ag = await CommissionAgreement.findOne({ _id: agreementId, companyId });
            if (!ag) return res.status(404).json({ message: 'לא נמצא.' });

            const { insurer, branch, effectiveDate, agentCode, agentCodeSecondary, documentRef, rates, notes, isActive } = req.body;
            if (insurer !== undefined) ag.insurer = insurer.trim();
            if (branch !== undefined) ag.branch = branch;
            if (effectiveDate !== undefined) ag.effectiveDate = effectiveDate || null;
            if (agentCode !== undefined) ag.agentCode = agentCode;
            if (agentCodeSecondary !== undefined) ag.agentCodeSecondary = agentCodeSecondary;
            if (documentRef !== undefined) ag.documentRef = documentRef;
            if (Array.isArray(rates)) ag.rates = rates;
            if (notes !== undefined) ag.notes = Array.isArray(notes) ? notes : (notes ? [notes] : []);
            if (isActive !== undefined) ag.isActive = isActive;

            await ag.save();
            return res.json(ag);
        }

        // DELETE — soft-delete (admin only)
        if (req.method === 'DELETE') {
            if (user.role !== 'admin') return res.status(403).json({ message: 'מותר רק לאדמין.' });
            if (!agreementId) return res.status(400).json({ message: 'חסר מזהה הסכם.' });

            const ag = await CommissionAgreement.findOneAndUpdate(
                { _id: agreementId, companyId },
                { isActive: false },
                { new: true }
            );
            if (!ag) return res.status(404).json({ message: 'לא נמצא.' });
            return res.json({ message: 'נמחק.' });
        }

        return res.status(405).json({ message: 'Method not allowed' });
    } catch (err) {
        console.error('Commissions API error:', err);
        return res.status(500).json({ message: 'שגיאת שרת.' });
    }
};
