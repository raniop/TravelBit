const connectDB = require('../_lib/db');
const { Company, User, Employee, Trip } = require('../_lib/models');
const { verifyAuth, cors } = require('../_lib/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = await verifyAuth(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ message: 'אין הרשאה.' });

    await connectDB();

    // GET - List companies
    if (req.method === 'GET') {
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
            const companiesWithStats = await Promise.all(
                companies.map(async (company) => {
                    const empCount = await Employee.countDocuments({ companyId: company._id, isActive: true });
                    const tripCount = await Trip.countDocuments({ companyId: company._id });
                    return { ...company.toJSON(), employeeCount: empCount, totalTrips: tripCount };
                })
            );
            return res.json(companiesWithStats);
        } catch (error) {
            console.error('List companies error:', error);
            return res.status(500).json({ message: 'שגיאת שרת.' });
        }
    }

    // POST - Create company
    if (req.method === 'POST') {
        try {
            const { name, contactPerson, email, phone, policyNumber, subscriptionEnd, username, password } = req.body;
            if (!name || !contactPerson || !email || !username || !password) {
                return res.status(400).json({ message: 'נא למלא את כל השדות הנדרשים.' });
            }

            const existingUser = await User.findOne({ username: username.toLowerCase() });
            if (existingUser) return res.status(400).json({ message: 'שם המשתמש כבר קיים במערכת.' });

            const company = await Company.create({
                name, contactPerson, email, phone, policyNumber,
                subscriptionEnd: subscriptionEnd || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
            });

            const newUser = await User.create({
                username: username.toLowerCase(), password, role: 'company',
                companyId: company._id, name: contactPerson, email
            });

            return res.status(201).json({
                message: 'החברה נוצרה בהצלחה!',
                company,
                credentials: { username: newUser.username }
            });
        } catch (error) {
            console.error('Create company error:', error);
            return res.status(500).json({ message: 'שגיאת שרת.' });
        }
    }

    return res.status(405).json({ message: 'Method not allowed' });
};
