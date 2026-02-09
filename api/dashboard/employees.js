const connectDB = require('../_lib/db');
const { Employee } = require('../_lib/models');
const { verifyAuth, cors } = require('../_lib/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = await verifyAuth(req);
    if (!user || user.role !== 'company') return res.status(403).json({ message: 'אין הרשאה.' });

    try {
        await connectDB();
        const employees = await Employee.find({ companyId: user.companyId, isActive: true }).sort({ firstName: 1 });
        res.json(employees);
    } catch (error) {
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
};
