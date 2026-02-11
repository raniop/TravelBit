const { verifyAuth, cors } = require('../_lib/auth');
const connectDB = require('../_lib/db');
const { Company, normalizeDashboardModules } = require('../_lib/models');

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
async function bituhOfirFetch(path, timeoutMs = 8000) {
    const token = await getBituhOfirToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        let r = await fetch(`${BASE}${path}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            signal: controller.signal
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
                },
                signal: controller.signal
            });
        }

        return r;
    } finally {
        clearTimeout(timer);
    }
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

// Module-level cache for resolved agent indexes (survives warm invocations)
const agentIndexCache = new Map(); // agentCode → agentIndex
let agentIndexCacheTime = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Translate agentCodes (e.g. ['54']) → agentIndexes (e.g. [14179]) via GetAgentsReport
// Uses cache to avoid repeated slow API calls
async function resolveAgentIndexes(agentCodes) {
    const now = Date.now();
    // Check cache first
    if (now - agentIndexCacheTime < CACHE_TTL) {
        const cached = agentCodes.map(c => agentIndexCache.get(String(c))).filter(Boolean);
        if (cached.length === agentCodes.length) return cached;
    }

    const resolved = [];
    const codesSet = new Set(agentCodes.map(c => String(c)));
    const foundCodes = new Set();
    let page = 1;
    const PS = 100; // smaller pages = faster response from external API

    while (foundCodes.size < codesSet.size) {
        try {
            const apiRes = await bituhOfirFetch(`/api/Policy/GetAgentsReport?page=${page}&pageSize=${PS}`, 20000);
            const data = await apiRes.json();
            const items = Array.isArray(data) ? data : (data && data.items ? data.items : []);
            if (items.length === 0) break;

            for (const agent of items) {
                const code = String(agent.agentCode);
                if (codesSet.has(code) && !foundCodes.has(code)) {
                    foundCodes.add(code);
                    const idx = Math.round(Number(agent.agentIndex));
                    resolved.push(idx);
                    agentIndexCache.set(code, idx);
                }
            }

            // Stop early if we found all codes
            if (foundCodes.size >= codesSet.size) break;
            if (items.length < PS) break; // last page
            page++;
            if (page > 50) break; // safety limit for 1000+ agents at 100/page
        } catch (err) {
            console.error('resolveAgentIndexes error page', page, err.message);
            break;
        }
    }

    if (resolved.length > 0) agentIndexCacheTime = now;
    return resolved;
}

// Fetch ALL policies for a single agent+month (handles pagination)
async function fetchAllPoliciesByAgent(agentIndex, year, month) {
    let all = [];
    let page = 1;
    const PS = 500;

    while (true) {
        const apiRes = await bituhOfirFetch(
            `/api/Policy/GetPolicyDetailsByAgent?agentIndex=${agentIndex}&bYear=${year}&bMonth=${month}&page=${page}&pageSize=${PS}`,
            20000
        );
        const data = await apiRes.json();
        const items = Array.isArray(data) ? data : (data && data.items ? data.items : []);
        all = all.concat(items);
        if (items.length < PS || items.length === 0) break;
        page++;
        if (page > 20) break;
    }

    return all;
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
    const dm = normalizeDashboardModules(company.dashboardModules);
    if (!dm.insurance) {
        return res.status(403).json({ message: 'אין הרשאה לנתוני ביטוח.' });
    }
    // If agentCodes exist → filter by them; if empty → show all (no filtering)
    let rawAgentCodes = (Array.isArray(company.agentCodes) && company.agentCodes.length > 0)
        ? company.agentCodes.map(String)
        : null;

    // Auto-resolve: if any agentCode is small (≤1000), it's an agentCode not agentIndex.
    // Resolve once and save back to DB so future requests are instant.
    if (rawAgentCodes && rawAgentCodes.some(c => Number(c) <= 1000)) {
        const smallCodes = rawAgentCodes.filter(c => Number(c) <= 1000);
        const alreadyResolved = rawAgentCodes.filter(c => Number(c) > 1000);
        try {
            const resolved = await resolveAgentIndexes(smallCodes);
            if (resolved.length > 0) {
                const newCodes = [...alreadyResolved, ...resolved.map(String)];
                // Update DB so next time it's instant
                await Company.updateOne(
                    { _id: user.companyId },
                    { $set: { agentCodes: newCodes } }
                );
                rawAgentCodes = newCodes;
                console.log('AUTO-RESOLVE: updated agentCodes', smallCodes, '→', resolved, 'saved to DB');
            }
        } catch (err) {
            console.error('AUTO-RESOLVE error:', err.message);
            // Continue with what we have
        }
    }

    const isAlreadyIndexes = rawAgentCodes && rawAgentCodes.every(c => Number(c) > 1000);
    const agentCodes = rawAgentCodes;

    const ip = company.insurancePages || { dashboard: true, policies: true, agents: true, reports: true };

    const url = req.url.split('?')[0];

    // Granular page-level access check
    let pageType = null;
    if (url.includes('/external/dashboard') || url.includes('/external/yoy')) pageType = 'dashboard';
    else if (url.includes('/external/policies') || url.includes('/external/policy-details') || url.includes('/external/site-policies')) pageType = 'policies';
    else if (url.includes('/external/daily-report')) pageType = 'dashboard';
    else if (url.includes('/external/agents-report')) pageType = 'reports';
    else if (url.includes('/external/agents')) pageType = 'agents';

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

            // === Other companies (with agentCodes): two-step approach ===
            // Step 1: Get agentIndexes — skip resolve if already stored as indexes
            const agentIndexes = isAlreadyIndexes
                ? agentCodes.map(Number)
                : await resolveAgentIndexes(agentCodes);
            console.log('DASH: agentCodes=', agentCodes, 'isAlreadyIndexes=', isAlreadyIndexes, 'agentIndexes=', agentIndexes);

            if (agentIndexes.length === 0) {
                return res.json({
                    dashboardCalcData: [
                        { repType: 1, curYearValue: 0, prevYearValue: 0, percentDiff: 0 },
                        { repType: 5, curYearValue: 0, prevYearValue: 0, percentDiff: 0 },
                        { repType: 6, curYearValue: 0, prevYearValue: 0, percentDiff: 0 }
                    ],
                    periods: [], riders: [], topPolicies: [],
                    requestedMonth: month, requestedYear: year,
                    lastRefresh: new Date().toISOString()
                });
            }

            // Step 2: For each agentIndex, fetch policies for all months YTD
            // Use sequential fetching to avoid overloading external API
            let allPolicies = [];
            for (const idx of agentIndexes) {
                // Fetch all months for this agent in parallel (max ~12 concurrent)
                const monthPromises = [];
                for (let m = 1; m <= month; m++) {
                    monthPromises.push(
                        fetchAllPoliciesByAgent(idx, year, m)
                            .catch(err => { console.error(`DASH: Error agent ${idx} month ${m}:`, err.message); return []; })
                    );
                }
                const monthResults = await Promise.all(monthPromises);
                for (const policies of monthResults) {
                    allPolicies = allPolicies.concat(policies);
                }
            }
            console.log('DASH: total policies fetched=', allPolicies.length);

            // Step 3: Calculate KPIs from real policy data
            const calcData = calculateKPIs(allPolicies, [], month, year);
            // Only send repType 1 (turnover), 5 (policies), 6 (today's sales)
            const filteredCalc = calcData.filter(c => [1, 5, 6].includes(c.repType));

            return res.json({
                dashboardCalcData: filteredCalc,
                periods: [], riders: [], topPolicies: [],
                requestedMonth: month, requestedYear: year,
                lastRefresh: new Date().toISOString()
            });
        }

        // Route: /api/dashboard/external/yoy - Build YoY monthly comparison
        if (url.includes('/external/yoy')) {
            const year = Number(req.query.year) || new Date().getFullYear();
            const prevYear = year - 1;
            const maxMonth = Number(req.query.month) || 12;

            // === Other companies (with agentCodes): build YoY from GetPolicyDetailsByAgent ===
            if (agentCodes) {
                const agentIndexes = isAlreadyIndexes
                    ? agentCodes.map(Number)
                    : await resolveAgentIndexes(agentCodes);
                if (agentIndexes.length === 0) {
                    return res.json({ year, prevYear, yoyData: [] });
                }

                const monthNames = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

                // Build all fetch tasks: { month, yearVal, agentIdx } → turnover
                const tasks = [];
                for (let m = 1; m <= maxMonth; m++) {
                    for (const idx of agentIndexes) {
                        tasks.push({ m, y: year, idx });
                        tasks.push({ m, y: prevYear, idx });
                    }
                }

                // Execute all in parallel (limited by external API speed)
                const results = await Promise.all(
                    tasks.map(t =>
                        fetchAllPoliciesByAgent(t.idx, t.y, t.m)
                            .then(policies => ({ m: t.m, y: t.y, total: policies.reduce((s, p) => s + (Number(p.total) || 0), 0) }))
                            .catch(() => ({ m: t.m, y: t.y, total: 0 }))
                    )
                );

                // Aggregate by month+year
                const yoyData = [];
                for (let m = 1; m <= maxMonth; m++) {
                    const curTotal = results.filter(r => r.m === m && r.y === year).reduce((s, r) => s + r.total, 0);
                    const prevTotal = results.filter(r => r.m === m && r.y === prevYear).reduce((s, r) => s + r.total, 0);
                    yoyData.push({
                        month: monthNames[m - 1],
                        monthNum: m,
                        currentYear: curTotal,
                        previousYear: prevTotal
                    });
                }

                return res.json({ year, prevYear, yoyData });
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
            // NOTE: GetDashboardCalcByData returns YTD (year-to-date) cumulative values,
            // so we subtract previous month to get the individual monthly value.
            const monthNames = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
            const yoyData = [];
            let prevCurYTD = 0;
            let prevPrevYTD = 0;
            for (let m = 1; m <= maxMonth; m++) {
                const curResult = results.find(r => r.month === m && r.year === year);
                const prevResult = results.find(r => r.month === m && r.year === prevYear);
                const curCalc = curResult?.data?.dashboardCalcData || [];
                const prevCalc = prevResult?.data?.dashboardCalcData || [];
                const curTurnover = curCalc.find(c => c.repType === 1);
                const prevTurnover = prevCalc.find(c => c.repType === 1);
                const curYTD = curTurnover?.curYearValue || 0;
                const prevYTD = prevTurnover?.curYearValue || 0;
                // Subtract previous month's YTD to get this month only
                yoyData.push({
                    month: monthNames[m - 1],
                    monthNum: m,
                    currentYear: curYTD - prevCurYTD,
                    previousYear: prevYTD - prevPrevYTD
                });
                prevCurYTD = curYTD;
                prevPrevYTD = prevYTD;
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

        // Route: /api/dashboard/external/agents-report
        if (url.includes('/external/agents-report')) {
            // For companies with agentCodes, search all pages to find their agents
            if (agentCodes) {
                const codesSet = new Set(agentCodes);
                // Determine which field to match against
                const matchField = isAlreadyIndexes ? 'agentIndex' : 'agentCode';
                let matchedAgents = [];
                let pg = 1;
                const pgSize = 500;
                while (true) {
                    const apiRes = await bituhOfirFetch(`/api/Policy/GetAgentsReport?page=${pg}&pageSize=${pgSize}`, 20000);
                    const raw = await apiRes.json();
                    const items = Array.isArray(raw) ? raw : (raw && raw.items ? raw.items : []);
                    if (items.length === 0) break;
                    const found = items.filter(a => codesSet.has(String(Math.round(Number(a[matchField])))));
                    matchedAgents = matchedAgents.concat(found);
                    // Stop early if we found all
                    if (matchedAgents.length >= agentCodes.length) break;
                    if (items.length < pgSize) break;
                    pg++;
                    if (pg > 20) break;
                }
                return res.json({ items: matchedAgents, totalCount: matchedAgents.length });
            }

            // Ophir (no agentCodes): pass through as-is
            const page = Number(req.query.page) || 1;
            const pageSize = Number(req.query.pageSize) || 100;
            const apiRes = await bituhOfirFetch(`/api/Policy/GetAgentsReport?page=${page}&pageSize=${pageSize}`);
            const data = await apiRes.json();
            return res.json(data);
        }

        // Route: /api/dashboard/external/agents (agent drill-down — policies by agent)
        if (url.includes('/external/agents')) {
            let { agentIndex, year, month, page, pageSize } = req.query;

            if (!agentIndex) {
                return res.status(400).json({ message: 'חובה לציין קוד סוכן (agentIndex).' });
            }

            // Verify agent belongs to company
            if (agentCodes && !agentCodes.includes(String(agentIndex))) {
                return res.status(403).json({ message: 'אין הרשאה לנתוני סוכן זה.' });
            }

            // If agentCodes contains small agentCode values (not agentIndex), translate
            if (agentCodes && !isAlreadyIndexes) {
                const resolved = await resolveAgentIndexes([String(agentIndex)]);
                if (resolved.length > 0) {
                    agentIndex = resolved[0];
                }
            }

            const bYear = Number(year) || new Date().getFullYear();
            const bMonth = Number(month) || (new Date().getMonth() + 1);
            const p = Number(page) || 1;
            const ps = Number(pageSize) || 100;

            const apiRes = await bituhOfirFetch(
                `/api/Policy/GetPolicyDetailsByAgent?agentIndex=${agentIndex}&bYear=${bYear}&bMonth=${bMonth}&page=${p}&pageSize=${ps}`
            );
            const data = await apiRes.json();
            return res.json(data);
        }

        return res.status(404).json({ message: 'Not found' });
    } catch (error) {
        console.error('External API error:', error.message || error);
        return res.status(502).json({ message: 'שגיאת תקשורת עם מערכת הביטוח.' });
    }
};
