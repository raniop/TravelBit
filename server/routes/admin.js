const express = require('express');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const Company = require('../models/Company');
const User = require('../models/User');
const Employee = require('../models/Employee');
const Trip = require('../models/Trip');
const Policy = require('../models/Policy');
const router = express.Router();

// All admin routes require auth + admin role
router.use(auth, roleCheck('admin'));

// GET /api/admin/stats - Overview statistics
router.get('/stats', async (req, res) => {
    try {
        const [companies, employees, activeTrips, expiringPolicies] = await Promise.all([
            Company.countDocuments({ isActive: true }),
            Employee.countDocuments({ isActive: true }),
            Trip.countDocuments({ status: 'active' }),
            Policy.countDocuments({
                expirationDate: { $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
                status: { $ne: 'expired' }
            })
        ]);

        res.json({ companies, employees, activeTrips, expiringPolicies });
    } catch (error) {
        console.error('Admin stats error:', error);
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
});

// GET /api/admin/companies - List all companies
router.get('/companies', async (req, res) => {
    try {
        const { search, status } = req.query;
        const filter = {};

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { contactPerson: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }
        if (status === 'active') filter.isActive = true;
        if (status === 'inactive') filter.isActive = false;

        const companies = await Company.find(filter).sort({ createdAt: -1 });

        // Add employee count for each company
        const companiesWithStats = await Promise.all(
            companies.map(async (company) => {
                const empCount = await Employee.countDocuments({ companyId: company._id, isActive: true });
                const tripCount = await Trip.countDocuments({ companyId: company._id });
                return { ...company.toJSON(), employeeCount: empCount, totalTrips: tripCount };
            })
        );

        res.json(companiesWithStats);
    } catch (error) {
        console.error('List companies error:', error);
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
});

// GET /api/admin/companies/:id - Company details
router.get('/companies/:id', async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);
        if (!company) {
            return res.status(404).json({ message: 'חברה לא נמצאה.' });
        }

        const [employees, trips, policies, user] = await Promise.all([
            Employee.find({ companyId: company._id }),
            Trip.find({ companyId: company._id }).populate('employeeId', 'firstName lastName').sort({ departureDate: -1 }),
            Policy.find({ companyId: company._id }),
            User.findOne({ companyId: company._id, role: 'company' }).select('username lastLogin')
        ]);

        res.json({ company, employees, trips, policies, loginUser: user });
    } catch (error) {
        console.error('Company details error:', error);
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
});

// POST /api/admin/companies - Create company + user account
router.post('/companies', async (req, res) => {
    try {
        const { name, contactPerson, email, phone, policyNumber, subscriptionEnd, username, password } = req.body;

        if (!name || !contactPerson || !email || !username || !password) {
            return res.status(400).json({ message: 'נא למלא את כל השדות הנדרשים.' });
        }

        // Check if username already exists
        const existingUser = await User.findOne({ username: username.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ message: 'שם המשתמש כבר קיים במערכת.' });
        }

        // Create company
        const company = await Company.create({
            name,
            contactPerson,
            email,
            phone,
            policyNumber,
            subscriptionEnd: subscriptionEnd || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        });

        // Create company user
        const user = await User.create({
            username: username.toLowerCase(),
            password,
            role: 'company',
            companyId: company._id,
            name: contactPerson,
            email
        });

        res.status(201).json({
            message: 'החברה נוצרה בהצלחה!',
            company,
            credentials: { username: user.username }
        });
    } catch (error) {
        console.error('Create company error:', error);
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
});

// PUT /api/admin/companies/:id - Update company
router.put('/companies/:id', async (req, res) => {
    try {
        const { name, contactPerson, email, phone, policyNumber, subscriptionEnd, isActive } = req.body;

        const company = await Company.findByIdAndUpdate(
            req.params.id,
            { name, contactPerson, email, phone, policyNumber, subscriptionEnd, isActive },
            { new: true, runValidators: true }
        );

        if (!company) {
            return res.status(404).json({ message: 'חברה לא נמצאה.' });
        }

        // If deactivated, deactivate the user too
        if (isActive === false) {
            await User.updateMany({ companyId: company._id }, { isActive: false });
        }

        res.json({ message: 'החברה עודכנה בהצלחה.', company });
    } catch (error) {
        console.error('Update company error:', error);
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
});

// DELETE /api/admin/companies/:id - Deactivate company
router.delete('/companies/:id', async (req, res) => {
    try {
        const company = await Company.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { new: true }
        );

        if (!company) {
            return res.status(404).json({ message: 'חברה לא נמצאה.' });
        }

        // Deactivate company user
        await User.updateMany({ companyId: company._id }, { isActive: false });

        res.json({ message: 'החברה הושבתה בהצלחה.' });
    } catch (error) {
        console.error('Delete company error:', error);
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
});

// POST /api/admin/companies/:id/employees - Add employee to company
router.post('/companies/:id/employees', async (req, res) => {
    try {
        const { firstName, lastName, idNumber, email, phone, department, position } = req.body;

        if (!firstName || !lastName) {
            return res.status(400).json({ message: 'נא למלא שם פרטי ושם משפחה.' });
        }

        const employee = await Employee.create({
            companyId: req.params.id,
            firstName,
            lastName,
            idNumber,
            email,
            phone,
            department,
            position
        });

        res.status(201).json({ message: 'העובד נוסף בהצלחה.', employee });
    } catch (error) {
        console.error('Add employee error:', error);
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
});

// POST /api/admin/companies/:id/reset-password - Reset company password
router.post('/companies/:id/reset-password', async (req, res) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ message: 'הסיסמה חייבת להכיל לפחות 6 תווים.' });
        }

        const user = await User.findOne({ companyId: req.params.id, role: 'company' });
        if (!user) {
            return res.status(404).json({ message: 'משתמש חברה לא נמצא.' });
        }

        user.password = newPassword;
        await user.save();

        res.json({ message: 'הסיסמה אופסה בהצלחה.' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
});

module.exports = router;
