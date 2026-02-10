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

            // Fetch KPI data + periods + riders + top policies in parallel
            const [calcRes, periodsRes, ridersRes, topPoliciesRes] = await Promise.all([
                bituhOfirFetch(`/api/Dashboard/GetDashboardCalcByData?month=${month}&year=${year}`),
                bituhOfirFetch('/api/Dashboard'),
                bituhOfirFetch('/api/Policy/getDailyReportRiderList').catch(() => null),
                bituhOfirFetch('/api/Policy/GetTopPolicies?top=500').catch(() => null)
            ]);

            const calcData = await calcRes.json();
            const periods = await periodsRes.json();

            let riders = [];
            try { if (ridersRes && ridersRes.ok) riders = await ridersRes.json(); } catch(_) {}

            let topPolicies = [];
            try { if (topPoliciesRes && topPoliciesRes.ok) topPolicies = await topPoliciesRes.json(); } catch(_) {}

            return res.json({
                ...calcData,
                periods: Array.isArray(periods) ? periods : [],
                riders: Array.isArray(riders) ? riders : [],
                topPolicies: Array.isArray(topPolicies) ? topPolicies : [],
                requestedMonth: Number(month),
                requestedYear: Number(year)
            });
        }

        // Route: /api/dashboard/external/yoy - Build YoY monthly comparison
        if (url.includes('/external/yoy')) {
            const year = Number(req.query.year) || new Date().getFullYear();
            const prevYear = year - 1;
            const maxMonth = Number(req.query.month) || 12;

            // Fetch current year and previous year data for each month (up to maxMonth)
            const promises = [];
            for (let m = 1; m <= maxMonth; m++) {
                promises.push(
                    bituhOfirFetch(`/api/Dashboard/GetDashboardCalcByData?month=${m}&year=${year}`)
                        .then(r => r.json()).then(d => ({ month: m, year, data: d })).catch(() => ({ month: m, year, data: null }))
                );
                promises.push(
                    bituhOfirFetch(`/api/Dashboard/GetDashboardCalcByData?month=${m}&year=${prevYear}`)
                        .then(r => r.json()).then(d => ({ month: m, year: prevYear, data: d })).catch(() => ({ month: m, year: prevYear, data: null }))
                );
            }

            const results = await Promise.all(promises);

            // Extract turnover (repType 1) for each month
            const monthNames = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
            const yoyData = [];
            for (let m = 1; m <= maxMonth; m++) {
                const curResult = results.find(r => r.month === m && r.year === year);
                const prevResult = results.find(r => r.month === m && r.year === prevYear);
                const curCalc = curResult?.data?.dashboardCalcData || [];
                const prevCalc = prevResult?.data?.dashboardCalcData || [];
                const curTurnover = curCalc.find(c => c.repType === 1);
                const prevTurnover = prevCalc.find(c => c.repType === 1);
                yoyData.push({
                    month: monthNames[m - 1],
                    monthNum: m,
                    currentYear: curTurnover?.curYearValue || 0,
                    previousYear: prevTurnover?.curYearValue || 0
                });
            }

            return res.json({ year, prevYear, yoyData });
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
