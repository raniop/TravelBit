const jwt = require('jsonwebtoken');
const connectDB = require('../_lib/db');
const { User } = require('../_lib/models');
const { generateTokens, cors } = require('../_lib/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ message: 'חסר refresh token.' });

        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        await connectDB();
        const user = await User.findById(decoded.userId);
        if (!user || !user.isActive) return res.status(401).json({ message: 'משתמש לא תקין.' });

        const tokens = generateTokens(user._id, user.role);
        res.json(tokens);
    } catch {
        res.status(401).json({ message: 'Refresh token לא תקין.' });
    }
};
