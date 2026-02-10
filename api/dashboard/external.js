const { verifyAuth, cors } = require('../_lib/auth');

// Module-level token cache (survives warm invocations)
let bituhOfirToken = {
    accessToken: null,
    refreshToken: null,
    expiresAt: 0
};

const BASE = process.env.BITUHOFIR_API_BASE || 'http://109.226.23.217:5000';

// Login / refresh to BituhOfir API
async function getBituhOfirToken() {
    const now = Date.now();

    // Return cached token if still valid (60s buffer)
    if (bituhOfirToken.accessToken && bituhOfirToken.expiresAt > now + 60000) {
        return bituhOfirToken.accessToken;
    }

    // Try refresh first
    if (bituhOfirToken.refreshToken) {
        try {
            const r = await fetch(`${BASE}/api/Auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: bituhOfirToken.refreshToken })
            });
            if (r.ok) {
                const d = await r.json();
                bituhOfirToken.accessToken = d.token || d.accessToken;
                bituhOfirToken.refreshToken = d.refreshToken || bituhOfirToken.refreshToken;
                bituhOfirToken.expiresAt = now + 50 * 60 * 1000;
                return bituhOfirToken.accessToken;
            }
        } catch (_) { /* fall through to full login */ }
    }

    // Full login
    const r = await fetch(`${BASE}/api/Auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: process.env.BITUHOFIR_USERNAME,
            password: process.env.BITUHOFIR_PASSWORD
        })
    });

    if (!r.ok) throw new Error('BituhOfir login failed: ' + r.status);

    const d = await r.json();
    bituhOfirToken.accessToken = d.token || d.accessToken;
    bituhOfirToken.refreshToken = d.refreshToken;
    bituhOfirToken.expiresAt = now + 50 * 60 * 1000;
    return bituhOfirToken.accessToken;
}

// Make authenticated request to BituhOfir
async function bituhOfirFetch(path) {
    const token = await getBituhOfirToken();
    let r = await fetch(`${BASE}${path}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    // If 401 - invalidate cache and retry once
    if (r.status === 401) {
        bituhOfirToken.accessToken = null;
        bituhOfirToken.expiresAt = 0;
        const newToken = await getBituhOfirToken();
        r = await fetch(`${BASE}${path}`, {
            headers: {
                'Authorization': `Bearer ${newToken}`,
                'Content-Type': 'application/json'
            }
        });
    }

    return r;
}

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Auth: must be logged-in company user
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ message: 'אין הרשאת גישה.' });
    if (user.role !== 'company') return res.status(403).json({ message: 'אין הרשאה.' });

    // Access control: only Ophir company can access BituhOfir data
    if (process.env.OPHIR_COMPANY_ID && user.companyId.toString() !== process.env.OPHIR_COMPANY_ID) {
        return res.status(403).json({ message: 'אין הרשאה לנתוני ביטוח אופיר.' });
    }

    const url = req.url.split('?')[0];

    try {
        // Route: /api/dashboard/external/dashboard
        if (url.includes('/external/dashboard')) {
            const now = new Date();
            const month = req.query.month || (now.getMonth() + 1);
            const year = req.query.year || now.getFullYear();

            // Fetch KPI data + available periods in parallel
            const [calcRes, periodsRes] = await Promise.all([
                bituhOfirFetch(`/api/Dashboard/GetDashboardCalcByData?month=${month}&year=${year}`),
                bituhOfirFetch('/api/Dashboard')
            ]);

            const calcData = await calcRes.json();
            const periods = await periodsRes.json();

            return res.json({
                ...calcData,
                periods: Array.isArray(periods) ? periods : [],
                requestedMonth: Number(month),
                requestedYear: Number(year)
            });
        }

        // Route: /api/dashboard/external/policies
        if (url.includes('/external/policies')) {
            const { top, id, policyIndex } = req.query;
            let path = '/api/Policy';
            if (top) path = `/api/Policy/GetTopPolicies?top=${top}`;
            else if (policyIndex) path = `/api/Policy/GetPolicyDetailsById?policyIndex=${policyIndex}`;
            else if (id) path = `/api/Policy/GetById?id=${id}`;
            const apiRes = await bituhOfirFetch(path);
            const data = await apiRes.json();
            return res.json(data);
        }

        // Route: /api/dashboard/external/policy-details
        if (url.includes('/external/policy-details')) {
            const { policyIndex } = req.query;
            const apiRes = await bituhOfirFetch(`/api/Policy/GetPolicyCustomersDetailsByIndex?policyIndex=${policyIndex}`);
            const data = await apiRes.json();
            return res.json(data);
        }

        // Route: /api/dashboard/external/daily-report
        if (url.includes('/external/daily-report')) {
            const apiRes = await bituhOfirFetch('/api/Policy/getDailyReportRiderList');
            const data = await apiRes.json();
            return res.json(data);
        }

        // Route: /api/dashboard/external/site-policies
        if (url.includes('/external/site-policies')) {
            const { top, id } = req.query;
            let path = '/api/SitePolicy';
            if (top) path = `/api/SitePolicy/GetTopPolicies?top=${top}`;
            else if (id) path = `/api/SitePolicy/GetById?id=${id}`;
            const apiRes = await bituhOfirFetch(path);
            const data = await apiRes.json();
            return res.json(data);
        }

        return res.status(404).json({ message: 'Not found' });
    } catch (error) {
        console.error('External API error:', error.message || error);
        return res.status(502).json({ message: 'שגיאת תקשורת עם מערכת ביטוח אופיר.' });
    }
};
