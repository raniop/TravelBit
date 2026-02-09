const connectDB = require('../_lib/db');
const { Company, Employee, Trip, Policy } = require('../_lib/models');
const { verifyAuth, cors } = require('../_lib/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = await verifyAuth(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ message: 'אין הרשאה.' });

    try {
        await connectDB();
        const [companies, employees, activeTrips, expiringPolicies] = await Promise.all([
            Company.countDocuments({ isActive: true }),
            Employee.countDocuments({ isActive: true }),
            Trip.countDocuments({ status: 'active' }),
            Policy.countDocuments({
                expirationDate: { $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
                status: { $ne: 'expired' }
            })
        ]);
        res.json({ companies, employees, activeTrips, expiringPolicies });
    } catch (error) {
        console.error('Admin stats error:', error);
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
};
