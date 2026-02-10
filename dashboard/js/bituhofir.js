// BituhOfir Dashboard JS
let regionChart, ridersChart, salesYoYChart;
let allAgents = [];

document.addEventListener('DOMContentLoaded', () => {
    initUser();
    initDateFilters();
    loadBituhOfirDashboard();
});

function initUser() {
    const user = getUser();
    if (user) {
        const nameEl = document.getElementById('userName');
        const avatarEl = document.getElementById('userAvatar');
        const companyEl = document.getElementById('companyName');
        if (nameEl) nameEl.textContent = user.name || 'חברה';
        if (avatarEl) avatarEl.textContent = (user.name || 'C').charAt(0);
        if (companyEl) companyEl.textContent = user.name || 'חברה';
    }
}

function initDateFilters() {
    const now = new Date();
    const monthSelect = document.getElementById('filterMonth');
    const yearSelect = document.getElementById('filterYear');

    const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
                    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

    months.forEach((name, i) => {
        const opt = document.createElement('option');
        opt.value = i + 1;
        opt.textContent = name;
        if (i + 1 === now.getMonth() + 1) opt.selected = true;
        monthSelect.appendChild(opt);
    });

    for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        if (y === now.getFullYear()) opt.selected = true;
        yearSelect.appendChild(opt);
    }
}

function loadWithFilter() {
    const month = document.getElementById('filterMonth').value;
    const year = document.getElementById('filterYear').value;
    loadBituhOfirDashboard(month, year);
}

function loadCurrent() {
    const now = new Date();
    document.getElementById('filterMonth').value = now.getMonth() + 1;
    document.getElementById('filterYear').value = now.getFullYear();
    loadBituhOfirDashboard();
}

async function loadBituhOfirDashboard(month, year) {
    showError(null);

    try {
        let url = '/dashboard/external/dashboard';
        if (month && year) {
            url += `?month=${month}&year=${year}`;
        }

        const res = await apiFetch(url);
        if (!res) return;

        if (res.status === 403) {
            showError('אין הרשאה לצפות בנתוני ביטוח אופיר.');
            return;
        }

        if (!res.ok) {
            showError('שגיאה בטעינת נתונים מביטוח אופיר (קוד: ' + res.status + ')');
            return;
        }

        const data = await res.json();
        console.log('BituhOfir Dashboard Data:', data);

        // Update timestamp from API
        const tsEl = document.getElementById('lastUpdate');
        if (tsEl) {
            const lr = data.lastRefresh ? new Date(data.lastRefresh).toLocaleString('he-IL') : new Date().toLocaleTimeString('he-IL');
            tsEl.textContent = 'עדכון אחרון: ' + lr;
        }

        // API returns: { lastRefresh, dashboardCalcData: [...], periods: [...] }
        updateKPIs(data.dashboardCalcData || []);
        renderAgentsTable(data);
        renderRegionChart(data);
        renderRidersChart(data);
        renderSalesYoYChart(data);
    } catch (err) {
        console.error('Error loading BituhOfir data:', err);
        showError('שגיאת תקשורת עם מערכת ביטוח אופיר.');
    }
}

function showError(msg) {
    const el = document.getElementById('errorBanner');
    if (!msg) {
        el.classList.remove('show');
        return;
    }
    el.textContent = msg;
    el.classList.add('show');
}

// ==================== KPIs ====================
// API returns dashboardCalcData array:
// [{ repType: 1, curYearValue, prevYearValue, percentDiff, calcTitle }]
// repType mapping:
// 1 = מחזור שנתי מצטבר
// 2 = רווח שנתי מצטבר
// 3 = מכירות יומיות שת"פים
// 4 = פרמיה ממוצעת
// 5 = סה"כ פוליסות מתחילת שנה
// 6 = סה"כ מכירות ליום נוכחי

const KPI_MAP = {
    1: { id: 'kpiTurnover', prefix: '$' },       // מחזור שנתי מצטבר
    4: { id: 'kpiAvgPremium', prefix: '$' },      // פרמיה ממוצעת
    2: { id: 'kpiProfit', prefix: '$' },           // רווח שנתי מצטבר
    5: { id: 'kpiPolicies', prefix: '' },          // סה"כ פוליסות מתחילת שנה
    3: { id: 'kpiDailySales', prefix: '$' },       // מכירות יומיות שת"פים
    6: { id: 'kpiTodaySales', prefix: '$' }        // סה"כ מכירות ליום נוכחי
};

function updateKPIs(calcData) {
    if (!Array.isArray(calcData)) return;

    // Reset all KPIs
    Object.values(KPI_MAP).forEach(kpi => {
        const el = document.getElementById(kpi.id);
        if (el) el.textContent = '-';
        const changeEl = document.getElementById(kpi.id + 'Change');
        if (changeEl) changeEl.innerHTML = '';
        const prevEl = document.getElementById(kpi.id + 'Prev');
        if (prevEl) prevEl.textContent = '';
    });

    calcData.forEach(item => {
        const kpi = KPI_MAP[item.repType];
        if (!kpi) return;

        // Set main value
        const el = document.getElementById(kpi.id);
        if (el) {
            const val = item.curYearValue;
            el.textContent = kpi.prefix + formatNumber(val);
        }

        // Set change percentage
        const changeEl = document.getElementById(kpi.id + 'Change');
        if (changeEl && item.percentDiff !== null && item.percentDiff !== undefined) {
            const pct = item.percentDiff;
            const isPositive = pct >= 0;
            changeEl.className = 'kpi-change ' + (isPositive ? 'positive' : 'negative');
            changeEl.innerHTML = (isPositive ? '&#9650; ' : '&#9660; ') + Math.abs(pct).toFixed(2) + '%';
        }

        // Set previous year value
        const prevEl = document.getElementById(kpi.id + 'Prev');
        if (prevEl && item.prevYearValue !== null && item.prevYearValue !== undefined) {
            prevEl.textContent = kpi.prefix + formatNumber(item.prevYearValue);
        }
    });
}

// ==================== Agents Table ====================
// The agents data needs a separate API call - the dashboard endpoint doesn't include it
// For now show "no data" - agents require a different endpoint

function renderAgentsTable(data) {
    const tbody = document.getElementById('agentsTableBody');
    const tfoot = document.getElementById('agentsTableFoot');

    // Try to find agents in any nested structure
    const agents = data.agents || data.agentsList || data.soknim || data.soknimData || [];
    allAgents = agents;

    if (!Array.isArray(agents) || agents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><h3>נתוני סוכנים</h3><p>נתוני הסוכנים יוצגו כאן בקרוב</p></div></td></tr>';
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    renderAgentRows(agents, tbody, tfoot);
}

function renderAgentRows(agents, tbody, tfoot) {
    if (!agents || agents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><h3>אין נתונים</h3></div></td></tr>';
        return;
    }

    let totalPremium = 0, totalHatam = 0, totalSochen = 0;

    tbody.innerHTML = agents.map((a, i) => {
        const agentNum = a.agentNumber || a.agentId || a.sochen || a.misparSochen || a.id || i;
        const agentName = a.agentName || a.name || a.shemSochen || a.fullName || '-';
        const policyCount = a.policyCount || a.policiesCount || a.maspHndl || a.totalPolicies || 0;
        const totalPrem = a.totalPremium || a.premium || a.sahachPremia || 0;
        const commRate = a.commissionRate || a.commissionPercent || a.amlatSochenPercent || 0;
        const commHatam = a.underwriterCommission || a.commissionHatam || a.amlatHatam || 0;
        const commAgent = a.agentCommission || a.commission || a.amlatSochen || 0;

        totalPremium += Number(totalPrem) || 0;
        totalHatam += Number(commHatam) || 0;
        totalSochen += Number(commAgent) || 0;

        return `<tr>
            <td>${i}</td>
            <td>${esc(String(agentNum))}</td>
            <td>${esc(String(agentName))}</td>
            <td>${formatNumber(policyCount)}</td>
            <td>${formatNumber(totalPrem)}</td>
            <td>${commRate}%</td>
            <td>${formatNumber(commHatam)}</td>
            <td>${formatNumber(commAgent)}</td>
        </tr>`;
    }).join('');

    if (tfoot) {
        tfoot.innerHTML = `<tr style="font-weight:700; background:var(--gray-50);">
            <td colspan="4">סה"כ: ${agents.length}</td>
            <td>${formatNumber(totalPremium)}</td>
            <td></td>
            <td>${formatNumber(totalHatam)}</td>
            <td>${formatNumber(totalSochen)}</td>
        </tr>`;
    }
}

function filterAgents() {
    const q = document.getElementById('agentSearch').value.trim().toLowerCase();
    const tbody = document.getElementById('agentsTableBody');
    const tfoot = document.getElementById('agentsTableFoot');
    if (!q) {
        renderAgentRows(allAgents, tbody, tfoot);
        return;
    }
    const filtered = allAgents.filter(a => {
        const name = (a.agentName || a.name || a.shemSochen || a.fullName || '').toLowerCase();
        const num = String(a.agentNumber || a.agentId || a.sochen || a.misparSochen || '');
        return name.includes(q) || num.includes(q);
    });
    renderAgentRows(filtered, tbody, tfoot);
}

// ==================== Charts ====================
// Charts data is not in the dashboard calc endpoint
// These will be populated when we discover which endpoints return chart data

function renderRegionChart(data) {
    const canvas = document.getElementById('regionChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const regions = data.regions || data.salesByRegion || data.geographicSales || [];

    if (regionChart) regionChart.destroy();

    if (!Array.isArray(regions) || regions.length === 0) return;

    const labels = regions.map(r => r.name || r.region || r.label || 'N/A');
    const values = regions.map(r => r.value || r.count || r.total || r.percent || 0);
    const colors = ['#3B82F6', '#00B67A', '#FF6B2C', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#EC4899'];

    regionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 0,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { font: { family: 'Heebo', size: 11 }, padding: 10 } }
            }
        }
    });
}

function renderRidersChart(data) {
    const canvas = document.getElementById('ridersChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const riders = data.riders || data.topRiders || data.ridersSales || [];

    if (ridersChart) ridersChart.destroy();
    if (!Array.isArray(riders) || riders.length === 0) return;

    const labels = riders.map(r => r.name || r.rider || r.label || 'N/A');
    const values = riders.map(r => r.value || r.count || r.total || r.percent || 0);
    const colors = ['#3B82F6', '#00B67A', '#FF6B2C', '#F59E0B', '#8B5CF6', '#EF4444',
                    '#06B6D4', '#EC4899', '#10B981', '#F97316', '#6366F1', '#84CC16'];

    ridersChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 0,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { font: { family: 'Heebo', size: 11 }, padding: 8 } }
            }
        }
    });
}

function renderSalesYoYChart(data) {
    const canvas = document.getElementById('salesYoYChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const salesYoY = data.salesComparison || data.yearlySales || data.monthlySalesComparison || [];

    if (salesYoYChart) salesYoYChart.destroy();
    if (!Array.isArray(salesYoY) || salesYoY.length === 0) return;

    const labels = salesYoY.map(s => s.month || s.label || s.period || '');
    const current = salesYoY.map(s => s.currentYear || s.current || s.thisYear || s.value || 0);
    const previous = salesYoY.map(s => s.previousYear || s.previous || s.lastYear || s.prevValue || 0);

    salesYoYChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'שנה נוכחית', data: current, backgroundColor: 'rgba(59, 130, 246, 0.8)', borderRadius: 4 },
                { label: 'שנה קודמת', data: previous, backgroundColor: 'rgba(239, 68, 68, 0.6)', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top', labels: { font: { family: 'Heebo' } } } },
            scales: { y: { beginAtZero: true, ticks: { callback: v => '$' + formatNumber(v) } } }
        }
    });
}

// ==================== Utilities ====================

function formatNumber(n) {
    if (n === null || n === undefined) return '0';
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
