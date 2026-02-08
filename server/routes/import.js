const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const Employee = require('../models/Employee');
const Trip = require('../models/Trip');
const router = express.Router();

// Multer config for CSV upload
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('רק קבצי CSV מותרים.'));
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Admin only routes
router.use(auth, roleCheck('admin'));

// POST /api/import/:companyId/trips - Import trips from CSV
router.post('/:companyId/trips', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'נא להעלות קובץ CSV.' });
        }

        const companyId = req.params.companyId;
        const results = [];
        const errors = [];

        // Parse CSV from buffer
        const stream = Readable.from(req.file.buffer.toString('utf-8'));

        await new Promise((resolve, reject) => {
            stream
                .pipe(csv())
                .on('data', (row) => results.push(row))
                .on('end', resolve)
                .on('error', reject);
        });

        let imported = 0;

        for (const row of results) {
            try {
                // Find or create employee
                let employee = await Employee.findOne({
                    companyId,
                    $or: [
                        { idNumber: row['ת.ז.'] || row['idNumber'] || row['id'] },
                        {
                            firstName: row['שם פרטי'] || row['firstName'] || '',
                            lastName: row['שם משפחה'] || row['lastName'] || ''
                        }
                    ]
                });

                if (!employee) {
                    employee = await Employee.create({
                        companyId,
                        firstName: row['שם פרטי'] || row['firstName'] || 'לא ידוע',
                        lastName: row['שם משפחה'] || row['lastName'] || '',
                        idNumber: row['ת.ז.'] || row['idNumber'] || '',
                        department: row['מחלקה'] || row['department'] || '',
                        email: row['אימייל'] || row['email'] || ''
                    });
                }

                // Create trip
                await Trip.create({
                    employeeId: employee._id,
                    companyId,
                    destination: row['יעד'] || row['destination'] || '',
                    departureDate: new Date(row['תאריך יציאה'] || row['departureDate'] || row['departure']),
                    returnDate: new Date(row['תאריך חזרה'] || row['returnDate'] || row['return']),
                    purpose: row['מטרה'] || row['purpose'] || '',
                    status: row['סטטוס'] || row['status'] || 'completed',
                    cost: parseFloat(row['עלות'] || row['cost'] || 0),
                    currency: row['מטבע'] || row['currency'] || 'ILS',
                    workdaysAbroad: parseInt(row['ימי עבודה'] || row['workdays'] || 0),
                    notes: row['הערות'] || row['notes'] || ''
                });

                imported++;
            } catch (rowError) {
                errors.push({ row, error: rowError.message });
            }
        }

        res.json({
            message: `יובאו ${imported} נסיעות מתוך ${results.length}.`,
            imported,
            total: results.length,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ message: 'שגיאה בייבוא הקובץ.' });
    }
});

module.exports = router;
