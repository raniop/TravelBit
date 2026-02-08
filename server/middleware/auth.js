const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify JWT token
const auth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        let token;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        } else if (req.query.token) {
            // Allow token in query params for file downloads (CSV export)
            token = req.query.token;
        }

        if (!token) {
            return res.status(401).json({ message: 'אין הרשאת גישה. נא להתחבר.' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.userId).select('-password');
        if (!user || !user.isActive) {
            return res.status(401).json({ message: 'משתמש לא נמצא או לא פעיל.' });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'הטוקן פג תוקף. נא להתחבר מחדש.' });
        }
        return res.status(401).json({ message: 'טוקן לא תקין.' });
    }
};

module.exports = auth;
