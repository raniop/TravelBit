const connectDB = require('../../_lib/db');
const { Employee, Trip } = require('../../_lib/models');
const { verifyAuth, cors } = require('../../_lib/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

    const user = await verifyAuth(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ message: 'אין הרשאה.' });

    try {
        await connectDB();
        const { companyId } = req.query;
        const rows = req.body;

        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ message: 'נא לשלוח מערך של נסיעות.' });
        }

        let imported = 0;
        const errors = [];

        for (const row of rows) {
            try {
                let employee = await Employee.findOne({
                    companyId,
                    firstName: row.firstName || '',
                    lastName: row.lastName || ''
                });

                if (!employee) {
                    employee = await Employee.create({
                        companyId,
                        firstName: row.firstName || 'לא ידוע',
                        lastName: row.lastName || '',
                        department: row.department || '',
                        email: row.email || ''
                    });
                }

                await Trip.create({
                    employeeId: employee._id,
                    companyId,
                    destination: row.destination || '',
                    departureDate: new Date(row.departureDate),
                    returnDate: new Date(row.returnDate),
                    purpose: row.purpose || '',
                    status: row.status || 'completed',
                    cost: parseFloat(row.cost || 0),
                    currency: row.currency || 'ILS',
                    workdaysAbroad: parseInt(row.workdays || 0),
                    notes: row.notes || ''
                });
                imported++;
            } catch (rowError) {
                errors.push({ row, error: rowError.message });
            }
        }

        res.json({ message: `יובאו ${imported} נסיעות מתוך ${rows.length}.`, imported, total: rows.length, errors: errors.length > 0 ? errors : undefined });
    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ message: 'שגיאה בייבוא.' });
    }
};
