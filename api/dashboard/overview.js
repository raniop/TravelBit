const mongoose = require('mongoose');
const connectDB = require('../_lib/db');
const { Employee, Trip, Policy } = require('../_lib/models');
const { verifyAuth, cors } = require('../_lib/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ message: 'אין הרשאת גישה.' });
    if (user.role !== 'company') return res.status(403).json({ message: 'אין הרשאה.' });

    try {
        await connectDB();
        const companyId = user.companyId;
        // ObjectId for aggregate $match (string won't match)
        const companyOid = new mongoose.Types.ObjectId(companyId);

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        // All 9 queries in ONE parallel batch
        const [
            totalEmployees,
            activeTrips,
            monthTrips,
            expiringPolicies,
            totalCostResult,
            workdaysResult,
            recentTrips,
            tripsByMonth,
            topDestinations
        ] = await Promise.all([
            Employee.countDocuments({ companyId, isActive: true }),
            Trip.countDocuments({ companyId, status: 'active' }),
            Trip.countDocuments({ companyId, departureDate: { $gte: startOfMonth } }),
            Policy.countDocuments({ companyId, expirationDate: { $lte: new Date(Date.now() + 30*24*60*60*1000) }, status: { $ne: 'expired' } }),
            Trip.aggregate([{ $match: { companyId: companyOid } }, { $group: { _id: null, total: { $sum: '$cost' } } }]),
            Trip.aggregate([
                { $match: { companyId: companyOid, departureDate: { $gte: startOfMonth } } },
                { $group: { _id: null, totalDays: { $sum: '$workdaysAbroad' } } }
            ]),
            Trip.find({ companyId }).populate('employeeId', 'firstName lastName').sort({ departureDate: -1 }).limit(10),
            Trip.aggregate([
                { $match: { companyId: companyOid, departureDate: { $gte: sixMonthsAgo } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$departureDate' } }, count: { $sum: 1 }, totalCost: { $sum: '$cost' } } },
                { $sort: { _id: 1 } }
            ]),
            Trip.aggregate([
                { $match: { companyId: companyOid } },
                { $group: { _id: '$destination', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 5 }
            ])
        ]);

        res.json({
            stats: {
                totalEmployees, activeTrips, monthTrips, expiringPolicies,
                totalCost: totalCostResult[0]?.total || 0,
                workdaysThisMonth: workdaysResult[0]?.totalDays || 0
            },
            recentTrips, tripsByMonth, topDestinations
        });
    } catch (error) {
        console.error('Dashboard overview error:', error);
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
};
