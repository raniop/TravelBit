// Reports Page JS - v7 — agent selector + month/year
let allAgentData = [];
let allPolicies = [];
let isOphir = false;
let agentsList = [];
let selectedAgentCodes = new Set();

const MONTH_NAMES = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

document.addEventListener('DOMContentLoaded', () => {
    initUser();
    initDateSelectors();
    loadAgentsList();
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeModal();
    });
});

async function initUser() {
    let user = getUser();
    if (user) {
        isOphir = (user.role === 'admin');

        const nameEl = document.getElementById('userName');
        const avatarEl = document.getElementById('userAvatar');
        const companyEl = document.getElementById('companyName');
        if (nameEl) nameEl.textContent = user.name || 'משתמש';
        if (avatarEl) avatarEl.textContent = (user.name || 'C').charAt(0);
        if (companyEl) companyEl.textContent = user.companyName || user.name || 'חברה';

        const thComm = document.getElementById('thCommission');
        const kpiLabel = document.getElementById('kpiCommissionLabel');
        if (!isOphir) {
            if (thComm) thComm.textContent = 'עמלת סוכן';
            if (kpiLabel) kpiLabel.textContent = 'סה"כ עמלות סוכן';
        }

        if (!user.companyName) {
            user = await syncCompanyName();
            if (user && user.companyName && companyEl) {
                companyEl.textContent = user.companyName;
            }
        }
    }
}

// ==================== Date Selectors ====================
function initDateSelectors() {
    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curYear = now.getFullYear();

    const fromMonthEl = document.getElementById('fromMonth');
    const toMonthEl = document.getElementById('toMonth');
    const fromYearEl = document.getElementById('fromYear');
    const toYearEl = document.getElementById('toYear');

    for (let m = 1; m <= 12; m++) {
        fromMonthEl.appendChild(new Option(MONTH_NAMES[m - 1], m));
        toMonthEl.appendChild(new Option(MONTH_NAMES[m - 1], m));
    }

    for (let y = curYear; y >= curYear - 2; y--) {
        fromYearEl.appendChild(new Option(y, y));
        toYearEl.appendChild(new Option(y, y));
    }

    fromMonthEl.value = curMonth;
    toMonthEl.value = curMonth;
    fromYearEl.value = curYear;
    toYearEl.value = curYear;
}

function getSelectedDates() {
    return {
        fromMonth: Number(document.getElementById('fromMonth').value),
        fromYear: Number(document.getElementById('fromYear').value),
        toMonth: Number(document.getElementById('toMonth').value),
        toYear: Number(document.getElementById('toYear').value)
    };
}

function onDateChange() {
    loadReport();
}

// ==================== Agent Selector ====================
async function loadAgentsList() {
    try {
        // Load all agents (all pages)
        let items = [];
        let page = 1;
        let totalPages = 1;

        const res = await apiFetch('/dashboard/external/agents-report?pageSize=500');
        if (!res || !res.ok) return;

        const data = await res.json();
        items = Array.isArray(data) ? data : (data.items || data.agents || []);
        totalPages = data.totalPages || 1;

        for (let p = 2; p <= totalPages; p++) {
            try {
                const r = await apiFetch('/dashboard/external/agents-report?pageSize=500&page=' + p);
                if (r && r.ok) {
                    const d = await r.json();
                    const more = Array.isArray(d) ? d : (d.items || d.agents || []);
                    items = items.concat(more);
                }
            } catch (e) {
                console.error('Error loading agents page ' + p, e);
            }
        }

        agentsList = items;
        renderAgentList(agentsList);
        updateAgentSelCount();
    } catch (err) {
        console.error('Error loading agents list:', err);
    }
}

function renderAgentList(agents) {
    const tbody = document.getElementById('agentListBody');
    if (!agents || agents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--gray-400);">לא נמצאו סוכנים</td></tr>';
        return;
    }

    tbody.innerHTML = agents.map(a => {
        const code = a.agentCode ?? '-';
        const name = a.agentName ?? '-';
        const main = a.snifNum ?? '';
        const checked = selectedAgentCodes.has(String(code)) ? 'checked' : '';

        return `<tr>
            <td class="td-check"><input type="checkbox" value="${esc(String(code))}" ${checked} onchange="onAgentCheckChange(this)"></td>
            <td class="td-center">${esc(String(code))}</td>
            <td><strong>${esc(name)}</strong></td>
            <td class="td-center">${main != null ? esc(String(main)) : ''}</td>
        </tr>`;
    }).join('');
}

function onAgentCheckChange(cb) {
    const code = cb.value;
    if (cb.checked) {
        selectedAgentCodes.add(code);
    } else {
        selectedAgentCodes.delete(code);
    }
    updateSelectAllCheckbox();
    updateAgentSelCount();
}

function toggleAllAgents(checked) {
    if (checked) {
        agentsList.forEach(a => {
            selectedAgentCodes.add(String(a.agentCode ?? ''));
        });
    } else {
        selectedAgentCodes.clear();
    }
    // Re-render with current filter
    const query = (document.getElementById('agentSearchInput').value || '').trim().toLowerCase();
    if (query) {
        filterAgentList();
    } else {
        renderAgentList(agentsList);
    }
    updateAgentSelCount();
}

function updateSelectAllCheckbox() {
    const selectAll = document.getElementById('selectAllAgents');
    if (!selectAll) return;
    selectAll.checked = agentsList.length > 0 && agentsList.every(a => selectedAgentCodes.has(String(a.agentCode ?? '')));
}

function updateAgentSelCount() {
    const el = document.getElementById('agentSelCount');
    if (el) {
        const count = selectedAgentCodes.size;
        el.textContent = count > 0 ? '(' + count + ' נבחרו)' : '';
    }
}

function filterAgentList() {
    const query = (document.getElementById('agentSearchInput').value || '').trim().toLowerCase();
    if (!query) {
        renderAgentList(agentsList);
        return;
    }
    const filtered = agentsList.filter(a => {
        const fields = [a.agentName, a.agentCode, a.snifNum].filter(Boolean).map(v => String(v).toLowerCase());
        return fields.some(f => f.includes(query));
    });
    renderAgentList(filtered);
}

// Agent selector is always visible - no toggle needed

// ==================== Load Report ====================
async function loadReport() {
    showError(null);

    // Check if agents are selected
    if (selectedAgentCodes.size === 0) {
        showError('יש לבחור לפחות סוכן אחד כדי לטעון דוח.');
        return;
    }

    const btn = document.getElementById('btnLoadReport');
    const tbody = document.getElementById('reportBody');
    const tfoot = document.getElementById('reportFoot');

    if (btn) { btn.disabled = true; btn.textContent = 'טוען...'; }
    tbody.innerHTML = '<tr><td colspan="10"><div class="loading-overlay"><div class="spinner"></div> טוען דוח...</div></td></tr>';
    if (tfoot) tfoot.innerHTML = '';

    try {
        const { fromMonth, fromYear, toMonth, toYear } = getSelectedDates();
        const agentCodesParam = Array.from(selectedAgentCodes).join(',');
        const url = `/dashboard/external/agents-report?pageSize=500&fromMonth=${fromMonth}&fromYear=${fromYear}&toMonth=${toMonth}&toYear=${toYear}&selectedAgents=${encodeURIComponent(agentCodesParam)}`;
        const res = await apiFetch(url);
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
        allAgentData = Array.isArray(data) ? data : (data.items || data.agents || []);

        // Extract policies from selected agents
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

        updateReportKPIs(allAgentData);
        document.getElementById('totalCount').textContent = allPolicies.length + ' פוליסות';
        filterAndRender();
    } catch (err) {
        console.error('Error loading report:', err);
        showError('שגיאת תקשורת עם מערכת הביטוח.');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'טען דוח'; }
    }
}

// ==================== KPI Summary ====================
function updateReportKPIs(agents) {
    const totalPolicies = agents.reduce((s, a) => s + (a.policyCount || 0), 0);
    const totalPremiums = agents.reduce((s, a) => s + (a.totalPremium || 0), 0);
    const totalCommissions = isOphir
        ? agents.reduce((s, a) => s + (a.totalCommission || 0), 0)
        : agents.reduce((s, a) => s + (a.totalAgentRate || 0), 0);

    document.getElementById('kpiTotalPolicies').textContent = formatNumber(totalPolicies);
    document.getElementById('kpiTotalPremiums').textContent = '$' + formatNumber(totalPremiums);
    document.getElementById('kpiTotalCommissions').textContent = '$' + formatNumber(totalCommissions);
}

// ==================== Filter & Render ====================
function filterAndRender() {
    let filtered = [...allPolicies];

    const query = (document.getElementById('searchInput').value || '').trim().toLowerCase();
    if (query) {
        filtered = filtered.filter(p => {
            const fields = [
                p._agentName,
                p.fullPolicyID,
                p.policyIndex,
                p.customerName || p.insuredName || p.clientName,
                p.policyTypeName || p.insuranceType || p.type,
                p.policyDoc,
                String(p._agentCode)
            ].filter(Boolean).map(v => String(v).toLowerCase());
            return fields.some(f => f.includes(query));
        });
    }

    filtered.sort((a, b) => {
        const aNum = Number(a.fullPolicyID || a.policyIndex || 0);
        const bNum = Number(b.fullPolicyID || b.policyIndex || 0);
        return bNum - aNum;
    });

    document.getElementById('searchCount').textContent = filtered.length + ' תוצאות';
    renderPoliciesTable(filtered);
}

function filterReport() {
    filterAndRender();
}

function sortAndRender() {
    filterAndRender();
}

// ==================== Render Policies Table ====================
function renderPoliciesTable(policies) {
    const tbody = document.getElementById('reportBody');
    const tfoot = document.getElementById('reportFoot');

    if (!policies || policies.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10"><div class="empty-msg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>לא נמצאו נתונים</p></div></td></tr>';
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    let totalPremium = 0;
    let totalCommission = 0;

    tbody.innerHTML = policies.map((p, i) => {
        const premium = Number(p.total) || 0;
        const commission = isOphir ? (Number(p.hatamTotal) || 0) : (Number(p.agentRateTotal) || 0);
        totalPremium += premium;
        totalCommission += commission;

        const policyNum = p.fullPolicyID || p.policyIndex || '-';
        const supplement = p.policyDoc || '-';
        const customerName = p.customerName || p.insuredName || p.clientName || '-';
        const insuranceType = p.policyTypeName || p.insuranceType || p.type || '-';
        const startDate = formatDate(p.policyStartDate || p.startDate);
        const endDate = formatDate(p.policyEndDate || p.endDate);

        const premiumClass = premium < 0 ? 'td-premium td-negative' : 'td-premium';
        const commissionClass = commission < 0 ? 'td-premium td-negative' : 'td-premium';

        const pIdx = p.policyIndex || '';
        return `<tr onclick="openPolicy(${pIdx})">
            <td class="td-center">${i + 1}</td>
            <td><strong>${esc(p._agentName)}</strong></td>
            <td class="td-center">${esc(String(policyNum))}</td>
            <td class="td-center">${esc(String(supplement))}</td>
            <td>${esc(customerName)}</td>
            <td>${esc(insuranceType)}</td>
            <td class="td-center">${startDate}</td>
            <td class="td-center">${endDate}</td>
            <td class="${premiumClass}">${formatCurrency(premium)}</td>
            <td class="${commissionClass}">${formatCurrency(commission)}</td>
        </tr>`;
    }).join('');

    if (tfoot) {
        const totalPremClass = totalPremium < 0 ? 'td-premium td-negative' : 'td-premium';
        const totalCommClass = totalCommission < 0 ? 'td-premium td-negative' : 'td-premium';
        tfoot.innerHTML = `<tr>
            <td colspan="8" style="text-align: right; font-weight: 800;">סה"כ</td>
            <td class="${totalPremClass}">${formatCurrency(totalPremium)}</td>
            <td class="${totalCommClass}">${formatCurrency(totalCommission)}</td>
        </tr>`;
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

function formatCurrency(n) {
    if (n === null || n === undefined) return '$0';
    const val = Number(n);
    if (val < 0) return '-$' + formatNumber(Math.abs(val));
    return '$' + formatNumber(val);
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

// ==================== Policy Modal ====================
async function openPolicy(policyIndex) {
    if (!policyIndex) return;

    const modal = document.getElementById('policyModal');
    const body = document.getElementById('modalBody');
    const title = document.getElementById('modalTitle');
    const subtitle = document.getElementById('modalSubtitle');

    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    body.innerHTML = '<div class="loading-overlay"><div class="spinner"></div> טוען פרטי פוליסה...</div>';
    title.textContent = 'פוליסה ' + policyIndex;
    subtitle.textContent = '';

    try {
        const res = await apiFetch('/dashboard/external/policies?policyIndex=' + policyIndex);
        if (!res || !res.ok) {
            body.innerHTML = '<div class="empty-msg"><p>שגיאה בטעינת פרטי הפוליסה</p></div>';
            return;
        }

        const data = await res.json();
        if (data.fullPolicyID) title.textContent = 'פוליסה ' + data.fullPolicyID;
        if (data.clientName) subtitle.textContent = data.clientName + (data.areaName ? ' | ' + data.areaName : '');

        renderPolicyDetails(data);
    } catch (err) {
        console.error('Error loading policy details:', err);
        body.innerHTML = '<div class="empty-msg"><p>שגיאה בטעינת פרטי הפוליסה</p></div>';
    }
}

function renderPolicyDetails(p) {
    const body = document.getElementById('modalBody');
    if (!p) { body.innerHTML = '<div class="empty-msg"><p>לא נמצאו פרטים</p></div>'; return; }

    let html = '<div class="details-grid">';

    // Policy Info
    html += '<div class="details-section">';
    html += '<h3><span class="icon">📋</span> פרטי פוליסה</h3>';
    [
        ['מספר פוליסה', p.fullPolicyID],
        ['אינדקס', p.policyIndex],
        ['מוצר', p.branchName],
        ['אזור', p.areaName],
        ['תאריך הנפקה', formatDate(p.issueDate)],
        ['תאריך התחלה', formatDate(p.startDate)],
        ['תאריך סיום', formatDate(p.endDate)],
        ['סה"כ ימים', p.totalDays],
        ['מספר מבוטחים', p.customerCount],
        ['דוכת', p.doketNumber],
        ['תוספת', p.policyDoc],
    ].forEach(([label, value]) => {
        if (value !== null && value !== undefined && value !== '' && value !== 0) {
            html += `<div class="detail-row"><span class="detail-label">${label}</span><span class="detail-value">${esc(String(value))}</span></div>`;
        }
    });
    html += '</div>';

    // Financial
    html += '<div class="details-section">';
    html += '<h3><span class="icon">💰</span> נתונים כספיים</h3>';
    const finFields = [
        ['סה"כ פרמיה', '$' + formatNumber(p.total)],
        ['פרמיה בסיסית', p.basePolicyTotal ? '$' + formatNumber(p.basePolicyTotal) : null],
        ['פרמיית ריידרים', p.riderTotal ? '$' + formatNumber(p.riderTotal) : null],
        isOphir
            ? ['עמלת חתם', p.hatamTotal ? '$' + formatNumber(p.hatamTotal) : null]
            : ['עמלת סוכן', p.agentRateTotal ? '$' + formatNumber(p.agentRateTotal) : null],
    ];
    finFields.forEach(([label, value]) => {
        if (value !== null && value !== undefined) {
            html += `<div class="detail-row"><span class="detail-label">${label}</span><span class="detail-value premium">${value}</span></div>`;
        }
    });

    // Agent info
    [
        ['סוכן', p.agentName],
        ['קוד סוכן', p.agentCode || null],
        ['סניף סוכן', p.snifAgentName],
        ['מזהה הראל', p.harelAgentId],
    ].forEach(([label, value]) => {
        if (value !== null && value !== undefined && value !== '' && value !== 0) {
            html += `<div class="detail-row"><span class="detail-label">${label}</span><span class="detail-value">${esc(String(value))}</span></div>`;
        }
    });
    html += '</div>';

    // Payer
    if (p.payerFirstName || p.payerLastaName || p.payerTz) {
        html += '<div class="details-section">';
        html += '<h3><span class="icon">💳</span> פרטי משלם</h3>';
        [
            ['שם', [p.payerFirstName, p.payerLastaName].filter(Boolean).join(' ')],
            ['ת.ז', p.payerTz],
        ].forEach(([label, value]) => {
            if (value) html += `<div class="detail-row"><span class="detail-label">${label}</span><span class="detail-value">${esc(value)}</span></div>`;
        });
        html += '</div>';
    }

    // Customers
    const custs = p.customers || [];
    if (custs.length > 0) {
        html += '<div class="details-section" style="grid-column: 1 / -1;">';
        html += '<h3><span class="icon">👥</span> מבוטחים (' + custs.length + ')</h3>';
        custs.forEach((c, i) => {
            const name = [c.firstName, c.hebLname].filter(Boolean).join(' ') || c.clientName || '-';
            const engName = [c.engFname, c.engLname].filter(Boolean).join(' ');
            html += '<div style="' + (i > 0 ? 'margin-top:16px;padding-top:16px;border-top:1px solid var(--gray-200);' : '') + '">';
            html += '<div style="font-weight:700;font-size:14px;margin-bottom:8px;color:var(--dark);">' + esc(name);
            if (engName) html += ' <span style="color:var(--gray-400);font-weight:400;">(' + esc(engName) + ')</span>';
            html += '</div>';
            [
                ['ת.ז / דרכון', c.personId],
                ['תאריך לידה', formatDate(c.birthDate)],
                ['טלפון', c.phone || c.mobile],
                ['אימייל', c.email],
                ['כתובת', c.address],
            ].forEach(([label, value]) => {
                if (value && value !== '-') {
                    html += `<div class="detail-row"><span class="detail-label">${label}</span><span class="detail-value">${esc(String(value))}</span></div>`;
                }
            });
            if (c.riders && c.riders.length > 0) {
                html += '<div style="margin-top:10px;"><div style="font-weight:600;font-size:12px;color:var(--gray-500);margin-bottom:6px;">כיסויים:</div>';
                html += '<table class="customers-table"><thead><tr><th>כיסוי</th><th>תאריך התחלה</th><th>תאריך סיום</th><th>פרמיה</th></tr></thead><tbody>';
                c.riders.forEach(r => {
                    html += `<tr><td>${esc(r.riderName)}</td><td>${formatDate(r.startDate)}</td><td>${formatDate(r.endDate)}</td><td>$${formatNumber(r.riderTotal)}</td></tr>`;
                });
                html += '</tbody></table></div>';
            }
            html += '</div>';
        });
        html += '</div>';
    }

    html += '</div>';
    body.innerHTML = html;
}

function closeModal() {
    const modal = document.getElementById('policyModal');
    modal.classList.remove('show');
    document.body.style.overflow = '';
}

function closeModalOverlay(event) {
    if (event.target === event.currentTarget) closeModal();
}
