const { verifyAuth, cors } = require('../_lib/auth');
const connectDB = require('../_lib/db');
const { Company } = require('../_lib/models');

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

// Calculate KPIs from filtered policy data
// repType: 1=מחזור שנתי, 2=רווח שנתי, 3=מכירות יומיות, 4=פרמיה ממוצעת, 5=פוליסות, 6=מכירות יום נוכחי
function calculateKPIs(curPolicies, prevPolicies, month, year) {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

    // Current year values
    const curTurnover = curPolicies.reduce((sum, p) => sum + (Number(p.total) || 0), 0);
    const curProfit = curPolicies.reduce((sum, p) => sum + (Number(p.hatamTotal) || 0), 0);
    const curPolicyCount = curPolicies.length;
    const curAvgPremium = curPolicyCount > 0 ? curTurnover / curPolicyCount : 0;

    // Daily sales: turnover / number of days elapsed in month
    const daysInMonth = new Date(year, month, 0).getDate();
    const isCurrentMonth = (year === now.getFullYear() && month === (now.getMonth() + 1));
    const daysElapsed = isCurrentMonth ? now.getDate() : daysInMonth;
    const curDailySales = daysElapsed > 0 ? curTurnover / daysElapsed : 0;

    // Today's sales
    const curTodaySales = curPolicies
        .filter(p => p.issueDate && new Date(p.issueDate).toISOString().slice(0, 10) === todayStr)
        .reduce((sum, p) => sum + (Number(p.total) || 0), 0);

    // Previous year values
    const prevTurnover = prevPolicies.reduce((sum, p) => sum + (Number(p.total) || 0), 0);
    const prevProfit = prevPolicies.reduce((sum, p) => sum + (Number(p.hatamTotal) || 0), 0);
    const prevPolicyCount = prevPolicies.length;
    const prevAvgPremium = prevPolicyCount > 0 ? prevTurnover / prevPolicyCount : 0;
    const prevDailySales = daysInMonth > 0 ? prevTurnover / daysInMonth : 0;

    function pctDiff(cur, prev) {
        if (!prev || prev === 0) return cur > 0 ? 100 : 0;
        return ((cur - prev) / Math.abs(prev)) * 100;
    }

    return [
        { repType: 1, curYearValue: curTurnover, prevYearValue: prevTurnover, percentDiff: pctDiff(curTurnover, prevTurnover) },
        { repType: 2, curYearValue: curProfit, prevYearValue: prevProfit, percentDiff: pctDiff(curProfit, prevProfit) },
        { repType: 3, curYearValue: curDailySales, prevYearValue: prevDailySales, percentDiff: pctDiff(curDailySales, prevDailySales) },
        { repType: 4, curYearValue: curAvgPremium, prevYearValue: prevAvgPremium, percentDiff: pctDiff(curAvgPremium, prevAvgPremium) },
        { repType: 5, curYearValue: curPolicyCount, prevYearValue: prevPolicyCount, percentDiff: pctDiff(curPolicyCount, prevPolicyCount) },
        { repType: 6, curYearValue: curTodaySales, prevYearValue: 0, percentDiff: 0 }
    ];
}

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Auth: must be logged-in company user
    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ message: 'אין הרשאת גישה.' });
    if (user.role !== 'company') return res.status(403).json({ message: 'אין הרשאה.' });

    // Access control: company must have insurance access (dashboardModules)
    await connectDB();
    const company = await Company.findById(user.companyId).select('agentCodes dashboardModules insurancePages').lean();
    if (!company) return res.status(403).json({ message: 'אין הרשאה לנתוני ביטוח.' });
    const modules = company.dashboardModules || 'management';
    if (modules !== 'insurance' && modules !== 'both') {
        return res.status(403).json({ message: 'אין הרשאה לנתוני ביטוח.' });
    }
    // If agentCodes exist → filter by them; if empty → show all (no filtering)
    const agentCodes = (Array.isArray(company.agentCodes) && company.agentCodes.length > 0)
        ? company.agentCodes.map(String)
        : null;

    const ip = company.insurancePages || { dashboard: true, policies: true, agents: true, reports: true };

    const url = req.url.split('?')[0];

    // Granular page-level access check
    let pageType = null;
    if (url.includes('/external/dashboard') || url.includes('/external/yoy')) pageType = 'dashboard';
    else if (url.includes('/external/policies') || url.includes('/external/policy-details') || url.includes('/external/site-policies')) pageType = 'policies';
    else if (url.includes('/external/daily-report')) pageType = 'dashboard';

    if (pageType && ip[pageType] === false) {
        return res.status(403).json({ message: 'אין הרשאה לדף זה.' });
    }

    try {
        // Route: /api/dashboard/external/dashboard
        if (url.includes('/external/dashboard')) {
            const now = new Date();
            const month = Number(req.query.month) || (now.getMonth() + 1);
            const year = Number(req.query.year) || now.getFullYear();

            // === Ophir (no agentCodes): use original BituhOfir Dashboard API ===
            if (!agentCodes) {
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
                if (!Array.isArray(topPolicies)) topPolicies = [];

                return res.json({
                    ...calcData,
                    periods: Array.isArray(periods) ? periods : [],
                    riders: Array.isArray(riders) ? riders : [],
                    topPolicies,
                    requestedMonth: month,
                    requestedYear: year,
                    lastRefresh: new Date().toISOString()
                });
            }

            // === Other companies (with agentCodes): no data yet ===
            return res.json({
                dashboardCalcData: [],
                periods: [],
                riders: [],
                topPolicies: [],
                requestedMonth: month,
                requestedYear: year,
                lastRefresh: new Date().toISOString(),
                noData: true
            });
        }

        // Route: /api/dashboard/external/yoy - Build YoY monthly comparison
        if (url.includes('/external/yoy')) {
            const year = Number(req.query.year) || new Date().getFullYear();
            const prevYear = year - 1;
            const maxMonth = Number(req.query.month) || 12;

            // === Other companies (with agentCodes): no data yet ===
            if (agentCodes) {
                return res.json({ year, prevYear, yoyData: [], noData: true });
            }

            // === Ophir (no agentCodes): use original BituhOfir Dashboard API ===
            // Fetch GetDashboardCalcByData for each month (current + previous year)
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
            let curCumulative = 0;
            let prevCumulative = 0;
            for (let m = 1; m <= maxMonth; m++) {
                const curResult = results.find(r => r.month === m && r.year === year);
                const prevResult = results.find(r => r.month === m && r.year === prevYear);
                const curCalc = curResult?.data?.dashboardCalcData || [];
                const prevCalc = prevResult?.data?.dashboardCalcData || [];
                const curTurnover = curCalc.find(c => c.repType === 1);
                const prevTurnover = prevCalc.find(c => c.repType === 1);
                curCumulative += (curTurnover?.curYearValue || 0);
                prevCumulative += (prevTurnover?.curYearValue || 0);
                yoyData.push({
                    month: monthNames[m - 1],
                    monthNum: m,
                    currentYear: curCumulative,
                    previousYear: prevCumulative
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
            let data = await apiRes.json();

            // Filter by company's agentCodes (if set; null = show all)
            if (agentCodes) {
                if (Array.isArray(data)) {
                    data = data.filter(p => agentCodes.includes(String(p.agentCode)));
                } else if (data && data.agentCode && !agentCodes.includes(String(data.agentCode))) {
                    return res.status(403).json({ message: 'אין הרשאה לפוליסה זו.' });
                }
            }

            return res.json(data);
        }

        // Route: /api/dashboard/external/policy-details
        if (url.includes('/external/policy-details')) {
            const { policyIndex } = req.query;
            const apiRes = await bituhOfirFetch(`/api/Policy/GetPolicyCustomersDetailsByIndex?policyIndex=${policyIndex}`);
            const data = await apiRes.json();

            // Verify policy belongs to this company's agents (if agentCodes set)
            if (agentCodes && data && data.agentCode && !agentCodes.includes(String(data.agentCode))) {
                return res.status(403).json({ message: 'אין הרשאה לפוליסה זו.' });
            }

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
            let data = await apiRes.json();

            // Filter by company's agentCodes (if set; null = show all)
            if (agentCodes) {
                if (Array.isArray(data)) {
                    data = data.filter(p => agentCodes.includes(String(p.agentCode)));
                } else if (data && data.agentCode && !agentCodes.includes(String(data.agentCode))) {
                    return res.status(403).json({ message: 'אין הרשאה לפוליסה זו.' });
                }
            }

            return res.json(data);
        }

        return res.status(404).json({ message: 'Not found' });
    } catch (error) {
        console.error('External API error:', error.message || error);
        return res.status(502).json({ message: 'שגיאת תקשורת עם מערכת הביטוח.' });
    }
};
