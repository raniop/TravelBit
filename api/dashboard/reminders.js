const connectDB = require('../_lib/db');
const { Company, Reminder, normalizeDashboardModules } = require('../_lib/models');
const { verifyAuth, cors } = require('../_lib/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ message: 'אין הרשאת גישה.' });
    if (user.role !== 'company') return res.status(403).json({ message: 'אין הרשאה.' });

    await connectDB();

    // Access control: company must have reminders access
    const company = await Company.findById(user.companyId)
        .select('dashboardModules reminderPages agentCodes').lean();
    if (!company) return res.status(403).json({ message: 'אין הרשאה.' });

    const dm = normalizeDashboardModules(company.dashboardModules);
    if (!dm.reminders) return res.status(403).json({ message: 'אין הרשאה לתזכורות.' });

    const rp = company.reminderPages || {
        agentAppointment: true, policyCancellations: true, newProductions: true,
        claims: true, firstDeposit: true, completingDeficiencies: true
    };

    const url = req.url.split('?')[0];

    // GET - List reminders
    if (req.method === 'GET') {
        try {
            const { type, agentCode, status } = req.query || {};
            const filter = { companyId: user.companyId };
            if (type) {
                // Check granular page access
                if (rp[type] === false) {
                    return res.status(403).json({ message: 'אין הרשאה לדף זה.' });
                }
                filter.type = type;
            }
            if (agentCode) filter.agentCode = agentCode;
            if (status) filter.status = status;

            const reminders = await Reminder.find(filter).sort({ createdAt: -1 }).limit(500);
            const total = await Reminder.countDocuments(filter);

            // Return agent codes for filter dropdown
            const agentCodes = Array.isArray(company.agentCodes) ? company.agentCodes : [];

            return res.json({ reminders, total, agentCodes });
        } catch (error) {
            console.error('List reminders error:', error);
            return res.status(500).json({ message: 'שגיאת שרת.' });
        }
    }

    // POST - Create reminder
    if (req.method === 'POST') {
        try {
            const { type, agentCode, customerName, idNumber, phone,
                    policyNumber, insuranceCompany, date, amount, notes } = req.body;

            if (!type) return res.status(400).json({ message: 'נא לבחור סוג תזכורת.' });

            // Check granular page access
            if (rp[type] === false) {
                return res.status(403).json({ message: 'אין הרשאה לסוג תזכורת זה.' });
            }

            const reminder = await Reminder.create({
                companyId: user.companyId,
                type,
                agentCode: agentCode || '',
                customerName: customerName || '',
                idNumber: idNumber || '',
                phone: phone || '',
                policyNumber: policyNumber || '',
                insuranceCompany: insuranceCompany || '',
                date: date ? new Date(date) : null,
                amount: Number(amount) || 0,
                notes: notes || '',
                createdBy: user._id
            });

            return res.status(201).json({ message: 'התזכורת נוספה בהצלחה!', reminder });
        } catch (error) {
            console.error('Create reminder error:', error);
            return res.status(500).json({ message: 'שגיאת שרת.' });
        }
    }

    // PUT - Update reminder
    if (req.method === 'PUT') {
        try {
            const reminderId = url.split('/').pop();
            const reminder = await Reminder.findOne({ _id: reminderId, companyId: user.companyId });
            if (!reminder) return res.status(404).json({ message: 'תזכורת לא נמצאה.' });

            const { customerName, idNumber, phone, policyNumber,
                    insuranceCompany, date, amount, status, notes, agentCode, type } = req.body;

            if (customerName !== undefined) reminder.customerName = customerName;
            if (idNumber !== undefined) reminder.idNumber = idNumber;
            if (phone !== undefined) reminder.phone = phone;
            if (policyNumber !== undefined) reminder.policyNumber = policyNumber;
            if (insuranceCompany !== undefined) reminder.insuranceCompany = insuranceCompany;
            if (date !== undefined) reminder.date = date ? new Date(date) : null;
            if (amount !== undefined) reminder.amount = Number(amount) || 0;
            if (status !== undefined) reminder.status = status;
            if (notes !== undefined) reminder.notes = notes;
            if (agentCode !== undefined) reminder.agentCode = agentCode;
            if (type !== undefined) reminder.type = type;

            await reminder.save();
            return res.json({ message: 'התזכורת עודכנה בהצלחה!', reminder });
        } catch (error) {
            console.error('Update reminder error:', error);
            return res.status(500).json({ message: 'שגיאת שרת.' });
        }
    }

    // DELETE - Delete reminder
    if (req.method === 'DELETE') {
        try {
            const reminderId = url.split('/').pop();
            const result = await Reminder.deleteOne({ _id: reminderId, companyId: user.companyId });
            if (result.deletedCount === 0) return res.status(404).json({ message: 'תזכורת לא נמצאה.' });
            return res.json({ message: 'התזכורת נמחקה בהצלחה.' });
        } catch (error) {
            console.error('Delete reminder error:', error);
            return res.status(500).json({ message: 'שגיאת שרת.' });
        }
    }

    return res.status(405).json({ message: 'Method not allowed' });
};
