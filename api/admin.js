const connectDB = require('./_lib/db');
const { Company, User, Employee, Trip, Policy, Reminder, generateSlug } = require('./_lib/models');
const { verifyAuth, cors } = require('./_lib/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ message: 'אין הרשאת גישה.' });
    if (user.role !== 'admin') return res.status(403).json({ message: 'אין הרשאה.' });

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
            const result = { companies, employees, activeTrips, expiringPolicies };

            // Optional: return detailed list based on ?details= param
            const details = req.query.details;

            if (details === 'employees') {
                const employeesList = await Employee.find({ isActive: true }).sort({ firstName: 1 });
                const companyIds = [...new Set(employeesList.map(e => e.companyId?.toString()).filter(Boolean))];
                const companiesMap = {};
                if (companyIds.length > 0) {
                    const comps = await Company.find({ _id: { $in: companyIds } }).select('name');
                    comps.forEach(c => { companiesMap[c._id.toString()] = c.name; });
                }
                result.employeesList = employeesList.map(e => ({
                    ...e.toJSON(),
                    companyName: companiesMap[e.companyId?.toString()] || '-'
                }));
            }

            if (details === 'trips') {
                const tripsList = await Trip.find({ status: 'active' })
                    .populate('employeeId', 'firstName lastName')
                    .sort({ departureDate: -1 });
                const companyIds = [...new Set(tripsList.map(t => t.companyId?.toString()).filter(Boolean))];
                const companiesMap = {};
                if (companyIds.length > 0) {
                    const comps = await Company.find({ _id: { $in: companyIds } }).select('name');
                    comps.forEach(c => { companiesMap[c._id.toString()] = c.name; });
                }
                result.tripsList = tripsList.map(t => ({
                    ...t.toJSON(),
                    companyName: companiesMap[t.companyId?.toString()] || '-'
                }));
            }

            if (details === 'policies') {
                const policiesList = await Policy.find({
                    expirationDate: { $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
                    status: { $ne: 'expired' }
                }).sort({ expirationDate: 1 });
                const companyIds = [...new Set(policiesList.map(p => p.companyId?.toString()).filter(Boolean))];
                const companiesMap = {};
                if (companyIds.length > 0) {
                    const comps = await Company.find({ _id: { $in: companyIds } }).select('name');
                    comps.forEach(c => { companiesMap[c._id.toString()] = c.name; });
                }
                result.policiesList = policiesList.map(p => ({
                    ...p.toJSON(),
                    companyName: companiesMap[p.companyId?.toString()] || '-'
                }));
            }

            return res.json(result);
        } catch (error) {
            console.error('Admin stats error:', error);
            return res.status(500).json({ message: 'שגיאת שרת.' });
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
                const { name, contactPerson, email, phone, policyNumber, agentCodes, dashboardModules, insurancePages, reminderPages, subscriptionEnd, username, password } = req.body;
                if (!name || !contactPerson || !email || !username || !password) {
                    return res.status(400).json({ message: 'נא למלא את כל השדות הנדרשים.' });
                }

                const existingUser = await User.findOne({ username: username.toLowerCase() });
                if (existingUser) return res.status(400).json({ message: 'שם המשתמש כבר קיים במערכת.' });

                // Auto-generate slug from company name
                let slug = req.body.slug ? req.body.slug.trim().toLowerCase() : generateSlug(name);
                // Ensure slug is unique
                if (slug) {
                    let slugBase = slug;
                    let counter = 1;
                    while (await Company.findOne({ slug })) {
                        slug = slugBase + '-' + counter;
                        counter++;
                    }
                }

                const company = await Company.create({
                    name, slug: slug || undefined, contactPerson, email, phone, policyNumber,
                    agentCodes: Array.isArray(agentCodes) ? agentCodes : [],
                    dashboardModules: dashboardModules || { management: true, insurance: false, reminders: false, yeadim: false },
                    insurancePages: insurancePages || { dashboard: true, policies: true, agents: true, reports: true },
                    reminderPages: reminderPages || { agentAppointment: true, policyCancellations: true, newProductions: true, claims: true, firstDeposit: true, completingDeficiencies: true },
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

        // PUT - Update company details
        if (req.method === 'PUT') {
            try {
                const companyId = url.split('/').pop();
                const { name, slug: newSlug, contactPerson, email, phone, policyNumber, agentCodes, dashboardModules, insurancePages, reminderPages, yeadimAdvanced, commissionsEnabled, isActive } = req.body;

                const company = await Company.findById(companyId);
                if (!company) return res.status(404).json({ message: 'החברה לא נמצאה.' });

                if (name !== undefined) company.name = name;
                if (newSlug !== undefined) {
                    const cleanSlug = newSlug.trim().toLowerCase();
                    // Check uniqueness (excluding current company)
                    const existing = await Company.findOne({ slug: cleanSlug, _id: { $ne: company._id } });
                    if (existing) return res.status(400).json({ message: 'הסלאג כבר בשימוש על ידי חברה אחרת.' });
                    company.slug = cleanSlug || undefined;
                }
                if (contactPerson !== undefined) company.contactPerson = contactPerson;
                if (email !== undefined) company.email = email;
                if (phone !== undefined) company.phone = phone;
                if (policyNumber !== undefined) company.policyNumber = policyNumber;
                if (agentCodes !== undefined) company.agentCodes = Array.isArray(agentCodes) ? agentCodes : [];
                if (dashboardModules !== undefined) {
                    company.dashboardModules = dashboardModules;
                    company.markModified('dashboardModules');
                }
                if (insurancePages !== undefined) {
                    company.insurancePages = insurancePages;
                    company.markModified('insurancePages');
                }
                if (reminderPages !== undefined) {
                    company.reminderPages = reminderPages;
                    company.markModified('reminderPages');
                }
                if (yeadimAdvanced !== undefined) company.yeadimAdvanced = yeadimAdvanced === true;
                if (commissionsEnabled !== undefined) company.commissionsEnabled = commissionsEnabled === true;
                if (isActive !== undefined) company.isActive = isActive;

                await company.save();
                return res.json({ message: 'החברה עודכנה בהצלחה!', company });
            } catch (error) {
                console.error('Update company error:', error);
                return res.status(500).json({ message: 'שגיאת שרת.' });
            }
        }

        // DELETE - Deactivate or permanently delete company
        if (req.method === 'DELETE') {
            try {
                const companyId = url.split('/').pop();
                const company = await Company.findById(companyId);
                if (!company) return res.status(404).json({ message: 'החברה לא נמצאה.' });

                // Permanent delete: ?permanent=true (parse from raw URL since req.query may not exist on Vercel)
                const rawQuery = (req.url.split('?')[1] || '');
                const isPermanent = rawQuery.includes('permanent=true') || (req.query && req.query.permanent === 'true');
                if (isPermanent) {
                    // Delete all related data
                    await Promise.all([
                        User.deleteMany({ companyId: company._id }),
                        Employee.deleteMany({ companyId: company._id }),
                        Trip.deleteMany({ companyId: company._id }),
                        Policy.deleteMany({ companyId: company._id }),
                        Reminder.deleteMany({ companyId: company._id }),
                        Company.findByIdAndDelete(company._id)
                    ]);
                    return res.json({ message: 'החברה וכל הנתונים שלה נמחקו לצמיתות.' });
                }

                // Soft delete (deactivate)
                company.isActive = false;
                await company.save();
                return res.json({ message: 'החברה הושבתה.' });
            } catch (error) {
                console.error('Delete company error:', error);
                return res.status(500).json({ message: 'שגיאת שרת.' });
            }
        }

        return res.status(405).json({ message: 'Method not allowed' });
    }

    // === USERS (list / create for existing company) ===
    if (url.includes('/admin/users')) {
        // GET - List users for a company
        if (req.method === 'GET') {
            try {
                const { companyId } = req.query;
                const filter = {};
                if (companyId) filter.companyId = companyId;
                filter.role = 'company';
                const users = await User.find(filter).select('-password').sort({ createdAt: -1 });
                return res.json(users);
            } catch (error) {
                console.error('List users error:', error);
                return res.status(500).json({ message: 'שגיאת שרת.' });
            }
        }

        // POST - Create user for existing company
        if (req.method === 'POST') {
            try {
                const { companyId, username, password, name, email, phone } = req.body;
                if (!companyId || !username || !password || !name) {
                    return res.status(400).json({ message: 'נא למלא את כל השדות הנדרשים.' });
                }

                const company = await Company.findById(companyId);
                if (!company) return res.status(404).json({ message: 'החברה לא נמצאה.' });

                const existingUser = await User.findOne({ username: username.toLowerCase() });
                if (existingUser) return res.status(400).json({ message: 'שם המשתמש כבר קיים במערכת.' });

                const newUser = await User.create({
                    username: username.toLowerCase(), password, role: 'company',
                    companyId: company._id, name, email: email || '', phone: phone || ''
                });

                return res.status(201).json({
                    message: 'המשתמש נוצר בהצלחה!',
                    user: { id: newUser._id, username: newUser.username, name: newUser.name, phone: newUser.phone, companyId: newUser.companyId }
                });
            } catch (error) {
                console.error('Create user error:', error);
                return res.status(500).json({ message: 'שגיאת שרת.' });
            }
        }

        // PUT - Update user (password reset, toggle active, edit name/email)
        if (req.method === 'PUT') {
            try {
                const { userId, password, isActive, name, email, phone } = req.body;
                if (!userId) return res.status(400).json({ message: 'חסר מזהה משתמש.' });

                const targetUser = await User.findById(userId);
                if (!targetUser) return res.status(404).json({ message: 'המשתמש לא נמצא.' });

                if (password !== undefined) {
                    if (password.length < 6) return res.status(400).json({ message: 'הסיסמה חייבת להכיל לפחות 6 תווים.' });
                    targetUser.password = password;
                }
                if (isActive !== undefined) targetUser.isActive = isActive;
                if (name !== undefined) targetUser.name = name;
                if (email !== undefined) targetUser.email = email;
                if (phone !== undefined) targetUser.phone = phone;

                await targetUser.save();
                return res.json({ message: 'המשתמש עודכן בהצלחה!' });
            } catch (error) {
                console.error('Update user error:', error);
                return res.status(500).json({ message: 'שגיאת שרת.' });
            }
        }

        return res.status(405).json({ message: 'Method not allowed' });
    }

    return res.status(404).json({ message: 'Not found' });
};
