const connectDB = require('../_lib/db');
const { Policy } = require('../_lib/models');
const { verifyAuth, cors } = require('../_lib/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = await verifyAuth(req);
    if (!user || user.role !== 'company') return res.status(403).json({ message: 'אין הרשאה.' });

    try {
        await connectDB();
        const policies = await Policy.find({ companyId: user.companyId }).sort({ expirationDate: 1 });

        const alerts = policies.map(policy => {
            const daysLeft = policy.daysUntilExpiration;
            let severity = 'ok';
            if (daysLeft <= 0) severity = 'expired';
            else if (daysLeft <= 7) severity = 'critical';
            else if (daysLeft <= 30) severity = 'warning';
            return { ...policy.toJSON(), severity, daysLeft };
        });

        const summary = {
            total: alerts.length,
            expired: alerts.filter(a => a.severity === 'expired').length,
            critical: alerts.filter(a => a.severity === 'critical').length,
            warning: alerts.filter(a => a.severity === 'warning').length,
            ok: alerts.filter(a => a.severity === 'ok').length
        };

        res.json({ alerts, summary });
    } catch (error) {
        console.error('Alerts error:', error);
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
};
