const jwt = require('jsonwebtoken');
const connectDB = require('./db');
const { User } = require('./models');

async function verifyAuth(req) {
    const authHeader = req.headers.authorization;
    let token;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
        token = req.query.token;
    }

    if (!token) return null;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        await connectDB();
        const user = await User.findById(decoded.userId).select('-password');
        if (!user || !user.isActive) return null;
        return user;
    } catch {
        return null;
    }
}

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

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

module.exports = { verifyAuth, generateTokens, cors };
