const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const router = express.Router();

// Generate tokens
function generateTokens(userId, role) {
    const accessToken = jwt.sign(
        { userId, role },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );
    const refreshToken = jwt.sign(
        { userId, role },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
    );
    return { accessToken, refreshToken };
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
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

        // Update last login
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
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({ message: 'חסר refresh token.' });
        }

        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        const user = await User.findById(decoded.userId);
        if (!user || !user.isActive) {
            return res.status(401).json({ message: 'משתמש לא תקין.' });
        }

        const tokens = generateTokens(user._id, user.role);
        res.json(tokens);
    } catch (error) {
        return res.status(401).json({ message: 'Refresh token לא תקין.' });
    }
});

// GET /api/auth/me - Get current user
router.get('/me', auth, async (req, res) => {
    res.json({ user: req.user });
});

module.exports = router;
