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
// uniqueCountFn: optional function to count unique policies (for agent-mode where same policy spans months)
function calculateKPIs(curPolicies, prevPolicies, month, year, uniqueCountFn) {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

    // Current year values
    const curTurnover = curPolicies.reduce((sum, p) => sum + (Number(p.total) || 0), 0);
    const curProfit = curPolicies.reduce((sum, p) => sum + (Number(p.hatamTotal) || 0), 0);
    const curPolicyCount = uniqueCountFn ? uniqueCountFn(curPolicies) : curPolicies.length;
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
    const prevPolicyCount = uniqueCountFn ? uniqueCountFn(prevPolicies) : prevPolicies.length;
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
// If a value is already large (>1000), treat it as an agentIndex directly (no translation needed).
// Uses cache to avoid repeated slow API calls.
async function resolveAgentIndexes(agentCodes) {
    const now = Date.now();

    // Split: large numbers are already agentIndexes, small ones need resolution
    const alreadyIndexes = [];
    const needResolve = [];
    for (const c of agentCodes) {
        if (Number(c) > 1000) {
            alreadyIndexes.push(Number(c));
        } else {
            needResolve.push(String(c));
        }
    }

    // If nothing needs resolving, return immediately
    if (needResolve.length === 0) {
        console.log('resolveAgentIndexes: all already indexes:', alreadyIndexes);
        return alreadyIndexes;
    }

    // Check cache first for the ones that need resolving
    if (now - agentIndexCacheTime < CACHE_TTL) {
        const cached = needResolve.map(c => agentIndexCache.get(c)).filter(Boolean);
        if (cached.length === needResolve.length) {
            return [...alreadyIndexes, ...cached];
        }
    }

    const resolved = [];
    const codesSet = new Set(needResolve);
    const foundCodes = new Set();
    let page = 1;
    const PS = 100;

    while (foundCodes.size < codesSet.size) {
        try {
            const apiRes = await bituhOfirFetch(`/api/Policy/GetAgentsReport?page=${page}&pageSize=${PS}`, 20000);
            const data = await apiRes.json();
            const items = Array.isArray(data) ? data : (data && data.items ? data.items : []);
            if (items.length === 0) break;

            // Log first page to see API response structure
            if (page === 1) {
                console.log('resolveAgentIndexes: looking for codes:', [...codesSet]);
                console.log('resolveAgentIndexes: first 3 items sample:', JSON.stringify(items.slice(0, 3)));
            }

            for (const agent of items) {
                const code = String(agent.agentCode);
                if (codesSet.has(code) && !foundCodes.has(code)) {
                    foundCodes.add(code);
                    const idx = Math.round(Number(agent.agentIndex));
                    resolved.push(idx);
                    agentIndexCache.set(code, idx);
                    console.log(`resolveAgentIndexes: agentCode ${code} → agentIndex ${idx}`);
                }
            }

            if (foundCodes.size >= codesSet.size) break;
            if (items.length < PS) break;
            page++;
            if (page > 50) break;
        } catch (err) {
            console.error('resolveAgentIndexes error page', page, err.message);
            break;
        }
    }

    if (resolved.length > 0) agentIndexCacheTime = now;
    return [...alreadyIndexes, ...resolved];
}

// Fetch ALL policies for a single agent+month (handles pagination)
// NOTE: External API limits to 50 items per page regardless of pageSize param
async function fetchAllPoliciesByAgent(agentIndex, year, month) {
    let all = [];
    let page = 1;
    const PS = 50; // API max is 50 per page
    const TIMEOUT = 25000; // 25s per request — external API is very slow
    const MAX_RETRIES = 2;

    while (true) {
        let items = null;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const apiRes = await bituhOfirFetch(
                    `/api/Policy/GetPolicyDetailsByAgent?agentIndex=${agentIndex}&bYear=${year}&bMonth=${month}&page=${page}&pageSize=${PS}`,
                    TIMEOUT
                );
                const raw = await apiRes.json();
                // API might return array directly, or {items:[], totalCount:N}
                if (Array.isArray(raw)) {
                    items = raw;
                } else if (raw && raw.items) {
                    items = raw.items;
                } else {
                    if (page === 1) console.log(`fetchAllPolicies: agent=${agentIndex} ${month}/${year} unexpected format:`, JSON.stringify(raw).slice(0, 300));
                    items = [];
                }
                break; // success, exit retry loop
            } catch (err) {
                console.error(`fetchAllPolicies: agent=${agentIndex} ${month}/${year} page=${page} attempt=${attempt} ERROR: ${err.message}`);
                if (attempt === MAX_RETRIES) {
                    items = []; // give up after max retries
                }
                // wait 1s before retry
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        all = all.concat(items);
        if (items.length === 0) break;
        if (items.length < PS) break;
        page++;
        if (page > 100) break; // safety: max 5000 policies per agent/month
    }

    console.log(`fetchAllPolicies: agent=${agentIndex} ${month}/${year}: ${all.length} policies, ${page} page(s)`);
    return all;
}

// Run tasks with limited concurrency to avoid Vercel timeout
async function runWithConcurrency(tasks, concurrency) {
    const results = [];
    let index = 0;

    async function worker() {
        while (index < tasks.length) {
            const i = index++;
            results[i] = await tasks[i]();
        }
    }

    const workers = [];
    for (let w = 0; w < Math.min(concurrency, tasks.length); w++) {
        workers.push(worker());
    }
    await Promise.all(workers);
    return results;
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

            // === Other companies (with agentCodes): always fetch live data ===
            // Always resolve agentCode→agentIndex via GetAgentsReport (cached in-memory 30min)
            const agentIndexes = await resolveAgentIndexes(agentCodes);
            console.log('DASH: agentCodes=', agentCodes, 'agentIndexes=', agentIndexes);

            if (agentIndexes.length === 0) {
                const emptyResult = {
                    dashboardCalcData: [
                        { repType: 1, curYearValue: 0, prevYearValue: 0, percentDiff: 0 },
                        { repType: 5, curYearValue: 0, prevYearValue: 0, percentDiff: 0 },
                        { repType: 6, curYearValue: 0, prevYearValue: 0, percentDiff: 0 }
                    ],
                    periods: [], riders: [], topPolicies: [],
                    yoyData: [], yoyYear: year, yoyPrevYear: year - 1,
                    requestedMonth: month, requestedYear: year,
                    lastRefresh: new Date().toISOString()
                };
                return res.json(emptyResult);
            }

            // Fetch current year + previous year policies with limited concurrency
            // to avoid Vercel timeout (maxDuration=60s)
            const prevYear = year - 1;
            const allTasks = [];
            // Prioritize current year first (more important), then previous year
            for (const idx of agentIndexes) {
                for (let m = 1; m <= month; m++) {
                    allTasks.push({ idx, y: year, m });
                }
            }
            for (const idx of agentIndexes) {
                for (let m = 1; m <= month; m++) {
                    allTasks.push({ idx, y: prevYear, m });
                }
            }

            console.log(`DASH: fetching ${allTasks.length} tasks (${agentIndexes.length} agents × ${month} months × 2 years), concurrency=3`);
            const startTime = Date.now();

            const allResults = await runWithConcurrency(
                allTasks.map(t => async () => {
                    try {
                        const policies = await fetchAllPoliciesByAgent(t.idx, t.y, t.m);
                        return { ...t, policies };
                    } catch (err) {
                        console.error(`DASH: Error agent ${t.idx} y=${t.y} m=${t.m}:`, err.message);
                        return { ...t, policies: [] };
                    }
                }),
                3 // max 3 concurrent requests
            );

            console.log(`DASH: all fetches done in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

            // Split into current year and previous year
            const curPolicies = allResults.filter(r => r.y === year).flatMap(r => r.policies);
            const prevPolicies = allResults.filter(r => r.y === prevYear).flatMap(r => r.policies);
            // Detailed per-month log
            for (let m = 1; m <= month; m++) {
                const curM = allResults.filter(r => r.m === m && r.y === year).reduce((s, r) => s + r.policies.length, 0);
                const prevM = allResults.filter(r => r.m === m && r.y === prevYear).reduce((s, r) => s + r.policies.length, 0);
                console.log(`DASH: month ${m}/${year}: ${curM} policies | month ${m}/${prevYear}: ${prevM} policies`);
            }
            console.log('DASH: TOTAL curPolicies=', curPolicies.length, 'prevPolicies=', prevPolicies.length);

            // NO dedup — same policy can appear in multiple months with different premiums.
            // Each month is a separate billing period, so we sum ALL entries.
            // For policy COUNT, we count unique policies across all months.
            function countUniquePolicies(policies) {
                const seen = new Set();
                policies.forEach(p => {
                    const key = p.policyIndex || p.fullPolicyID || '';
                    if (key) seen.add(key);
                });
                return seen.size || policies.length;
            }

            // Calculate KPIs — use all policies for turnover, unique count for policy count
            const calcData = calculateKPIs(curPolicies, prevPolicies, month, year, countUniquePolicies);
            const filteredCalc = calcData.filter(c => [1, 5, 6].includes(c.repType));

            // Build YoY data from the same results
            const monthNames = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
            const yoyData = [];
            for (let m = 1; m <= month; m++) {
                const curTotal = allResults.filter(r => r.m === m && r.y === year)
                    .reduce((s, r) => s + r.policies.reduce((ps, p) => ps + (Number(p.total) || 0), 0), 0);
                const prevTotal = allResults.filter(r => r.m === m && r.y === prevYear)
                    .reduce((s, r) => s + r.policies.reduce((ps, p) => ps + (Number(p.total) || 0), 0), 0);
                yoyData.push({
                    month: monthNames[m - 1],
                    monthNum: m,
                    currentYear: curTotal,
                    previousYear: prevTotal
                });
            }

            const freshResult = {
                dashboardCalcData: filteredCalc,
                periods: [], riders: [], topPolicies: [],
                yoyData, yoyYear: year, yoyPrevYear: prevYear,
                requestedMonth: month, requestedYear: year,
                lastRefresh: new Date().toISOString()
            };

            return res.json(freshResult);
        }

        // Route: /api/dashboard/external/yoy - Build YoY monthly comparison
        if (url.includes('/external/yoy')) {
            const year = Number(req.query.year) || new Date().getFullYear();
            const prevYear = year - 1;
            const maxMonth = Number(req.query.month) || 12;

            // === Other companies (with agentCodes): build YoY from GetPolicyDetailsByAgent ===
            if (agentCodes) {
                const agentIndexes = await resolveAgentIndexes(agentCodes);
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

                // Execute with limited concurrency
                const results = await runWithConcurrency(
                    tasks.map(t => async () => {
                        try {
                            const policies = await fetchAllPoliciesByAgent(t.idx, t.y, t.m);
                            return { m: t.m, y: t.y, total: policies.reduce((s, p) => s + (Number(p.total) || 0), 0) };
                        } catch (err) {
                            return { m: t.m, y: t.y, total: 0 };
                        }
                    }),
                    3
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
                // Always match by agentCode (what the admin enters)
                const matchField = 'agentCode';
                let matchedAgents = [];
                let pg = 1;
                const pgSize = 500;
                while (true) {
                    const apiRes = await bituhOfirFetch(`/api/Policy/GetAgentsReport?page=${pg}&pageSize=${pgSize}`, 20000);
                    const raw = await apiRes.json();
                    const items = Array.isArray(raw) ? raw : (raw && raw.items ? raw.items : []);
                    if (items.length === 0) break;
                    const found = items.filter(a => codesSet.has(String(Math.round(Number(a[matchField])))));
                    if (found.length > 0) {
                        console.log('agents-report: found agents, sample:', JSON.stringify(found[0]));
                    }
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

            // Always translate agentCode → agentIndex via GetAgentsReport
            if (agentCodes) {
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
