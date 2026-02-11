// Reports Page JS - v2 — All Policies Table
let allAgentData = [];
let allPolicies = [];

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
        allAgentData = Array.isArray(data) ? data : (data.items || data.agents || []);

        // Extract all individual policies from agents, attach agent info to each
        allPolicies = [];
        allAgentData.forEach(agent => {
            const agentName = agent.agentName || '-';
            const agentCode = agent.agentCode || agent.agentIndex || '-';
            if (agent.policies && Array.isArray(agent.policies)) {
                agent.policies.forEach(p => {
                    allPolicies.push({
                        ...p,
                        _agentName: agentName,
                        _agentCode: agentCode
                    });
                });
            }
        });

        console.log('Total policies extracted:', allPolicies.length);

        updateReportKPIs(allAgentData);
        document.getElementById('totalCount').textContent = allPolicies.length + ' פוליסות';
        filterAndRender();
    } catch (err) {
        console.error('Error loading report:', err);
        showError('שגיאת תקשורת עם מערכת הביטוח.');
    }
}

// ==================== KPI Summary ====================
function updateReportKPIs(agents) {
    const totalPolicies = agents.reduce((s, a) => s + (a.policyCount || 0), 0);
    const totalPremiums = agents.reduce((s, a) => s + (a.totalPremium || 0), 0);
    const totalCommissions = agents.reduce((s, a) => s + (a.totalCommission || 0), 0);

    document.getElementById('kpiAgentCount').textContent = agents.length;
    document.getElementById('kpiTotalPolicies').textContent = formatNumber(totalPolicies);
    document.getElementById('kpiTotalPremiums').textContent = '$' + formatNumber(totalPremiums);
    document.getElementById('kpiTotalCommissions').textContent = '$' + formatNumber(totalCommissions);
}

// ==================== Filter & Render ====================
function filterAndRender() {
    let filtered = [...allPolicies];

    // Apply search filter
    const query = (document.getElementById('searchInput').value || '').trim().toLowerCase();
    if (query) {
        filtered = filtered.filter(p => {
            const fields = [
                p._agentName,
                p.fullPolicyID,
                p.policyIndex,
                p.customerName || p.insuredName || p.clientName,
                p.policyTypeName || p.insuranceType || p.type,
                String(p._agentCode)
            ].filter(Boolean).map(v => String(v).toLowerCase());
            return fields.some(f => f.includes(query));
        });
    }

    // Sort by premium descending
    filtered.sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0));

    document.getElementById('searchCount').textContent = filtered.length + ' תוצאות';
    renderPoliciesTable(filtered);
}

function filterReport() {
    filterAndRender();
}

// For backward compatibility
function sortAndRender() {
    filterAndRender();
}

// ==================== Render Policies Table ====================
function renderPoliciesTable(policies) {
    const tbody = document.getElementById('reportBody');

    if (!policies || policies.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9"><div class="empty-msg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>לא נמצאו נתונים</p></div></td></tr>';
        return;
    }

    tbody.innerHTML = policies.map((p, i) => {
        const premium = Number(p.total) || 0;
        const commission = Number(p.hatamTotal) || 0;
        const policyNum = p.fullPolicyID || p.policyIndex || '-';
        const customerName = p.customerName || p.insuredName || p.clientName || '-';
        const insuranceType = p.policyTypeName || p.insuranceType || p.type || '-';
        const startDate = formatDate(p.policyStartDate || p.startDate);
        const endDate = formatDate(p.policyEndDate || p.endDate);

        return `<tr>
            <td class="td-center">${i + 1}</td>
            <td><strong>${esc(p._agentName)}</strong></td>
            <td class="td-center">${esc(String(policyNum))}</td>
            <td>${esc(customerName)}</td>
            <td>${esc(insuranceType)}</td>
            <td class="td-center">${startDate}</td>
            <td class="td-center">${endDate}</td>
            <td class="td-premium">$${formatNumber(premium)}</td>
            <td class="td-premium">$${formatNumber(commission)}</td>
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

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return '-';
    }
}

function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
