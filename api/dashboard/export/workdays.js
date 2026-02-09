const connectDB = require('../../_lib/db');
const { Trip } = require('../../_lib/models');
const { verifyAuth, cors } = require('../../_lib/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = await verifyAuth(req);
    if (!user || user.role !== 'company') return res.status(403).json({ message: 'אין הרשאה.' });

    try {
        await connectDB();
        const trips = await Trip.find({ companyId: user.companyId })
            .populate('employeeId', 'firstName lastName department').sort({ departureDate: -1 });

        const csvHeader = 'שם עובד,מחלקה,יעד,תאריך יציאה,תאריך חזרה,ימי עבודה בחו"ל\n';
        const csvRows = trips.map(t => {
            const emp = t.employeeId;
            return `${emp?.firstName || ''} ${emp?.lastName || ''},${emp?.department || ''},${t.destination},${t.departureDate?.toISOString().split('T')[0]},${t.returnDate?.toISOString().split('T')[0]},${t.workdaysAbroad}`;
        }).join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=workdays-export.csv');
        res.send('\uFEFF' + csvHeader + csvRows);
    } catch (error) {
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
};
