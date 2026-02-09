const connectDB = require('../_lib/db');
const { User } = require('../_lib/models');
const { generateTokens, cors } = require('../_lib/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

    try {
        await connectDB();
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'נא למלא שם משתמש וסיסמה.' });
        }

        const user = await User.findOne({ username: username.toLowerCase() });
        if (!user || !user.isActive) {
            return res.status(401).json({ message: 'שם משתמש או סיסמה שגויים.' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'שם משתמש או סיסמה שגויים.' });
        }

        user.lastLogin = new Date();
        await user.save();

        const tokens = generateTokens(user._id, user.role);

        res.json({
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
        res.status(500).json({ message: 'שגיאת שרת.' });
    }
};
