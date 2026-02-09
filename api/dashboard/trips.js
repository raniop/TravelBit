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
        const { status, employee, destination, startDate, endDate, page = 1, limit = 50 } = req.query;
        const filter = { companyId };

        if (status) filter.status = status;
        if (employee) filter.employeeId = employee;
        if (destination) filter.destination = { $regex: destination, $options: 'i' };
        if (startDate) filter.departureDate = { ...filter.departureDate, $gte: new Date(startDate) };
        if (endDate) filter.returnDate = { ...filter.returnDate, $lte: new Date(endDate) };

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [trips, total] = await Promise.all([
            Trip.find(filter).populate('employeeId', 'firstName lastName department').sort({ departureDate: -1 }).skip(skip).limit(parseInt(limit)),
            Trip.countDocuments(filter)
        ]);

        res.json({ trips, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (error) {
        console.error('Trips error:', error);
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
};
