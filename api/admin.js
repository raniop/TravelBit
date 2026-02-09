const connectDB = require('./_lib/db');
const { Company, User, Employee, Trip, Policy } = require('./_lib/models');
const { verifyAuth, cors } = require('./_lib/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = await verifyAuth(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ message: '\u05d0\u05d9\u05df \u05d4\u05e8\u05e9\u05d0\u05d4.' });

    await connectDB();

    // Determine action from URL path
    const url = req.url.split('?')[0];

    // === STATS ===
    if (url.includes('/admin/stats')) {
        if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
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
            return res.json({ companies, employees, activeTrips, expiringPolicies });
        } catch (error) {
            console.error('Admin stats error:', error);
            return res.status(500).json({ message: '\u05e9\u05d2\u05d9\u05d0\u05ea \u05e9\u05e8\u05ea.' });
        }
    }

    // === COMPANIES (list / create) ===
    if (url.includes('/admin/companies')) {
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
                return res.status(500).json({ message: '\u05e9\u05d2\u05d9\u05d0\u05ea \u05e9\u05e8\u05ea.' });
            }
        }

        // POST - Create company
        if (req.method === 'POST') {
            try {
                const { name, contactPerson, email, phone, policyNumber, subscriptionEnd, username, password } = req.body;
                if (!name || !contactPerson || !email || !username || !password) {
                    return res.status(400).json({ message: '\u05e0\u05d0 \u05dc\u05de\u05dc\u05d0 \u05d0\u05ea \u05db\u05dc \u05d4\u05e9\u05d3\u05d5\u05ea \u05d4\u05e0\u05d3\u05e8\u05e9\u05d9\u05dd.' });
                }

                const existingUser = await User.findOne({ username: username.toLowerCase() });
                if (existingUser) return res.status(400).json({ message: '\u05e9\u05dd \u05d4\u05de\u05e9\u05ea\u05de\u05e9 \u05db\u05d1\u05e8 \u05e7\u05d9\u05d9\u05dd \u05d1\u05de\u05e2\u05e8\u05db\u05ea.' });

                const company = await Company.create({
                    name, contactPerson, email, phone, policyNumber,
                    subscriptionEnd: subscriptionEnd || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                });

                const newUser = await User.create({
                    username: username.toLowerCase(), password, role: 'company',
                    companyId: company._id, name: contactPerson, email
                });

                return res.status(201).json({
                    message: '\u05d4\u05d7\u05d1\u05e8\u05d4 \u05e0\u05d5\u05e6\u05e8\u05d4 \u05d1\u05d4\u05e6\u05dc\u05d7\u05d4!',
                    company,
                    credentials: { username: newUser.username }
                });
            } catch (error) {
                console.error('Create company error:', error);
                return res.status(500).json({ message: '\u05e9\u05d2\u05d9\u05d0\u05ea \u05e9\u05e8\u05ea.' });
            }
        }

        return res.status(405).json({ message: 'Method not allowed' });
    }

    return res.status(404).json({ message: 'Not found' });
};
