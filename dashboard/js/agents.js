// Agents Page JS - v1
let allAgents = [];
let selectedAgent = null;

document.addEventListener('DOMContentLoaded', () => {
    initUser();
    loadAgents();
    initDrillDownDateFilters();
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeModal();
    });
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

// ==================== Load Agents ====================
async function loadAgents() {
    showError(null);
    try {
        const res = await apiFetch('/dashboard/external/agents-report?pageSize=500');
        if (!res) return;

        if (res.status === 403) {
            showError('אין הרשאה לצפות בנתוני סוכנים.');
            return;
        }
        if (!res.ok) {
            showError('שגיאה בטעינת סוכנים (קוד: ' + res.status + ')');
            return;
        }

        const data = await res.json();
        console.log('Agents Report Data:', data);
        allAgents = Array.isArray(data) ? data : (data.items || data.agents || []);
        document.getElementById('totalCount').textContent = allAgents.length + ' סוכנים';
        renderAgentsTable(allAgents);
    } catch (err) {
        console.error('Error loading agents:', err);
        showError('שגיאת תקשורת עם מערכת הביטוח.');
    }
}

// ==================== Search ====================
function searchAgents() {
    const query = document.getElementById('searchInput').value.trim().toLowerCase();
    if (!query) {
        renderAgentsTable(allAgents);
        document.getElementById('searchCount').textContent = '';
        return;
    }

    const filtered = allAgents.filter(a => {
        const fields = [
            a.agentName, a.agentCode, a.agentIndex, a.snifAgentName
        ].filter(Boolean).map(v => String(v).toLowerCase());
        return fields.some(f => f.includes(query));
    });

    document.getElementById('searchCount').textContent = filtered.length + ' תוצאות מתוך ' + allAgents.length;
    renderAgentsTable(filtered);
}

// ==================== Render Agents Table ====================
function renderAgentsTable(agents) {
    const tbody = document.getElementById('agentsBody');
    if (!agents || agents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6"><div class="empty-msg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/></svg><p>לא נמצאו סוכנים</p></div></td></tr>';
        return;
    }

    tbody.innerHTML = agents.map(a => {
        const code = a.agentCode || a.agentIndex || '-';
        const name = a.agentName || '-';
        const count = a.policyCount || a.totalPolicies || a.count || 0;
        const premium = a.totalPremium || a.total || a.premium || 0;
        const commission = a.totalCommission || a.hatamTotal || a.commission || 0;
        const avg = count > 0 ? premium / count : 0;

        return `<tr onclick="selectAgent('${esc(String(code))}', '${esc(name)}')">
            <td><strong>${esc(name)}</strong></td>
            <td class="td-center">${esc(String(code))}</td>
            <td class="td-center">${formatNumber(count)}</td>
            <td class="td-premium">$${formatNumber(premium)}</td>
            <td class="td-premium">$${formatNumber(commission)}</td>
            <td>$${formatNumber(avg)}</td>
        </tr>`;
    }).join('');
}

// ==================== Drill-Down Date Filters ====================
function initDrillDownDateFilters() {
    const now = new Date();
    const monthSelect = document.getElementById('drillMonth');
    const yearSelect = document.getElementById('drillYear');

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

// ==================== Agent Drill-Down ====================
function selectAgent(agentCode, agentName) {
    selectedAgent = { code: agentCode, name: agentName };
    closeSidebar();

    const modal = document.getElementById('agentModal');
    document.getElementById('modalTitle').textContent = 'פוליסות סוכן: ' + agentName;
    document.getElementById('modalSubtitle').textContent = 'קוד סוכן: ' + agentCode;
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';

    loadAgentPolicies();
}

async function loadAgentPolicies() {
    if (!selectedAgent) return;
    const container = document.getElementById('agentPoliciesContainer');
    container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div> טוען פוליסות סוכן...</div>';

    const month = document.getElementById('drillMonth').value;
    const year = document.getElementById('drillYear').value;

    try {
        const res = await apiFetch(
            `/dashboard/external/agents?agentIndex=${selectedAgent.code}&month=${month}&year=${year}&pageSize=500`
        );
        if (!res || !res.ok) {
            container.innerHTML = '<div class="empty-msg"><p>שגיאה בטעינת פוליסות</p></div>';
            return;
        }
        const data = await res.json();
        console.log('Agent Policies Data:', data);
        const policies = Array.isArray(data) ? data : (data.items || data.policies || []);
        renderAgentPolicies(policies);
    } catch (err) {
        console.error('Error loading agent policies:', err);
        container.innerHTML = '<div class="empty-msg"><p>שגיאת תקשורת</p></div>';
    }
}

function renderAgentPolicies(policies) {
    const container = document.getElementById('agentPoliciesContainer');
    if (!policies || policies.length === 0) {
        container.innerHTML = '<div class="empty-msg"><p>לא נמצאו פוליסות לתקופה זו</p></div>';
        return;
    }

    // Summary KPIs
    const totalPremium = policies.reduce((s, p) => s + (Number(p.total) || 0), 0);
    const totalCommission = policies.reduce((s, p) => s + (Number(p.hatamTotal) || 0), 0);

    let html = '<div class="agent-summary">';
    html += `<div class="agent-kpi"><span class="kpi-label">פוליסות</span><span class="kpi-val">${policies.length}</span></div>`;
    html += `<div class="agent-kpi"><span class="kpi-label">סה"כ פרמיות</span><span class="kpi-val">$${formatNumber(totalPremium)}</span></div>`;
    html += `<div class="agent-kpi"><span class="kpi-label">סה"כ עמלות</span><span class="kpi-val">$${formatNumber(totalCommission)}</span></div>`;
    html += '</div>';

    // Policies table
    html += '<div class="table-scroll" style="max-height:400px;"><table class="policies-table">';
    html += '<thead><tr><th>מס\' פוליסה</th><th>שם לקוח</th><th>אזור</th><th>ת. התחלה</th><th>ת. סיום</th><th>פרמיה</th></tr></thead><tbody>';
    policies.forEach(p => {
        html += `<tr>
            <td><strong>${esc(p.fullPolicyID || String(p.policyIndex || ''))}</strong></td>
            <td>${esc(p.clientName || '-')}</td>
            <td>${esc(p.areaName || '-')}</td>
            <td>${formatDate(p.startDate)}</td>
            <td>${formatDate(p.endDate)}</td>
            <td class="td-premium">$${formatNumber(p.total)}</td>
        </tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// ==================== Modal ====================
function closeModal() {
    const modal = document.getElementById('agentModal');
    modal.classList.remove('show');
    document.body.style.overflow = '';
    selectedAgent = null;
}

function closeModalOverlay(event) {
    if (event.target === event.currentTarget) {
        closeModal();
    }
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

function formatDate(d) {
    if (!d) return '-';
    try {
        const date = new Date(d);
        if (isNaN(date.getTime())) return String(d);
        return date.toLocaleDateString('he-IL');
    } catch (_) {
        return String(d);
    }
}

function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
