// BituhOfir Dashboard JS - v3
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
            const lr = data.lastRefresh
                ? new Date(data.lastRefresh).toLocaleString('he-IL')
                : new Date().toLocaleTimeString('he-IL');
            tsEl.innerHTML = '<span class="dot"></span> עדכון אחרון: ' + lr;
        }

        // API returns: { lastRefresh, dashboardCalcData: [...], periods: [...], riders: [...], topPolicies: [...] }
        updateKPIs(data.dashboardCalcData || []);
        renderAgentsTable(data);
        renderRidersChart(data.riders || []);
        renderRegionChart(data.topPolicies || []);

        // Load YoY chart separately (it's a heavier call)
        const reqMonth = month || (new Date().getMonth() + 1);
        const reqYear = year || new Date().getFullYear();
        loadYoYChart(reqMonth, reqYear);

    } catch (err) {
        console.error('Error loading BituhOfir data:', err);
        showError('שגיאת תקשורת עם מערכת ביטוח אופיר.');
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
    if (!msg) {
        el.classList.remove('show');
        return;
    }
    el.textContent = msg;
    el.classList.add('show');
}

// ==================== KPIs ====================
const KPI_MAP = {
    1: { id: 'kpiTurnover', prefix: '$' },
    4: { id: 'kpiAvgPremium', prefix: '$' },
    2: { id: 'kpiProfit', prefix: '$' },
    5: { id: 'kpiPolicies', prefix: '' },
    3: { id: 'kpiDailySales', prefix: '$' },
    6: { id: 'kpiTodaySales', prefix: '$' }
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

        const el = document.getElementById(kpi.id);
        if (el) {
            el.textContent = kpi.prefix + formatNumber(item.curYearValue);
        }

        const changeEl = document.getElementById(kpi.id + 'Change');
        if (changeEl && item.percentDiff !== null && item.percentDiff !== undefined) {
            const pct = item.percentDiff;
            const isPositive = pct >= 0;
            changeEl.className = 'kpi-change ' + (isPositive ? 'positive' : 'negative');
            changeEl.innerHTML = (isPositive ? '&#9650; ' : '&#9660; ') + Math.abs(pct).toFixed(2) + '%';
        }

        const prevEl = document.getElementById(kpi.id + 'Prev');
        if (prevEl && item.prevYearValue !== null && item.prevYearValue !== undefined) {
            prevEl.textContent = 'שנה קודמת: ' + kpi.prefix + formatNumber(item.prevYearValue);
        }
    });
}

// ==================== Agents Table ====================
function renderAgentsTable(data) {
    const tbody = document.getElementById('agentsTableBody');
    const tfoot = document.getElementById('agentsTableFoot');
    const countEl = document.getElementById('agentsCount');

    // Try to find agents from topPolicies data - aggregate by agent
    const topPolicies = data.topPolicies || [];
    let agents = data.agents || data.agentsList || data.soknim || data.soknimData || [];

    // If no direct agents data, try to aggregate from topPolicies
    if ((!Array.isArray(agents) || agents.length === 0) && Array.isArray(topPolicies) && topPolicies.length > 0) {
        agents = aggregateAgentsFromPolicies(topPolicies);
    }

    allAgents = agents;

    if (countEl) countEl.textContent = agents.length;

    if (!Array.isArray(agents) || agents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--gray-400);">נתוני הסוכנים יוצגו כאן כשיהיו זמינים מה-API</td></tr>';
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    renderAgentRows(agents, tbody, tfoot);
}

function aggregateAgentsFromPolicies(policies) {
    const agentMap = {};
    policies.forEach(p => {
        // Try to find agent identifier in policy data
        const agentId = p.agentId || p.agentNumber || p.sochen || p.misparSochen || p.agentCode;
        if (!agentId && agentId !== 0) return;

        if (!agentMap[agentId]) {
            agentMap[agentId] = {
                agentNumber: agentId,
                agentName: p.agentName || p.shemSochen || p.sochen || '-',
                policyCount: 0,
                totalPremium: 0,
                commissionRate: p.commissionRate || p.amlatSochenPercent || 0,
                underwriterCommission: 0,
                agentCommission: 0
            };
        }
        agentMap[agentId].policyCount++;
        agentMap[agentId].totalPremium += Number(p.premium || p.totalPremium || p.sahachPremia || 0);
        agentMap[agentId].underwriterCommission += Number(p.commissionHatam || p.amlatHatam || 0);
        agentMap[agentId].agentCommission += Number(p.commission || p.agentCommission || p.amlatSochen || 0);
    });
    return Object.values(agentMap).sort((a, b) => b.totalPremium - a.totalPremium);
}

function renderAgentRows(agents, tbody, tfoot) {
    if (!agents || agents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--gray-400);">אין נתונים</td></tr>';
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
            <td>${i + 1}</td>
            <td class="num">${esc(String(agentNum))}</td>
            <td><strong>${esc(String(agentName))}</strong></td>
            <td class="num">${formatNumber(policyCount)}</td>
            <td class="num">${formatNumber(totalPrem)}</td>
            <td class="num">${commRate}%</td>
            <td class="num">${formatNumber(commHatam)}</td>
            <td class="num">${formatNumber(commAgent)}</td>
        </tr>`;
    }).join('');

    if (tfoot) {
        tfoot.innerHTML = `<tr>
            <td colspan="3">סה"כ: ${agents.length} סוכנים</td>
            <td></td>
            <td class="num">${formatNumber(totalPremium)}</td>
            <td></td>
            <td class="num">${formatNumber(totalHatam)}</td>
            <td class="num">${formatNumber(totalSochen)}</td>
        </tr>`;
    }
}

function filterAgents() {
    const q = document.getElementById('agentSearch').value.trim().toLowerCase();
    const tbody = document.getElementById('agentsTableBody');
    const tfoot = document.getElementById('agentsTableFoot');
    const countEl = document.getElementById('agentsCount');
    if (!q) {
        if (countEl) countEl.textContent = allAgents.length;
        renderAgentRows(allAgents, tbody, tfoot);
        return;
    }
    const filtered = allAgents.filter(a => {
        const name = (a.agentName || a.name || a.shemSochen || a.fullName || '').toLowerCase();
        const num = String(a.agentNumber || a.agentId || a.sochen || a.misparSochen || '');
        return name.includes(q) || num.includes(q);
    });
    if (countEl) countEl.textContent = filtered.length;
    renderAgentRows(filtered, tbody, tfoot);
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

    // Try to aggregate geographic data from policies
    if (!Array.isArray(policies) || policies.length === 0) {
        showChartEmpty('regionChartWrap', 'נתוני אזורים יוצגו כאן');
        return;
    }

    // Try to find destination/region field in policies and aggregate
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
    const labels = regionEntries.map(r => r[0]);
    const values = regionEntries.map(r => r[1]);

    regionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: CHART_COLORS.slice(0, labels.length),
                borderWidth: 2,
                borderColor: '#fff',
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { font: { family: 'Heebo', size: 11 }, padding: 10, usePointStyle: true, pointStyle: 'circle' }
                },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = ((ctx.raw / total) * 100).toFixed(1);
                            return ctx.label + ': ' + pct + '%';
                        }
                    }
                }
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

    // Riders data - try to aggregate by rider name/type
    const riderMap = {};
    riders.forEach(r => {
        const name = r.riderName || r.name || r.rider || r.riderType || r.label || r.description || 'אחר';
        if (!riderMap[name]) riderMap[name] = 0;
        riderMap[name] += Number(r.count || r.value || r.total || r.amount || r.premium || 1);
    });

    const riderEntries = Object.entries(riderMap).sort((a, b) => b[1] - a[1]);
    const labels = riderEntries.map(r => r[0]);
    const values = riderEntries.map(r => r[1]);

    ridersChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: CHART_COLORS.slice(0, labels.length),
                borderWidth: 2,
                borderColor: '#fff',
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { font: { family: 'Heebo', size: 11 }, padding: 8, usePointStyle: true, pointStyle: 'circle' }
                },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = ((ctx.raw / total) * 100).toFixed(1);
                            return ctx.label + ': ' + pct + '% (' + formatNumber(ctx.raw) + ')';
                        }
                    }
                }
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

    const labels = data.yoyData.map(s => s.month);
    const current = data.yoyData.map(s => s.currentYear || 0);
    const previous = data.yoyData.map(s => s.previousYear || 0);

    salesYoYChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'שנת ' + data.year,
                    data: current,
                    backgroundColor: 'rgba(59, 130, 246, 0.85)',
                    borderRadius: 4,
                    borderSkipped: false
                },
                {
                    label: 'שנת ' + data.prevYear,
                    data: previous,
                    backgroundColor: 'rgba(239, 68, 68, 0.6)',
                    borderRadius: 4,
                    borderSkipped: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { font: { family: 'Heebo', weight: '600' }, usePointStyle: true, pointStyle: 'rectRounded', padding: 16 }
                },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            return ctx.dataset.label + ': $' + formatNumber(ctx.raw);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.04)' },
                    ticks: {
                        callback: v => '$' + formatNumber(v),
                        font: { family: 'Heebo', size: 11 }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { font: { family: 'Heebo', size: 11, weight: '500' } }
                }
            }
        }
    });
}

// Chart helper functions
function showChartEmpty(wrapId, message) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    // Check if empty state already exists
    if (wrap.querySelector('.chart-empty')) return;
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
