const connectDB = require('../_lib/db');
const { Trip, Employee } = require('../_lib/models');
const { verifyAuth, cors } = require('../_lib/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ message: 'אין הרשאת גישה.' });
    if (user.role !== 'company') return res.status(403).json({ message: 'אין הרשאה.' });

    await connectDB();
    const companyId = user.companyId;

    // GET - List trips
    if (req.method === 'GET') {
        try {
            const { status, employee, destination, startDate, endDate, page = 1, limit = 50 } = req.query;
            const filter = { companyId };

            if (status) filter.status = status;
            if (employee) filter.employeeId = employee;
            if (destination) filter.destination = { $regex: destination, $options: 'i' };
            if (startDate) filter.departureDate = { ...filter.departureDate, $gte: new Date(startDate) };
            if (endDate) filter.returnDate = { ...filter.returnDate, $lte: new Date(endDate) };

            const skip = (parseInt(page) - 1) * parseInt(limit);
            const [trips, total] = await Promise.all([
                Trip.find(filter).populate('employeeId', 'firstName lastName department').sort({ departureDate: -1 }).skip(skip).limit(parseInt(limit)),
                Trip.countDocuments(filter)
            ]);

            return res.json({ trips, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
        } catch (error) {
            console.error('Trips list error:', error);
            return res.status(500).json({ message: 'שגיאת שרת.' });
        }
    }

    // POST - Create trip
    if (req.method === 'POST') {
        try {
            const { employeeId, destination, departureDate, returnDate, purpose, status, cost, currency, workdaysAbroad, notes } = req.body;

            if (!employeeId || !destination || !departureDate || !returnDate) {
                return res.status(400).json({ message: 'נא למלא עובד, יעד, תאריך יציאה ותאריך חזרה.' });
            }

            // Verify employee belongs to this company
            const emp = await Employee.findOne({ _id: employeeId, companyId });
            if (!emp) {
                return res.status(400).json({ message: 'העובד לא נמצא.' });
            }

            // Calculate duration
            const dep = new Date(departureDate);
            const ret = new Date(returnDate);
            const duration = Math.ceil((ret - dep) / (1000 * 60 * 60 * 24));

            const trip = await Trip.create({
                companyId,
                employeeId,
                destination,
                departureDate: dep,
                returnDate: ret,
                duration,
                purpose: purpose || '',
                status: status || 'planned',
                cost: cost ? parseFloat(cost) : 0,
                currency: currency || 'ILS',
                workdaysAbroad: workdaysAbroad ? parseInt(workdaysAbroad) : 0,
                notes: notes || ''
            });

            return res.status(201).json({ message: 'הנסיעה נוספה בהצלחה.', trip });
        } catch (error) {
            console.error('Create trip error:', error);
            return res.status(500).json({ message: 'שגיאת שרת.' });
        }
    }

    // PUT - Update trip
    if (req.method === 'PUT') {
        try {
            const { id } = req.query;
            if (!id) return res.status(400).json({ message: 'חסר מזהה נסיעה.' });

            const { employeeId, destination, departureDate, returnDate, purpose, status, cost, currency, workdaysAbroad, notes } = req.body;

            const updateFields = {};
            if (employeeId !== undefined) {
                // Verify employee belongs to this company
                const emp = await Employee.findOne({ _id: employeeId, companyId });
                if (!emp) return res.status(400).json({ message: 'העובד לא נמצא.' });
                updateFields.employeeId = employeeId;
            }
            if (destination !== undefined) updateFields.destination = destination;
            if (departureDate !== undefined) updateFields.departureDate = new Date(departureDate);
            if (returnDate !== undefined) updateFields.returnDate = new Date(returnDate);
            if (purpose !== undefined) updateFields.purpose = purpose;
            if (status !== undefined) updateFields.status = status;
            if (cost !== undefined) updateFields.cost = parseFloat(cost);
            if (currency !== undefined) updateFields.currency = currency;
            if (workdaysAbroad !== undefined) updateFields.workdaysAbroad = parseInt(workdaysAbroad);
            if (notes !== undefined) updateFields.notes = notes;

            // Recalculate duration if dates changed
            if (updateFields.departureDate || updateFields.returnDate) {
                const existing = await Trip.findOne({ _id: id, companyId });
                if (existing) {
                    const dep = updateFields.departureDate || existing.departureDate;
                    const ret = updateFields.returnDate || existing.returnDate;
                    updateFields.duration = Math.ceil((new Date(ret) - new Date(dep)) / (1000 * 60 * 60 * 24));
                }
            }

            const trip = await Trip.findOneAndUpdate(
                { _id: id, companyId },
                updateFields,
                { new: true, runValidators: true }
            ).populate('employeeId', 'firstName lastName department');

            if (!trip) return res.status(404).json({ message: 'נסיעה לא נמצאה.' });

            return res.json({ message: 'הנסיעה עודכנה בהצלחה.', trip });
        } catch (error) {
            console.error('Update trip error:', error);
            return res.status(500).json({ message: 'שגיאת שרת.' });
        }
    }

    // DELETE - Cancel trip (soft delete)
    if (req.method === 'DELETE') {
        try {
            const { id } = req.query;
            if (!id) return res.status(400).json({ message: 'חסר מזהה נסיעה.' });

            const trip = await Trip.findOneAndUpdate(
                { _id: id, companyId },
                { status: 'cancelled' },
                { new: true }
            );

            if (!trip) return res.status(404).json({ message: 'נסיעה לא נמצאה.' });

            return res.json({ message: 'הנסיעה בוטלה בהצלחה.' });
        } catch (error) {
            console.error('Cancel trip error:', error);
            return res.status(500).json({ message: 'שגיאת שרת.' });
        }
    }

    return res.status(405).json({ message: 'Method not allowed' });
};
