const connectDB = require('../_lib/db');
const { Trip } = require('../_lib/models');
const { verifyAuth, cors } = require('../_lib/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = await verifyAuth(req);
    if (!user || user.role !== 'company') return res.status(403).json({ message: 'אין הרשאה.' });

    try {
        await connectDB();
        const matchFilter = { companyId: user.companyId };
        const { startDate, endDate } = req.query;
        if (startDate) matchFilter.departureDate = { $gte: new Date(startDate) };
        if (endDate) matchFilter.returnDate = { ...matchFilter.returnDate, $lte: new Date(endDate) };

        const monthlyCosts = await Trip.aggregate([
            { $match: matchFilter },
            { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$departureDate' } }, totalCost: { $sum: '$cost' }, tripCount: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        const costByDestination = await Trip.aggregate([
            { $match: matchFilter },
            { $group: { _id: '$destination', totalCost: { $sum: '$cost' }, tripCount: { $sum: 1 } } },
            { $sort: { totalCost: -1 } }
        ]);

        const costByEmployee = await Trip.aggregate([
            { $match: matchFilter },
            { $group: { _id: '$employeeId', totalCost: { $sum: '$cost' }, tripCount: { $sum: 1 } } },
            { $sort: { totalCost: -1 } },
            { $lookup: { from: 'employees', localField: '_id', foreignField: '_id', as: 'employee' } },
            { $unwind: '$employee' },
            { $project: { totalCost: 1, tripCount: 1, employeeName: { $concat: ['$employee.firstName', ' ', '$employee.lastName'] }, department: '$employee.department' } }
        ]);

        const summary = await Trip.aggregate([
            { $match: matchFilter },
            { $group: { _id: null, totalCost: { $sum: '$cost' }, totalTrips: { $sum: 1 }, avgCost: { $avg: '$cost' } } }
        ]);

        res.json({ monthlyCosts, costByDestination, costByEmployee, summary: summary[0] || { totalCost: 0, totalTrips: 0, avgCost: 0 } });
    } catch (error) {
        console.error('Expenses error:', error);
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
};
