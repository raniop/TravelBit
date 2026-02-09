const jwt = require('jsonwebtoken');
const connectDB = require('./_lib/db');
const { User } = require('./_lib/models');
const { verifyAuth, generateTokens, cors } = require('./_lib/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Determine action from URL path
    const url = req.url.split('?')[0];
    let action = 'login';
    if (url.includes('/auth/refresh')) action = 'refresh';
    else if (url.includes('/auth/me')) action = 'me';
    else if (url.includes('/auth/login')) action = 'login';

    // === LOGIN ===
    if (action === 'login') {
        if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
        try {
            await connectDB();
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({ message: '\u05e0\u05d0 \u05dc\u05de\u05dc\u05d0 \u05e9\u05dd \u05de\u05e9\u05ea\u05de\u05e9 \u05d5\u05e1\u05d9\u05e1\u05de\u05d4.' });
            }

            const user = await User.findOne({ username: username.toLowerCase() });
            if (!user || !user.isActive) {
                return res.status(401).json({ message: '\u05e9\u05dd \u05de\u05e9\u05ea\u05de\u05e9 \u05d0\u05d5 \u05e1\u05d9\u05e1\u05de\u05d4 \u05e9\u05d2\u05d5\u05d9\u05d9\u05dd.' });
            }

            const isMatch = await user.comparePassword(password);
            if (!isMatch) {
                return res.status(401).json({ message: '\u05e9\u05dd \u05de\u05e9\u05ea\u05de\u05e9 \u05d0\u05d5 \u05e1\u05d9\u05e1\u05de\u05d4 \u05e9\u05d2\u05d5\u05d9\u05d9\u05dd.' });
            }

            // Fire-and-forget lastLogin update (don't wait)
            user.lastLogin = new Date();
            user.save().catch(() => {});

            const tokens = generateTokens(user);

            return res.json({
                ...tokens,
                user: {
                    id: user._id,
                    username: user.username,
                    name: user.name,
                    role: user.role,
                    companyId: user.companyId
                }
            });
        } catch (error) {
            console.error('Login error:', error);
            return res.status(500).json({ message: '\u05e9\u05d2\u05d9\u05d0\u05ea \u05e9\u05e8\u05ea.' });
        }
    }

    // === REFRESH ===
    if (action === 'refresh') {
        if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
        try {
            const { refreshToken } = req.body;
            if (!refreshToken) return res.status(400).json({ message: '\u05d7\u05e1\u05e8 refresh token.' });

            const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
            await connectDB();
            const user = await User.findById(decoded.userId);
            if (!user || !user.isActive) return res.status(401).json({ message: '\u05de\u05e9\u05ea\u05de\u05e9 \u05dc\u05d0 \u05ea\u05e7\u05d9\u05df.' });

            const tokens = generateTokens(user);
            return res.json(tokens);
        } catch {
            return res.status(401).json({ message: 'Refresh token \u05dc\u05d0 \u05ea\u05e7\u05d9\u05df.' });
        }
    }

    // === ME ===
    if (action === 'me') {
        const user = await verifyAuth(req);
        if (!user) return res.status(401).json({ message: '\u05d0\u05d9\u05df \u05d4\u05e8\u05e9\u05d0\u05ea \u05d2\u05d9\u05e9\u05d4.' });
        return res.json({ user });
    }

    return res.status(404).json({ message: 'Not found' });
};
