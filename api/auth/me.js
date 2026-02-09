const { verifyAuth, cors } = require('../_lib/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ message: 'אין הרשאת גישה.' });

    res.json({ user });
};
