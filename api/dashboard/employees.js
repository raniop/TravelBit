const connectDB = require('../_lib/db');
const { Employee } = require('../_lib/models');
const { verifyAuth, cors } = require('../_lib/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = await verifyAuth(req);
    if (!user || user.role !== 'company') return res.status(403).json({ message: 'אין הרשאה.' });

    await connectDB();
    const companyId = user.companyId;

    // GET - List employees
    if (req.method === 'GET') {
        try {
            const { search, department, status, page = 1, limit = 50 } = req.query;
            const filter = { companyId };

            if (status === 'inactive') {
                filter.isActive = false;
            } else if (status !== 'all') {
                filter.isActive = true;
            }

            if (search) {
                filter.$or = [
                    { firstName: { $regex: search, $options: 'i' } },
                    { lastName: { $regex: search, $options: 'i' } },
                    { idNumber: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } }
                ];
            }

            if (department) {
                filter.department = department;
            }

            const skip = (parseInt(page) - 1) * parseInt(limit);
            const [employees, total] = await Promise.all([
                Employee.find(filter).sort({ firstName: 1 }).skip(skip).limit(parseInt(limit)),
                Employee.countDocuments(filter)
            ]);

            // Get unique departments for filter dropdown
            const departments = await Employee.distinct('department', { companyId, isActive: true });

            return res.json({ employees, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)), departments });
        } catch (error) {
            console.error('Employees list error:', error);
            return res.status(500).json({ message: 'שגיאת שרת.' });
        }
    }

    // POST - Create employee
    if (req.method === 'POST') {
        try {
            const { firstName, lastName, idNumber, email, phone, department, position } = req.body;

            if (!firstName || !lastName) {
                return res.status(400).json({ message: 'נא למלא שם פרטי ושם משפחה.' });
            }

            const employee = await Employee.create({
                companyId, firstName, lastName, idNumber, email, phone, department, position
            });

            return res.status(201).json({ message: 'העובד נוסף בהצלחה.', employee });
        } catch (error) {
            console.error('Create employee error:', error);
            return res.status(500).json({ message: 'שגיאת שרת.' });
        }
    }

    // PUT - Update employee
    if (req.method === 'PUT') {
        try {
            const { id } = req.query;
            if (!id) return res.status(400).json({ message: 'חסר מזהה עובד.' });

            const { firstName, lastName, idNumber, email, phone, department, position, isActive } = req.body;

            const updateFields = {};
            if (firstName !== undefined) updateFields.firstName = firstName;
            if (lastName !== undefined) updateFields.lastName = lastName;
            if (idNumber !== undefined) updateFields.idNumber = idNumber;
            if (email !== undefined) updateFields.email = email;
            if (phone !== undefined) updateFields.phone = phone;
            if (department !== undefined) updateFields.department = department;
            if (position !== undefined) updateFields.position = position;
            if (isActive !== undefined) updateFields.isActive = isActive;

            const employee = await Employee.findOneAndUpdate(
                { _id: id, companyId },
                updateFields,
                { new: true, runValidators: true }
            );

            if (!employee) return res.status(404).json({ message: 'עובד לא נמצא.' });

            return res.json({ message: 'העובד עודכן בהצלחה.', employee });
        } catch (error) {
            console.error('Update employee error:', error);
            return res.status(500).json({ message: 'שגיאת שרת.' });
        }
    }

    // DELETE - Deactivate employee
    if (req.method === 'DELETE') {
        try {
            const { id } = req.query;
            if (!id) return res.status(400).json({ message: 'חסר מזהה עובד.' });

            const employee = await Employee.findOneAndUpdate(
                { _id: id, companyId },
                { isActive: false },
                { new: true }
            );

            if (!employee) return res.status(404).json({ message: 'עובד לא נמצא.' });

            return res.json({ message: 'העובד הושבת בהצלחה.' });
        } catch (error) {
            console.error('Deactivate employee error:', error);
            return res.status(500).json({ message: 'שגיאת שרת.' });
        }
    }

    return res.status(405).json({ message: 'Method not allowed' });
};
