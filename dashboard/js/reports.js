// Reports Page JS - v1
let allReportData = [];
let agentsChart = null;

const CHART_COLORS = ['#3B82F6', '#00B67A', '#FF6B2C', '#F59E0B', '#8B5CF6',
    '#EF4444', '#06B6D4', '#EC4899', '#10B981', '#F97316'];

document.addEventListener('DOMContentLoaded', () => {
    initUser();
    loadReport();
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

// ==================== Load Report ====================
async function loadReport() {
    showError(null);
    try {
        const res = await apiFetch('/dashboard/external/agents-report?pageSize=500');
        if (!res) return;

        if (res.status === 403) {
            showError('אין הרשאה לצפות בדוחות.');
            return;
        }
        if (!res.ok) {
            showError('שגיאה בטעינת דוח (קוד: ' + res.status + ')');
            return;
        }

        const data = await res.json();
        console.log('Report Data:', data);
        if (data._debugFields) console.log('API fields:', data._debugFields);
        allReportData = Array.isArray(data) ? data : (data.items || data.agents || []);
        if (allReportData.length > 0) console.log('First agent raw:', JSON.stringify(allReportData[0]));
        document.getElementById('totalCount').textContent = allReportData.length + ' סוכנים';

        updateReportKPIs(allReportData);
        renderAgentsChart(allReportData);
        sortAndRender();
    } catch (err) {
        console.error('Error loading report:', err);
        showError('שגיאת תקשורת עם מערכת הביטוח.');
    }
}

// ==================== KPI Summary ====================
function updateReportKPIs(agents) {
    const totalPolicies = agents.reduce((s, a) => s + (a.policyCount || a.totalPolicies || a.count || 0), 0);
    const totalPremiums = agents.reduce((s, a) => s + (a.totalPremium || a.total || a.premium || 0), 0);
    const totalCommissions = agents.reduce((s, a) => s + (a.totalCommission || a.hatamTotal || a.commission || 0), 0);

    document.getElementById('kpiAgentCount').textContent = agents.length;
    document.getElementById('kpiTotalPolicies').textContent = formatNumber(totalPolicies);
    document.getElementById('kpiTotalPremiums').textContent = '$' + formatNumber(totalPremiums);
    document.getElementById('kpiTotalCommissions').textContent = '$' + formatNumber(totalCommissions);
}

// ==================== Chart ====================
function renderAgentsChart(agents) {
    const canvas = document.getElementById('agentsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (agentsChart) agentsChart.destroy();

    if (!agents || agents.length === 0) {
        const wrap = document.getElementById('agentsChartWrap');
        if (wrap) {
            canvas.style.display = 'none';
            if (!wrap.querySelector('.chart-empty')) {
                const empty = document.createElement('div');
                empty.className = 'chart-empty';
                empty.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 5-5"/></svg><p>אין נתונים להצגה</p>';
                wrap.appendChild(empty);
            }
        }
        return;
    }

    canvas.style.display = '';
    const empty = canvas.parentElement.querySelector('.chart-empty');
    if (empty) empty.remove();

    // Top 10 agents by premium
    const sorted = [...agents]
        .sort((a, b) => (b.totalPremium || b.total || b.premium || 0) - (a.totalPremium || a.total || a.premium || 0))
        .slice(0, 10);

    agentsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sorted.map(a => a.agentName || String(a.agentCode || a.agentIndex || '')),
            datasets: [{
                label: 'פרמיות',
                data: sorted.map(a => a.totalPremium || a.total || a.premium || 0),
                backgroundColor: CHART_COLORS.slice(0, sorted.length),
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => '$' + formatNumber(ctx.raw)
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.04)' },
                    ticks: {
                        callback: v => '$' + formatNumber(v),
                        font: { family: 'Heebo', size: 11 }
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: { font: { family: 'Heebo', size: 12, weight: '600' } }
                }
            }
        }
    });
}

// ==================== Sort & Filter ====================
function sortAndRender() {
    const field = document.getElementById('sortField').value;
    let sorted = [...allReportData];

    // Apply search filter
    const query = (document.getElementById('searchInput').value || '').trim().toLowerCase();
    if (query) {
        sorted = sorted.filter(a => {
            const fields = [a.agentName, a.agentCode, a.agentIndex, a.snifAgentName]
                .filter(Boolean).map(v => String(v).toLowerCase());
            return fields.some(f => f.includes(query));
        });
    }

    // Sort
    switch (field) {
        case 'premium':
            sorted.sort((a, b) => (b.totalPremium || b.total || b.premium || 0) - (a.totalPremium || a.total || a.premium || 0));
            break;
        case 'policies':
            sorted.sort((a, b) => (b.policyCount || b.totalPolicies || b.count || 0) - (a.policyCount || a.totalPolicies || a.count || 0));
            break;
        case 'commission':
            sorted.sort((a, b) => (b.totalCommission || b.hatamTotal || b.commission || 0) - (a.totalCommission || a.hatamTotal || a.commission || 0));
            break;
        case 'name':
            sorted.sort((a, b) => (a.agentName || '').localeCompare(b.agentName || '', 'he'));
            break;
    }

    document.getElementById('searchCount').textContent = sorted.length + ' תוצאות';
    renderReportTable(sorted);
}

function filterReport() {
    sortAndRender();
}

// ==================== Render Report Table ====================
function renderReportTable(agents) {
    const tbody = document.getElementById('reportBody');
    const grandTotal = allReportData.reduce((s, a) => s + (a.totalPremium || a.total || a.premium || 0), 0);

    if (!agents || agents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8"><div class="empty-msg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>לא נמצאו נתונים</p></div></td></tr>';
        return;
    }

    tbody.innerHTML = agents.map((a, i) => {
        const premium = a.totalPremium || a.total || a.premium || 0;
        const count = a.policyCount || a.totalPolicies || a.count || 0;
        const commission = a.totalCommission || a.hatamTotal || a.commission || 0;
        const avg = count > 0 ? premium / count : 0;
        const pctOfTotal = grandTotal > 0 ? ((premium / grandTotal) * 100).toFixed(1) : '0';

        return `<tr>
            <td class="td-center">${i + 1}</td>
            <td><strong>${esc(a.agentName || '-')}</strong></td>
            <td class="td-center">${esc(String(a.agentCode || a.agentIndex || '-'))}</td>
            <td class="td-center">${formatNumber(count)}</td>
            <td class="td-premium">$${formatNumber(premium)}</td>
            <td class="td-premium">$${formatNumber(commission)}</td>
            <td>$${formatNumber(avg)}</td>
            <td class="td-center">${pctOfTotal}%</td>
        </tr>`;
    }).join('');
}

// ==================== Utilities ====================
function showError(msg) {
    const el = document.getElementById('errorBanner');
    if (!msg) { el.classList.remove('show'); el.style.display = 'none'; return; }
    el.textContent = msg;
    el.classList.add('show');
    el.style.display = 'flex';
}

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
