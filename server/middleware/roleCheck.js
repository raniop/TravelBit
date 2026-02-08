// Check if user has required role
const roleCheck = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'אין הרשאת גישה.' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'אין לך הרשאה לפעולה זו.' });
        }
        next();
    };
};

module.exports = roleCheck;
