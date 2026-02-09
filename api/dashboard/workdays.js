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
        const companyId = user.companyId;
        const { year } = req.query;
        const currentYear = year || new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear, 11, 31);

        const workdaysByEmployee = await Trip.aggregate([
            { $match: { companyId: user.companyId, departureDate: { $gte: startOfYear, $lte: endOfYear } } },
            { $group: { _id: '$employeeId', totalWorkdays: { $sum: '$workdaysAbroad' }, totalTrips: { $sum: 1 }, destinations: { $addToSet: '$destination' } } },
            { $lookup: { from: 'employees', localField: '_id', foreignField: '_id', as: 'employee' } },
            { $unwind: '$employee' },
            { $project: { totalWorkdays: 1, totalTrips: 1, destinations: 1, employeeName: { $concat: ['$employee.firstName', ' ', '$employee.lastName'] }, department: '$employee.department' } },
            { $sort: { totalWorkdays: -1 } }
        ]);

        const monthlyWorkdays = await Trip.aggregate([
            { $match: { companyId: user.companyId, departureDate: { $gte: startOfYear, $lte: endOfYear } } },
            { $group: { _id: { $month: '$departureDate' }, totalWorkdays: { $sum: '$workdaysAbroad' }, tripCount: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        const trips = await Trip.find({ companyId, departureDate: { $gte: startOfYear, $lte: endOfYear } })
            .populate('employeeId', 'firstName lastName').sort({ departureDate: 1 });

        res.json({ workdaysByEmployee, monthlyWorkdays, trips, year: currentYear });
    } catch (error) {
        console.error('Workdays error:', error);
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
};
