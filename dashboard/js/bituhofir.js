// BituhOfir Dashboard JS - v10
let regionChart, ridersChart, salesYoYChart;

document.addEventListener('DOMContentLoaded', () => {
    initUser();
    initDateFilters();
    loadBituhOfirDashboard();
});

async function initUser() {
    let user = getUser();
    if (user) {
        const nameEl = document.getElementById('userName');
        const avatarEl = document.getElementById('userAvatar');
        const companyEl = document.getElementById('companyName');
        if (nameEl) nameEl.textContent = user.name || 'משתמש';
        if (avatarEl) avatarEl.textContent = (user.name || 'C').charAt(0);
        if (companyEl) companyEl.textContent = user.companyName || user.name || 'חברה';

        if (!user.companyName) {
            user = await syncCompanyName();
            if (user && user.companyName && companyEl) {
                companyEl.textContent = user.companyName;
            }
        }
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

    // Auto-load when date changes
    monthSelect.addEventListener('change', () => {
        loadBituhOfirDashboard(monthSelect.value, yearSelect.value);
    });
    yearSelect.addEventListener('change', () => {
        loadBituhOfirDashboard(monthSelect.value, yearSelect.value);
    });
}

async function loadBituhOfirDashboard(month, year) {
    showError(null);
    // Show loading state
    const kpiSection = document.getElementById('kpiSection');
    if (kpiSection) kpiSection.style.opacity = '0.4';
    const yoySection = document.getElementById('yoySection');
    if (yoySection) yoySection.style.display = 'none';

    try {
        let url = '/dashboard/external/dashboard';
        const params = [];
        if (month && year) {
            params.push(`month=${month}`, `year=${year}`);
        }
        // Pass ?refresh=1 from page URL to bypass cache
        const pageParams = new URLSearchParams(window.location.search);
        if (pageParams.get('refresh') === '1') params.push('refresh=1');
        if (params.length > 0) url += '?' + params.join('&');

        const res = await apiFetch(url);
        if (!res) { if (kpiSection) kpiSection.style.opacity = ''; return; }

        if (res.status === 403) {
            if (kpiSection) kpiSection.style.opacity = '';
            showError('אין הרשאה לצפות בנתוני ביטוח.');
            return;
        }

        if (!res.ok) {
            if (kpiSection) kpiSection.style.opacity = '';
            showError('שגיאה בטעינת נתונים מהביטוח (קוד: ' + res.status + ')');
            return;
        }

        const data = await res.json();
        if (kpiSection) kpiSection.style.opacity = '';
        console.log('BituhOfir Dashboard Data:', data);

        // Update timestamp
        const tsEl = document.getElementById('lastUpdate');
        if (tsEl) {
            const lr = data.lastRefresh
                ? new Date(data.lastRefresh).toLocaleString('he-IL')
                : new Date().toLocaleTimeString('he-IL');
            tsEl.innerHTML = '<span class="dot"></span> עדכון אחרון: ' + lr;
        }

        const calcData = data.dashboardCalcData || [];
        updateKPIs(calcData);
        hideUnusedKPIs(calcData);

        const riders = data.riders || [];
        const topPolicies = data.topPolicies || [];

        // Hide chart sections entirely if no data
        const chartsSection = document.getElementById('chartsSection');
        if (riders.length === 0 && topPolicies.length === 0) {
            if (chartsSection) chartsSection.style.display = 'none';
        } else {
            if (chartsSection) chartsSection.style.display = '';
            renderRidersChart(riders);
            renderRegionChart(topPolicies);
        }

        // Load YoY chart — show for all companies that have at least some KPI data
        const yoySection2 = document.getElementById('yoySection');
        if (calcData.length > 0) {
            if (yoySection2) yoySection2.style.display = '';
            // If YoY data is embedded in dashboard response (agent-mode), use it directly
            if (data.yoyData && data.yoyData.length > 0) {
                renderSalesYoYChart({ year: data.yoyYear, prevYear: data.yoyPrevYear, yoyData: data.yoyData });
            } else {
                // Ophir (non-agent): fetch YoY separately
                const reqMonth = month || (new Date().getMonth() + 1);
                const reqYear = year || new Date().getFullYear();
                loadYoYChart(reqMonth, reqYear);
            }
        } else {
            if (yoySection2) yoySection2.style.display = 'none';
        }

    } catch (err) {
        if (kpiSection) kpiSection.style.opacity = '';
        console.error('Error loading BituhOfir data:', err);
        showError('שגיאת תקשורת עם מערכת הביטוח.');
    }
}

async function loadYoYChart(month, year) {
    try {
        const res = await apiFetch(`/dashboard/external/yoy?month=${month}&year=${year}`);
        if (res && res.ok) {
            const data = await res.json();
            renderSalesYoYChart(data);
        }
    } catch (err) {
        console.error('Error loading YoY data:', err);
    }
}

function showError(msg) {
    const el = document.getElementById('errorBanner');
    if (!msg) { el.classList.remove('show'); return; }
    el.textContent = msg;
    el.classList.add('show');
}

// ==================== KPIs ====================
// repType: 1=מחזור שנתי, 2=רווח שנתי, 3=מכירות יומיות, 4=פרמיה ממוצעת, 5=פוליסות, 6=מכירות יום נוכחי
const KPI_MAP = {
    1: { id: 'kpiTurnover', prefix: '$', arrowId: 'kpiArrow1' },
    4: { id: 'kpiAvgPremium', prefix: '$', arrowId: 'kpiArrow4' },
    2: { id: 'kpiProfit', prefix: '$', arrowId: 'kpiArrow2' },
    5: { id: 'kpiPolicies', prefix: '', arrowId: 'kpiArrow5' },
    3: { id: 'kpiDailySales', prefix: '$', arrowId: 'kpiArrow3' },
    6: { id: 'kpiTodaySales', prefix: '$', arrowId: 'kpiArrow6' }
};

const ARROW_UP = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>';
const ARROW_DOWN = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" transform="rotate(180 12 12)"/></svg>';

function updateKPIs(calcData) {
    if (!Array.isArray(calcData)) return;

    // Reset
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

        // Value
        const el = document.getElementById(kpi.id);
        if (el) {
            el.textContent = kpi.prefix + formatNumber(item.curYearValue);
        }

        // Percentage change
        const changeEl = document.getElementById(kpi.id + 'Change');
        if (changeEl && item.percentDiff !== null && item.percentDiff !== undefined) {
            const pct = item.percentDiff;
            const isPositive = pct >= 0;
            changeEl.className = 'kpi-pct ' + (isPositive ? 'positive' : 'negative');
            changeEl.textContent = (isPositive ? '+' : '') + pct.toFixed(2) + '%';
        }

        // Arrow direction
        const arrowEl = document.getElementById(kpi.arrowId);
        if (arrowEl && item.percentDiff !== null && item.percentDiff !== undefined) {
            const isPositive = item.percentDiff >= 0;
            arrowEl.className = 'kpi-arrow ' + (isPositive ? 'up' : 'down');
            arrowEl.innerHTML = isPositive ? ARROW_UP : ARROW_DOWN;
        }

        // Previous year value
        const prevEl = document.getElementById(kpi.id + 'Prev');
        if (prevEl && item.prevYearValue !== null && item.prevYearValue !== undefined) {
            prevEl.textContent = kpi.prefix + formatNumber(item.prevYearValue);
        }
    });
}

// ==================== Hide Unused KPIs ====================
function hideUnusedKPIs(calcData) {
    const receivedTypes = new Set((calcData || []).map(d => String(d.repType)));
    const kpiGrid = document.getElementById('kpiSection');
    if (!kpiGrid) return;

    const allCards = kpiGrid.querySelectorAll('.kpi-card[data-reptype]');
    let visibleCount = 0;

    allCards.forEach(card => {
        if (receivedTypes.has(card.dataset.reptype)) {
            card.style.display = '';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });

    // Adjust grid: 3 visible → 3 columns, otherwise keep 2
    if (visibleCount === 3) {
        kpiGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    } else {
        kpiGrid.style.gridTemplateColumns = '';
    }
}

// ==================== Charts ====================
const CHART_COLORS = ['#3B82F6', '#00B67A', '#FF6B2C', '#F59E0B', '#8B5CF6',
    '#EF4444', '#06B6D4', '#EC4899', '#10B981', '#F97316', '#6366F1', '#84CC16',
    '#A855F7', '#14B8A6', '#F43F5E', '#0EA5E9'];

function renderRegionChart(policies) {
    const canvas = document.getElementById('regionChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (regionChart) regionChart.destroy();

    if (!Array.isArray(policies) || policies.length === 0) {
        showChartEmpty('regionChartWrap', 'נתוני אזורים גיאוגרפיים יוצגו כאן');
        return;
    }

    const regionMap = {};
    policies.forEach(p => {
        const region = p.destinationName || p.destination || p.region || p.azor || p.continent || p.yead;
        if (!region) return;
        if (!regionMap[region]) regionMap[region] = 0;
        regionMap[region] += Number(p.premium || p.totalPremium || 1);
    });

    const regionEntries = Object.entries(regionMap).sort((a, b) => b[1] - a[1]);
    if (regionEntries.length === 0) {
        showChartEmpty('regionChartWrap', 'נתוני אזורים גיאוגרפיים יוצגו כאן');
        return;
    }

    clearChartEmpty('regionChartWrap');
    regionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: regionEntries.map(r => r[0]),
            datasets: [{ data: regionEntries.map(r => r[1]), backgroundColor: CHART_COLORS.slice(0, regionEntries.length), borderWidth: 2, borderColor: '#fff', hoverOffset: 8 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { font: { family: 'Heebo', size: 11 }, padding: 8, usePointStyle: true, pointStyle: 'circle' } },
                tooltip: { callbacks: { label: ctx => { const t = ctx.dataset.data.reduce((a,b) => a+b, 0); return ctx.label + ': ' + ((ctx.raw/t)*100).toFixed(1) + '%'; } } }
            }
        }
    });
}

function renderRidersChart(riders) {
    const canvas = document.getElementById('ridersChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ridersChart) ridersChart.destroy();

    if (!Array.isArray(riders) || riders.length === 0) {
        showChartEmpty('ridersChartWrap', 'נתוני ריידרים יוצגו כאן');
        return;
    }

    clearChartEmpty('ridersChartWrap');
    const riderMap = {};
    riders.forEach(r => {
        const name = r.riderName || r.name || r.rider || r.riderType || r.label || r.description || 'אחר';
        if (!riderMap[name]) riderMap[name] = 0;
        riderMap[name] += Number(r.count || r.value || r.total || r.amount || r.premium || 1);
    });

    const entries = Object.entries(riderMap).sort((a, b) => b[1] - a[1]);
    ridersChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: entries.map(r => r[0]),
            datasets: [{ data: entries.map(r => r[1]), backgroundColor: CHART_COLORS.slice(0, entries.length), borderWidth: 2, borderColor: '#fff', hoverOffset: 8 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { font: { family: 'Heebo', size: 11 }, padding: 6, usePointStyle: true, pointStyle: 'circle' } },
                tooltip: { callbacks: { label: ctx => { const t = ctx.dataset.data.reduce((a,b) => a+b, 0); return ctx.label + ': ' + ((ctx.raw/t)*100).toFixed(1) + '% (' + formatNumber(ctx.raw) + ')'; } } }
            }
        }
    });
}

function renderSalesYoYChart(data) {
    const canvas = document.getElementById('salesYoYChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (salesYoYChart) salesYoYChart.destroy();

    if (!data || !data.yoyData || data.yoyData.length === 0) {
        showChartEmpty('yoyChartWrap', 'נתוני השוואה שנתית יוצגו כאן');
        return;
    }

    clearChartEmpty('yoyChartWrap');
    salesYoYChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.yoyData.map(s => s.month),
            datasets: [
                { label: 'שנת ' + data.year, data: data.yoyData.map(s => s.currentYear || 0), backgroundColor: 'rgba(59, 130, 246, 0.85)', borderRadius: 4, borderSkipped: false },
                { label: 'שנת ' + data.prevYear, data: data.yoyData.map(s => s.previousYear || 0), backgroundColor: 'rgba(239, 68, 68, 0.6)', borderRadius: 4, borderSkipped: false }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { position: 'top', labels: { font: { family: 'Heebo', weight: '600' }, usePointStyle: true, pointStyle: 'rectRounded', padding: 16 } },
                tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': $' + formatNumber(ctx.raw) } }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { callback: v => '$' + formatNumber(v), font: { family: 'Heebo', size: 11 } } },
                x: { grid: { display: false }, ticks: { font: { family: 'Heebo', size: 11, weight: '500' } } }
            }
        }
    });
}

// Chart helpers
function showChartEmpty(wrapId, message) {
    const wrap = document.getElementById(wrapId);
    if (!wrap || wrap.querySelector('.chart-empty')) return;
    const canvas = wrap.querySelector('canvas');
    if (canvas) canvas.style.display = 'none';
    const empty = document.createElement('div');
    empty.className = 'chart-empty';
    empty.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 5-5"/></svg><p>${message}</p>`;
    wrap.appendChild(empty);
}

function clearChartEmpty(wrapId) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    const empty = wrap.querySelector('.chart-empty');
    if (empty) empty.remove();
    const canvas = wrap.querySelector('canvas');
    if (canvas) canvas.style.display = '';
}

// Utilities
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
