// Policies Search Page JS - v3
let allPolicies = [];
let selectedPolicyIndex = null;
let isSearching = false;
let searchTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
    initUser();
    loadPolicies();
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

// ==================== Load Policies ====================
async function loadPolicies() {
    showError(null);
    try {
        const res = await apiFetch('/dashboard/external/policies?top=500');
        if (!res) return;

        if (res.status === 403) {
            showError('אין הרשאה לצפות בנתוני ביטוח אופיר.');
            return;
        }
        if (!res.ok) {
            showError('שגיאה בטעינת פוליסות (קוד: ' + res.status + ')');
            return;
        }

        const data = await res.json();
        allPolicies = Array.isArray(data) ? data : [];
        document.getElementById('totalCount').textContent = allPolicies.length + ' פוליסות';
        renderPoliciesTable(allPolicies);
    } catch (err) {
        console.error('Error loading policies:', err);
        showError('שגיאת תקשורת עם מערכת ביטוח אופיר.');
    }
}

// ==================== Search ====================
function searchPolicies() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) {
        renderPoliciesTable(allPolicies);
        document.getElementById('searchCount').textContent = '';
        return;
    }

    // Check if query looks like a TZ / ID number (6+ digits)
    const isNumericQuery = /^\d{5,}$/.test(query);

    if (isNumericQuery) {
        // Debounce server-side search
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => searchByIdServer(query), 400);
    } else {
        // Client-side search (instant)
        const lowerQuery = query.toLowerCase();
        const filtered = allPolicies.filter(p => {
            const fields = [
                p.fullPolicyID,
                p.policyIndex,
                p.clientName,
                p.agentName,
                p.doketNumber,
                p.payerTz,
                p.payerFirstName,
                p.payerLastaName,
                p.mnYear,
                p.areaName
            ].filter(Boolean).map(v => String(v).toLowerCase());

            return fields.some(f => f.includes(lowerQuery));
        });

        document.getElementById('searchCount').textContent = filtered.length + ' תוצאות מתוך ' + allPolicies.length;
        renderPoliciesTable(filtered);
    }
}

// Server-side search by TZ / ID
async function searchByIdServer(idQuery) {
    if (isSearching) return;
    isSearching = true;

    const tbody = document.getElementById('policiesBody');
    tbody.innerHTML = '<tr><td colspan="12"><div class="loading-overlay"><div class="spinner"></div> מחפש לפי ת.ז / מספר מזהה...</div></td></tr>';

    try {
        const res = await apiFetch('/dashboard/external/policies?id=' + encodeURIComponent(idQuery));
        if (!res || !res.ok) {
            document.getElementById('searchCount').textContent = 'שגיאה בחיפוש';
            tbody.innerHTML = '<tr><td colspan="12"><div class="empty-msg"><p>שגיאה בחיפוש לפי ת.ז</p></div></td></tr>';
            isSearching = false;
            return;
        }

        const data = await res.json();
        const results = Array.isArray(data) ? data : [];
        document.getElementById('searchCount').textContent = results.length + ' פוליסות נמצאו עבור ת.ז ' + idQuery;
        renderPoliciesTable(results);
    } catch (err) {
        console.error('Error searching by ID:', err);
        tbody.innerHTML = '<tr><td colspan="12"><div class="empty-msg"><p>שגיאה בחיפוש</p></div></td></tr>';
    }
    isSearching = false;
}

// ==================== Render Table ====================
function renderPoliciesTable(policies) {
    const tbody = document.getElementById('policiesBody');
    if (!policies || policies.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12"><div class="empty-msg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><p>לא נמצאו פוליסות</p></div></td></tr>';
        return;
    }

    tbody.innerHTML = policies.map(p => {
        const idx = p.policyIndex;
        const issueDate = p.issueDate ? new Date(p.issueDate) : null;
        const issueTime = issueDate && !isNaN(issueDate.getTime())
            ? issueDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
            : '-';

        return `<tr onclick="selectPolicy(${idx}, this)" class="${selectedPolicyIndex === idx ? 'selected' : ''}">
            <td><strong>${esc(p.fullPolicyID || String(p.policyIndex))}</strong></td>
            <td>${esc(p.agentName || '-')}</td>
            <td class="td-center">${esc(p.agentCode ? String(p.agentCode) : '-')}</td>
            <td>${esc(p.mnYear || '-')}</td>
            <td>${esc(p.clientName || '-')}</td>
            <td>${formatDate(p.startDate)}</td>
            <td>${formatDate(p.endDate)}</td>
            <td>${formatDate(p.issueDate)}</td>
            <td class="td-center">${issueTime}</td>
            <td class="td-center">${esc(p.policyDoc || '-')}</td>
            <td class="td-premium">$${formatNumber(p.total)}</td>
            <td>${esc(p.doketNumber ? String(p.doketNumber) : '-')}</td>
        </tr>`;
    }).join('');
}

// ==================== Policy Details ====================
async function selectPolicy(policyIndex, rowEl) {
    if (!policyIndex) return;

    selectedPolicyIndex = policyIndex;

    // Highlight selected row
    const rows = document.querySelectorAll('.policies-table tbody tr');
    rows.forEach(r => r.classList.remove('selected'));
    if (rowEl) rowEl.classList.add('selected');

    // Show panel with loading
    const panel = document.getElementById('policyDetailsPanel');
    const body = document.getElementById('detailsBody');
    const title = document.getElementById('detailsTitle');

    panel.classList.add('show');
    body.innerHTML = '<div class="loading-overlay"><div class="spinner"></div> טוען פרטי פוליסה...</div>';
    title.textContent = 'פוליסה ' + policyIndex;

    // Scroll to panel
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    try {
        const res = await apiFetch('/dashboard/external/policies?policyIndex=' + policyIndex);
        if (!res || !res.ok) {
            body.innerHTML = '<div class="empty-msg"><p>שגיאה בטעינת פרטי הפוליסה</p></div>';
            return;
        }

        const data = await res.json();
        console.log('Policy details:', data);
        renderPolicyDetails(data);
    } catch (err) {
        console.error('Error loading policy details:', err);
        body.innerHTML = '<div class="empty-msg"><p>שגיאה בטעינת פרטי הפוליסה</p></div>';
    }
}

function renderPolicyDetails(p) {
    const body = document.getElementById('detailsBody');
    if (!p) {
        body.innerHTML = '<div class="empty-msg"><p>לא נמצאו פרטים לפוליסה זו</p></div>';
        return;
    }

    let html = '<div class="details-grid">';

    // === Policy Info Section ===
    html += '<div class="details-section">';
    html += '<h3><span class="icon">📋</span> פרטי פוליסה</h3>';
    const policyFields = [
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
    ];
    policyFields.forEach(([label, value]) => {
        if (value !== null && value !== undefined && value !== '' && value !== 0) {
            html += `<div class="detail-row"><span class="detail-label">${label}</span><span class="detail-value">${esc(String(value))}</span></div>`;
        }
    });
    html += '</div>';

    // === Financial Section ===
    html += '<div class="details-section">';
    html += '<h3><span class="icon">💰</span> נתונים כספיים</h3>';
    const finFields = [
        ['סה"כ פרמיה', '$' + formatNumber(p.total)],
        ['פרמיה בסיסית', p.basePolicyTotal ? '$' + formatNumber(p.basePolicyTotal) : null],
        ['פרמיית ריידרים', p.riderTotal ? '$' + formatNumber(p.riderTotal) : null],
        ['עמלת חתם', p.hatamTotal ? '$' + formatNumber(p.hatamTotal) : null],
    ];
    finFields.forEach(([label, value]) => {
        if (value !== null && value !== undefined) {
            html += `<div class="detail-row"><span class="detail-label">${label}</span><span class="detail-value premium">${value}</span></div>`;
        }
    });

    // Agent info
    const agentFields = [
        ['סוכן', p.agentName],
        ['קוד סוכן', p.agentCode || null],
        ['סניף סוכן', p.snifAgentName],
        ['מזהה הראל', p.harelAgentId],
    ];
    agentFields.forEach(([label, value]) => {
        if (value !== null && value !== undefined && value !== '' && value !== 0) {
            html += `<div class="detail-row"><span class="detail-label">${label}</span><span class="detail-value">${esc(String(value))}</span></div>`;
        }
    });
    html += '</div>';

    // === Payer Section ===
    if (p.payerFirstName || p.payerLastaName || p.payerTz) {
        html += '<div class="details-section">';
        html += '<h3><span class="icon">💳</span> פרטי משלם</h3>';
        const payerFields = [
            ['שם', [p.payerFirstName, p.payerLastaName].filter(Boolean).join(' ')],
            ['ת.ז', p.payerTz],
        ];
        payerFields.forEach(([label, value]) => {
            if (value) html += `<div class="detail-row"><span class="detail-label">${label}</span><span class="detail-value">${esc(value)}</span></div>`;
        });
        html += '</div>';
    }

    // === Customers / Insured ===
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

            const custFields = [
                ['ת.ז / דרכון', c.personId],
                ['תאריך לידה', formatDate(c.birthDate)],
                ['טלפון', c.phone || c.mobile],
                ['אימייל', c.email],
                ['כתובת', c.address],
            ];
            custFields.forEach(([label, value]) => {
                if (value && value !== '-') {
                    html += `<div class="detail-row"><span class="detail-label">${label}</span><span class="detail-value">${esc(String(value))}</span></div>`;
                }
            });

            // Riders for this customer
            if (c.riders && c.riders.length > 0) {
                html += '<div style="margin-top:10px;">';
                html += '<div style="font-weight:600;font-size:12px;color:var(--gray-500);margin-bottom:6px;">כיסויים:</div>';
                html += '<table class="customers-table"><thead><tr><th>כיסוי</th><th>תאריך התחלה</th><th>תאריך סיום</th><th>פרמיה</th></tr></thead><tbody>';
                c.riders.forEach(r => {
                    html += `<tr>
                        <td>${esc(r.riderName)}</td>
                        <td>${formatDate(r.startDate)}</td>
                        <td>${formatDate(r.endDate)}</td>
                        <td>$${formatNumber(r.riderTotal)}</td>
                    </tr>`;
                });
                html += '</tbody></table>';
                html += '</div>';
            }

            html += '</div>';
        });

        html += '</div>';
    }

    html += '</div>'; // close details-grid
    body.innerHTML = html;
}

function closePolicyDetails() {
    const panel = document.getElementById('policyDetailsPanel');
    panel.classList.remove('show');
    selectedPolicyIndex = null;

    const rows = document.querySelectorAll('.policies-table tbody tr');
    rows.forEach(r => r.classList.remove('selected'));
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
