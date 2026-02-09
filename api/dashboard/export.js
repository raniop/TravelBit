const connectDB = require('../_lib/db');
const { Trip, Employee } = require('../_lib/models');
const { verifyAuth, cors } = require('../_lib/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = await verifyAuth(req);
    if (!user || user.role !== 'company') return res.status(403).json({ message: '\u05d0\u05d9\u05df \u05d4\u05e8\u05e9\u05d0\u05d4.' });

    try {
        await connectDB();
        const url = req.url.split('?')[0];

        // Determine export type from URL
        const isWorkdays = url.includes('/export/workdays');

        const trips = await Trip.find({ companyId: user.companyId })
            .populate('employeeId', 'firstName lastName department').sort({ departureDate: -1 });

        if (isWorkdays) {
            // Workdays export
            const csvHeader = '\u05e9\u05dd \u05e2\u05d5\u05d1\u05d3,\u05de\u05d7\u05dc\u05e7\u05d4,\u05d9\u05e2\u05d3,\u05ea\u05d0\u05e8\u05d9\u05da \u05d9\u05e6\u05d9\u05d0\u05d4,\u05ea\u05d0\u05e8\u05d9\u05da \u05d7\u05d6\u05e8\u05d4,\u05d9\u05de\u05d9 \u05e2\u05d1\u05d5\u05d3\u05d4 \u05d1\u05d7\u05d5"\u05dc\n';
            const csvRows = trips.map(t => {
                const emp = t.employeeId;
                return `${emp?.firstName || ''} ${emp?.lastName || ''},${emp?.department || ''},${t.destination},${t.departureDate?.toISOString().split('T')[0]},${t.returnDate?.toISOString().split('T')[0]},${t.workdaysAbroad}`;
            }).join('\n');

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename=workdays-export.csv');
            return res.send('\uFEFF' + csvHeader + csvRows);
        } else {
            // Trips export
            const csvHeader = '\u05e9\u05dd \u05e2\u05d5\u05d1\u05d3,\u05de\u05d7\u05dc\u05e7\u05d4,\u05d9\u05e2\u05d3,\u05ea\u05d0\u05e8\u05d9\u05da \u05d9\u05e6\u05d9\u05d0\u05d4,\u05ea\u05d0\u05e8\u05d9\u05da \u05d7\u05d6\u05e8\u05d4,\u05d9\u05de\u05d9 \u05e2\u05d1\u05d5\u05d3\u05d4,\u05e2\u05dc\u05d5\u05ea,\u05de\u05d8\u05d1\u05e2,\u05e1\u05d8\u05d8\u05d5\u05e1\n';
            const csvRows = trips.map(t => {
                const emp = t.employeeId;
                return `${emp?.firstName || ''} ${emp?.lastName || ''},${emp?.department || ''},${t.destination},${t.departureDate?.toISOString().split('T')[0]},${t.returnDate?.toISOString().split('T')[0]},${t.workdaysAbroad},${t.cost},${t.currency},${t.status}`;
            }).join('\n');

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename=trips-export.csv');
            return res.send('\uFEFF' + csvHeader + csvRows);
        }
    } catch (error) {
        res.status(500).json({ message: '\u05e9\u05d2\u05d9\u05d0\u05ea \u05e9\u05e8\u05ea.' });
    }
};
