const connectDB = require('../../_lib/db');
const { Company, User, Employee, Trip, Policy } = require('../../_lib/models');
const { verifyAuth, cors } = require('../../_lib/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = await verifyAuth(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ message: 'אין הרשאה.' });

    await connectDB();
    const { id } = req.query;

    // GET - Company details
    if (req.method === 'GET') {
        try {
            const company = await Company.findById(id);
            if (!company) return res.status(404).json({ message: 'חברה לא נמצאה.' });

            const [employees, trips, policies, loginUser] = await Promise.all([
                Employee.find({ companyId: company._id }),
                Trip.find({ companyId: company._id }).populate('employeeId', 'firstName lastName').sort({ departureDate: -1 }),
                Policy.find({ companyId: company._id }),
                User.findOne({ companyId: company._id, role: 'company' }).select('username lastLogin')
            ]);
            return res.json({ company, employees, trips, policies, loginUser });
        } catch (error) {
            return res.status(500).json({ message: 'שגיאת שרת.' });
        }
    }

    // PUT - Update company
    if (req.method === 'PUT') {
        try {
            const { name, contactPerson, email, phone, policyNumber, subscriptionEnd, isActive } = req.body;
            const company = await Company.findByIdAndUpdate(id,
                { name, contactPerson, email, phone, policyNumber, subscriptionEnd, isActive },
                { new: true, runValidators: true }
            );
            if (!company) return res.status(404).json({ message: 'חברה לא נמצאה.' });
            if (isActive === false) await User.updateMany({ companyId: company._id }, { isActive: false });
            return res.json({ message: 'החברה עודכנה בהצלחה.', company });
        } catch (error) {
            return res.status(500).json({ message: 'שגיאת שרת.' });
        }
    }

    // DELETE - Deactivate company
    if (req.method === 'DELETE') {
        try {
            const company = await Company.findByIdAndUpdate(id, { isActive: false }, { new: true });
            if (!company) return res.status(404).json({ message: 'חברה לא נמצאה.' });
            await User.updateMany({ companyId: company._id }, { isActive: false });
            return res.json({ message: 'החברה הושבתה בהצלחה.' });
        } catch (error) {
            return res.status(500).json({ message: 'שגיאת שרת.' });
        }
    }

    return res.status(405).json({ message: 'Method not allowed' });
};
