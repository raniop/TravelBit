const express = require('express');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const Company = require('../models/Company');
const Employee = require('../models/Employee');
const Trip = require('../models/Trip');
const Policy = require('../models/Policy');
const router = express.Router();

// All dashboard routes require auth + company role
router.use(auth, roleCheck('company'));

// GET /api/dashboard/overview - Dashboard overview stats
router.get('/overview', async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [totalEmployees, activeTrips, monthTrips, expiringPolicies, totalCostResult] = await Promise.all([
            Employee.countDocuments({ companyId, isActive: true }),
            Trip.countDocuments({ companyId, status: 'active' }),
            Trip.countDocuments({ companyId, departureDate: { $gte: startOfMonth } }),
            Policy.countDocuments({
                companyId,
                expirationDate: { $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
                status: { $ne: 'expired' }
            }),
            Trip.aggregate([
                { $match: { companyId: req.user.companyId } },
                { $group: { _id: null, total: { $sum: '$cost' } } }
            ])
        ]);

        // Workdays abroad this month
        const workdaysResult = await Trip.aggregate([
            {
                $match: {
                    companyId: req.user.companyId,
                    departureDate: { $gte: startOfMonth }
                }
            },
            { $group: { _id: null, totalDays: { $sum: '$workdaysAbroad' } } }
        ]);

        // Recent trips
        const recentTrips = await Trip.find({ companyId })
            .populate('employeeId', 'firstName lastName')
            .sort({ departureDate: -1 })
            .limit(10);

        // Trips by month (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const tripsByMonth = await Trip.aggregate([
            { $match: { companyId: req.user.companyId, departureDate: { $gte: sixMonthsAgo } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m', date: '$departureDate' } },
                    count: { $sum: 1 },
                    totalCost: { $sum: '$cost' }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Top destinations
        const topDestinations = await Trip.aggregate([
            { $match: { companyId: req.user.companyId } },
            { $group: { _id: '$destination', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);

        res.json({
            stats: {
                totalEmployees,
                activeTrips,
                monthTrips,
                expiringPolicies,
                totalCost: totalCostResult[0]?.total || 0,
                workdaysThisMonth: workdaysResult[0]?.totalDays || 0
            },
            recentTrips,
            tripsByMonth,
            topDestinations
        });
    } catch (error) {
        console.error('Dashboard overview error:', error);
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
});

// GET /api/dashboard/trips - All trips with filters
router.get('/trips', async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const { status, employee, destination, startDate, endDate, page = 1, limit = 50 } = req.query;
        const filter = { companyId };

        if (status) filter.status = status;
        if (employee) filter.employeeId = employee;
        if (destination) filter.destination = { $regex: destination, $options: 'i' };
        if (startDate) filter.departureDate = { ...filter.departureDate, $gte: new Date(startDate) };
        if (endDate) filter.returnDate = { ...filter.returnDate, $lte: new Date(endDate) };

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [trips, total] = await Promise.all([
            Trip.find(filter)
                .populate('employeeId', 'firstName lastName department')
                .sort({ departureDate: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Trip.countDocuments(filter)
        ]);

        res.json({ trips, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (error) {
        console.error('Trips list error:', error);
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
});

// GET /api/dashboard/trips/:id - Trip detail
router.get('/trips/:id', async (req, res) => {
    try {
        const trip = await Trip.findOne({ _id: req.params.id, companyId: req.user.companyId })
            .populate('employeeId', 'firstName lastName email phone department')
            .populate('insurancePolicyId');

        if (!trip) {
            return res.status(404).json({ message: 'נסיעה לא נמצאה.' });
        }
        res.json(trip);
    } catch (error) {
        console.error('Trip detail error:', error);
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
});

// GET /api/dashboard/employees - Employee list
router.get('/employees', async (req, res) => {
    try {
        const employees = await Employee.find({ companyId: req.user.companyId, isActive: true })
            .sort({ firstName: 1 });
        res.json(employees);
    } catch (error) {
        console.error('Employees list error:', error);
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
});

// GET /api/dashboard/expenses - Expense analysis data
router.get('/expenses', async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const { startDate, endDate } = req.query;
        const matchFilter = { companyId: req.user.companyId };

        if (startDate) matchFilter.departureDate = { $gte: new Date(startDate) };
        if (endDate) matchFilter.returnDate = { ...matchFilter.returnDate, $lte: new Date(endDate) };

        // Monthly costs
        const monthlyCosts = await Trip.aggregate([
            { $match: matchFilter },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m', date: '$departureDate' } },
                    totalCost: { $sum: '$cost' },
                    tripCount: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Cost by destination
        const costByDestination = await Trip.aggregate([
            { $match: matchFilter },
            {
                $group: {
                    _id: '$destination',
                    totalCost: { $sum: '$cost' },
                    tripCount: { $sum: 1 }
                }
            },
            { $sort: { totalCost: -1 } }
        ]);

        // Cost by employee
        const costByEmployee = await Trip.aggregate([
            { $match: matchFilter },
            {
                $group: {
                    _id: '$employeeId',
                    totalCost: { $sum: '$cost' },
                    tripCount: { $sum: 1 }
                }
            },
            { $sort: { totalCost: -1 } },
            {
                $lookup: {
                    from: 'employees',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'employee'
                }
            },
            { $unwind: '$employee' },
            {
                $project: {
                    totalCost: 1,
                    tripCount: 1,
                    employeeName: { $concat: ['$employee.firstName', ' ', '$employee.lastName'] },
                    department: '$employee.department'
                }
            }
        ]);

        // Total summary
        const summary = await Trip.aggregate([
            { $match: matchFilter },
            {
                $group: {
                    _id: null,
                    totalCost: { $sum: '$cost' },
                    totalTrips: { $sum: 1 },
                    avgCost: { $avg: '$cost' }
                }
            }
        ]);

        res.json({
            monthlyCosts,
            costByDestination,
            costByEmployee,
            summary: summary[0] || { totalCost: 0, totalTrips: 0, avgCost: 0 }
        });
    } catch (error) {
        console.error('Expenses error:', error);
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
});

// GET /api/dashboard/workdays - Workdays abroad tracking
router.get('/workdays', async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const { year } = req.query;
        const currentYear = year || new Date().getFullYear();

        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear, 11, 31);

        // Workdays per employee
        const workdaysByEmployee = await Trip.aggregate([
            {
                $match: {
                    companyId: req.user.companyId,
                    departureDate: { $gte: startOfYear, $lte: endOfYear }
                }
            },
            {
                $group: {
                    _id: '$employeeId',
                    totalWorkdays: { $sum: '$workdaysAbroad' },
                    totalTrips: { $sum: 1 },
                    destinations: { $addToSet: '$destination' }
                }
            },
            {
                $lookup: {
                    from: 'employees',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'employee'
                }
            },
            { $unwind: '$employee' },
            {
                $project: {
                    totalWorkdays: 1,
                    totalTrips: 1,
                    destinations: 1,
                    employeeName: { $concat: ['$employee.firstName', ' ', '$employee.lastName'] },
                    department: '$employee.department'
                }
            },
            { $sort: { totalWorkdays: -1 } }
        ]);

        // Monthly workdays distribution
        const monthlyWorkdays = await Trip.aggregate([
            {
                $match: {
                    companyId: req.user.companyId,
                    departureDate: { $gte: startOfYear, $lte: endOfYear }
                }
            },
            {
                $group: {
                    _id: { $month: '$departureDate' },
                    totalWorkdays: { $sum: '$workdaysAbroad' },
                    tripCount: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // All trips for calendar view
        const trips = await Trip.find({
            companyId,
            departureDate: { $gte: startOfYear, $lte: endOfYear }
        })
            .populate('employeeId', 'firstName lastName')
            .sort({ departureDate: 1 });

        res.json({ workdaysByEmployee, monthlyWorkdays, trips, year: currentYear });
    } catch (error) {
        console.error('Workdays error:', error);
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
});

// GET /api/dashboard/alerts - Insurance alerts
router.get('/alerts', async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const now = new Date();
        const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const policies = await Policy.find({ companyId }).sort({ expirationDate: 1 });

        const alerts = policies.map(policy => {
            const daysLeft = policy.daysUntilExpiration;
            let severity = 'ok';
            if (daysLeft <= 0) severity = 'expired';
            else if (daysLeft <= 7) severity = 'critical';
            else if (daysLeft <= 30) severity = 'warning';

            return {
                ...policy.toJSON(),
                severity,
                daysLeft
            };
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
});

// GET /api/dashboard/export/trips - Export trips to CSV
router.get('/export/trips', async (req, res) => {
    try {
        const trips = await Trip.find({ companyId: req.user.companyId })
            .populate('employeeId', 'firstName lastName department')
            .sort({ departureDate: -1 });

        const csvHeader = 'שם עובד,מחלקה,יעד,תאריך יציאה,תאריך חזרה,ימי עבודה,עלות,מטבע,סטטוס\n';
        const csvRows = trips.map(t => {
            const emp = t.employeeId;
            return `${emp?.firstName || ''} ${emp?.lastName || ''},${emp?.department || ''},${t.destination},${t.departureDate?.toISOString().split('T')[0]},${t.returnDate?.toISOString().split('T')[0]},${t.workdaysAbroad},${t.cost},${t.currency},${t.status}`;
        }).join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=trips-export.csv');
        res.send('\uFEFF' + csvHeader + csvRows); // BOM for Hebrew Excel support
    } catch (error) {
        console.error('Export trips error:', error);
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
});

// GET /api/dashboard/export/workdays - Export workdays to CSV
router.get('/export/workdays', async (req, res) => {
    try {
        const trips = await Trip.find({ companyId: req.user.companyId })
            .populate('employeeId', 'firstName lastName department')
            .sort({ departureDate: -1 });

        const csvHeader = 'שם עובד,מחלקה,יעד,תאריך יציאה,תאריך חזרה,ימי עבודה בחו"ל\n';
        const csvRows = trips.map(t => {
            const emp = t.employeeId;
            return `${emp?.firstName || ''} ${emp?.lastName || ''},${emp?.department || ''},${t.destination},${t.departureDate?.toISOString().split('T')[0]},${t.returnDate?.toISOString().split('T')[0]},${t.workdaysAbroad}`;
        }).join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=workdays-export.csv');
        res.send('\uFEFF' + csvHeader + csvRows);
    } catch (error) {
        console.error('Export workdays error:', error);
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
});

module.exports = router;
