const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const connectDB = require('./_lib/db');
const { User, Company, normalizeDashboardModules } = require('./_lib/models');
const { verifyAuth, generateTokens, cors } = require('./_lib/auth');

const SMS_BASE = process.env.BITUHOFIR_API_BASE || 'http://109.226.23.217:5000';

// Send SMS via BituhOfir API
async function sendSMS(phone, message) {
    try {
        const url = `${SMS_BASE}/api/message/sendsmsmessage?mobile=${encodeURIComponent(phone)}&message=${encodeURIComponent(message)}`;
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            return data.isSuccess === true;
        }
        return false;
    } catch (err) {
        console.error('SMS send error:', err.message);
        return false;
    }
}

// Generate random 6-digit OTP code
function generateOTP() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

// Mask phone number: 0501234567 → ****4567
function maskPhone(phone) {
    if (!phone || phone.length < 4) return '****';
    return '****' + phone.slice(-4);
}

// Fetch company metadata for user response
async function getCompanyMeta(companyId) {
    let companyName = null;
    let dashboardModules = { management: true, insurance: false, reminders: false };
    let insurancePages = { dashboard: true, policies: true, agents: true, reports: true };
    let reminderPages = { agentAppointment: true, policyCancellations: true, newProductions: true,
                          claims: true, firstDeposit: true, completingDeficiencies: true };

    if (companyId) {
        const company = await Company.findById(companyId).select('name agentCodes dashboardModules insurancePages reminderPages').lean();
        if (company) {
            companyName = company.name;
            dashboardModules = normalizeDashboardModules(company.dashboardModules);
            if (company.insurancePages) insurancePages = company.insurancePages;
            if (company.reminderPages) reminderPages = company.reminderPages;
        }
    }
    const hasBituhOfir = dashboardModules.insurance === true;
    const hasReminders = dashboardModules.reminders === true;
    const hasYeadim = dashboardModules.yeadim === true;
    return { companyName, dashboardModules, insurancePages, reminderPages, hasBituhOfir, hasReminders, hasYeadim };
}

// Build user response object
function buildUserResponse(user, meta) {
    return {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
        companyName: meta.companyName,
        hasBituhOfir: meta.hasBituhOfir,
        hasReminders: meta.hasReminders,
        hasYeadim: meta.hasYeadim,
        dashboardModules: meta.dashboardModules,
        insurancePages: meta.insurancePages,
        reminderPages: meta.reminderPages
    };
}

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const url = req.url.split('?')[0];
    let action = 'login';
    if (url.includes('/auth/verify-otp')) action = 'verify-otp';
    else if (url.includes('/auth/refresh')) action = 'refresh';
    else if (url.includes('/auth/me')) action = 'me';
    else if (url.includes('/auth/login')) action = 'login';

    // === LOGIN ===
    if (action === 'login') {
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

            // Admin: no OTP required — return tokens directly
            if (user.role === 'admin') {
                user.lastLogin = new Date();
                user.save().catch(() => {});

                const tokens = generateTokens(user);
                const meta = await getCompanyMeta(user.companyId);

                return res.json({
                    ...tokens,
                    user: buildUserResponse(user, meta)
                });
            }

            // Company user: OTP required
            if (!user.phone) {
                return res.status(400).json({
                    message: 'לא הוגדר מספר טלפון לחשבון זה. פנה למנהל המערכת.'
                });
            }

            // Generate OTP
            const otpPlain = generateOTP();
            const otpHashed = await bcrypt.hash(otpPlain, 8);

            // Save OTP to user
            user.otpCode = otpHashed;
            user.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
            user.otpAttempts = 0;
            await user.save();

            // Send SMS
            const smsMessage = `קוד אימות Travelins: ${otpPlain}`;
            const smsSent = await sendSMS(user.phone, smsMessage);

            if (!smsSent) {
                console.error('SMS failed for user:', user.username, 'phone:', user.phone);
                // Continue anyway — don't reveal SMS failure to user
            }

            // Generate short-lived OTP token (10 min, only contains userId)
            const otpToken = jwt.sign(
                { userId: user._id, purpose: 'otp' },
                process.env.JWT_SECRET,
                { expiresIn: '10m' }
            );

            return res.json({
                otpRequired: true,
                otpToken,
                maskedPhone: maskPhone(user.phone)
            });

        } catch (error) {
            console.error('Login error:', error);
            return res.status(500).json({ message: 'שגיאת שרת.' });
        }
    }

    // === VERIFY OTP ===
    if (action === 'verify-otp') {
        if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
        try {
            await connectDB();
            const { otpToken, otpCode } = req.body;

            if (!otpToken || !otpCode) {
                return res.status(400).json({ message: 'נא להזין את קוד האימות.' });
            }

            // Verify OTP token
            let decoded;
            try {
                decoded = jwt.verify(otpToken, process.env.JWT_SECRET);
                if (decoded.purpose !== 'otp') throw new Error('Invalid token purpose');
            } catch {
                return res.status(401).json({ message: 'פג תוקף האימות. נא להתחבר מחדש.' });
            }

            const user = await User.findById(decoded.userId);
            if (!user || !user.isActive) {
                return res.status(401).json({ message: 'משתמש לא תקין.' });
            }

            // Check attempts
            if (user.otpAttempts >= 5) {
                // Clear OTP data
                user.otpCode = null;
                user.otpExpiresAt = null;
                user.otpAttempts = 0;
                await user.save();
                return res.status(429).json({ message: 'יותר מדי ניסיונות. נא להתחבר מחדש.' });
            }

            // Check expiration
            if (!user.otpExpiresAt || user.otpExpiresAt < new Date()) {
                return res.status(401).json({ message: 'קוד האימות פג תוקף. נא לשלוח קוד חדש.' });
            }

            // Check OTP code is set
            if (!user.otpCode) {
                return res.status(401).json({ message: 'לא נמצא קוד אימות. נא להתחבר מחדש.' });
            }

            // Verify OTP code
            const isOtpMatch = await bcrypt.compare(otpCode, user.otpCode);
            if (!isOtpMatch) {
                user.otpAttempts += 1;
                await user.save();
                const remaining = 5 - user.otpAttempts;
                return res.status(401).json({
                    message: `קוד שגוי. נותרו ${remaining} ניסיונות.`
                });
            }

            // OTP correct! Clear OTP data and issue tokens
            user.otpCode = null;
            user.otpExpiresAt = null;
            user.otpAttempts = 0;
            user.lastLogin = new Date();
            await user.save();

            const tokens = generateTokens(user);
            const meta = await getCompanyMeta(user.companyId);

            return res.json({
                ...tokens,
                user: buildUserResponse(user, meta)
            });

        } catch (error) {
            console.error('Verify OTP error:', error);
            return res.status(500).json({ message: 'שגיאת שרת.' });
        }
    }

    // === REFRESH ===
    if (action === 'refresh') {
        if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
        try {
            const { refreshToken } = req.body;
            if (!refreshToken) return res.status(400).json({ message: 'חסר refresh token.' });

            const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
            await connectDB();
            const user = await User.findById(decoded.userId);
            if (!user || !user.isActive) return res.status(401).json({ message: 'משתמש לא תקין.' });

            const tokens = generateTokens(user);
            return res.json(tokens);
        } catch {
            return res.status(401).json({ message: 'Refresh token לא תקין.' });
        }
    }

    // === ME ===
    if (action === 'me') {
        await connectDB();
        const user = await verifyAuth(req);
        if (!user) return res.status(401).json({ message: 'אין הרשאת גישה.' });

        const meta = await getCompanyMeta(user.companyId);

        return res.json({
            user: buildUserResponse(user, meta)
        });
    }

    return res.status(404).json({ message: 'Not found' });
};
