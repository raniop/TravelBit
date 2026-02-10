// Policies Search Page JS - v1
let allPolicies = [];
let selectedPolicyIndex = null;

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
        console.log('Policies data:', data);

        allPolicies = Array.isArray(data) ? data : (data.policies || data.items || []);
        document.getElementById('totalCount').textContent = allPolicies.length + ' פוליסות';
        renderPoliciesTable(allPolicies);
    } catch (err) {
        console.error('Error loading policies:', err);
        showError('שגיאת תקשורת עם מערכת ביטוח אופיר.');
    }
}

// ==================== Search ====================
function searchPolicies() {
    const query = document.getElementById('searchInput').value.trim().toLowerCase();
    if (!query) {
        renderPoliciesTable(allPolicies);
        document.getElementById('searchCount').textContent = '';
        return;
    }

    const filtered = allPolicies.filter(p => {
        const searchFields = [
            p.policyNumber, p.policyIndex, p.polisa, p.policyNum,
            p.customerName, p.insuredName, p.name, p.fullName, p.firstName, p.lastName,
            p.destination, p.destinationName, p.yead, p.azor,
            p.id, p.customerId, p.taz
        ].filter(Boolean).map(v => String(v).toLowerCase());

        return searchFields.some(f => f.includes(query));
    });

    document.getElementById('searchCount').textContent = filtered.length + ' תוצאות מתוך ' + allPolicies.length;
    renderPoliciesTable(filtered);
}

// ==================== Render Table ====================
function renderPoliciesTable(policies) {
    const tbody = document.getElementById('policiesBody');
    if (!policies || policies.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7"><div class="empty-msg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><p>לא נמצאו פוליסות</p></div></td></tr>';
        return;
    }

    tbody.innerHTML = policies.map(p => {
        const policyNum = p.policyNumber || p.policyIndex || p.polisa || p.policyNum || p.id || '-';
        const name = p.customerName || p.insuredName || p.name || p.fullName || [p.firstName, p.lastName].filter(Boolean).join(' ') || '-';
        const dest = p.destination || p.destinationName || p.yead || p.azor || '-';
        const startDate = formatDate(p.startDate || p.fromDate || p.beginDate || p.policyStartDate);
        const endDate = formatDate(p.endDate || p.toDate || p.policyEndDate);
        const premium = p.premium || p.totalPremium || p.amount || 0;
        const status = getPolicyStatus(p);
        const idx = p.policyIndex || p.policyNumber || p.polisa || p.id;

        return `<tr onclick="selectPolicy('${esc(String(idx))}')" class="${selectedPolicyIndex === String(idx) ? 'selected' : ''}">
            <td><strong>${esc(String(policyNum))}</strong></td>
            <td>${esc(name)}</td>
            <td class="td-destination">${esc(dest)}</td>
            <td>${startDate}</td>
            <td>${endDate}</td>
            <td class="td-premium">$${formatNumber(premium)}</td>
            <td>${status}</td>
        </tr>`;
    }).join('');
}

function getPolicyStatus(p) {
    const statusVal = p.status || p.policyStatus || '';
    const endDate = p.endDate || p.toDate || p.policyEndDate;

    if (endDate) {
        const end = new Date(endDate);
        const now = new Date();
        if (end < now) return '<span class="status-badge status-expired">פג תוקף</span>';
        const daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
        if (daysLeft <= 30) return '<span class="status-badge status-pending">עומד לפוג</span>';
        return '<span class="status-badge status-active">פעיל</span>';
    }

    if (typeof statusVal === 'string') {
        const s = statusVal.toLowerCase();
        if (s.includes('active') || s.includes('פעיל')) return '<span class="status-badge status-active">פעיל</span>';
        if (s.includes('expired') || s.includes('פג')) return '<span class="status-badge status-expired">פג תוקף</span>';
    }

    return '<span class="status-badge status-active">פעיל</span>';
}

// ==================== Policy Details ====================
async function selectPolicy(policyIndex) {
    if (!policyIndex || policyIndex === 'undefined') return;

    selectedPolicyIndex = String(policyIndex);

    // Highlight selected row
    const rows = document.querySelectorAll('.policies-table tbody tr');
    rows.forEach(r => r.classList.remove('selected'));
    event.currentTarget.classList.add('selected');

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
        // Fetch policy details and customer details in parallel
        const [policyRes, customersRes] = await Promise.all([
            apiFetch('/dashboard/external/policies?policyIndex=' + encodeURIComponent(policyIndex)),
            apiFetch('/dashboard/external/policy-details?policyIndex=' + encodeURIComponent(policyIndex))
        ]);

        let policyData = null;
        let customersData = null;

        if (policyRes && policyRes.ok) {
            policyData = await policyRes.json();
            console.log('Policy details:', policyData);
        }

        if (customersRes && customersRes.ok) {
            customersData = await customersRes.json();
            console.log('Customer details:', customersData);
        }

        renderPolicyDetails(policyData, customersData);
    } catch (err) {
        console.error('Error loading policy details:', err);
        body.innerHTML = '<div class="empty-msg"><p>שגיאה בטעינת פרטי הפוליסה</p></div>';
    }
}

function renderPolicyDetails(policy, customers) {
    const body = document.getElementById('detailsBody');

    if (!policy && !customers) {
        body.innerHTML = '<div class="empty-msg"><p>לא נמצאו פרטים לפוליסה זו</p></div>';
        return;
    }

    // Normalize policy data (could be object or array)
    const p = Array.isArray(policy) ? policy[0] : policy;
    const custs = Array.isArray(customers) ? customers : (customers ? [customers] : []);

    let html = '<div class="details-grid">';

    // === Policy Info Section ===
    html += '<div class="details-section">';
    html += '<h3><span class="icon">📋</span> פרטי פוליסה</h3>';
    if (p) {
        const fields = [
            ['מספר פוליסה', p.policyNumber || p.policyIndex || p.polisa || p.id],
            ['סוג ביטוח', p.policyType || p.insuranceType || p.type || p.productName],
            ['יעד', p.destination || p.destinationName || p.yead || p.azor],
            ['תאריך התחלה', formatDate(p.startDate || p.fromDate || p.beginDate || p.policyStartDate)],
            ['תאריך סיום', formatDate(p.endDate || p.toDate || p.policyEndDate)],
            ['פרמיה', p.premium || p.totalPremium ? '$' + formatNumber(p.premium || p.totalPremium) : null],
            ['מספר נוסעים', p.passengersCount || p.numOfPassengers || p.travelers],
            ['סוכן', p.agentName || p.agent],
            ['מספר סוכן', p.agentId || p.agentNumber],
            ['חברת ביטוח', p.insuranceCompany || p.company],
            ['סטטוס', p.status || p.policyStatus],
        ];

        fields.forEach(([label, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                html += `<div class="detail-row"><span class="detail-label">${label}</span><span class="detail-value">${esc(String(value))}</span></div>`;
            }
        });
    } else {
        html += '<div class="empty-msg"><p>אין פרטי פוליסה זמינים</p></div>';
    }
    html += '</div>';

    // === Customer/Insured Section ===
    html += '<div class="details-section">';
    html += '<h3><span class="icon">👤</span> פרטי מבוטחים</h3>';
    if (custs.length > 0) {
        html += '<table class="customers-table"><thead><tr>';
        // Determine columns from first customer
        const firstCust = custs[0];
        const custColumns = detectCustomerColumns(firstCust);
        custColumns.forEach(col => {
            html += `<th>${col.label}</th>`;
        });
        html += '</tr></thead><tbody>';

        custs.forEach(c => {
            html += '<tr>';
            custColumns.forEach(col => {
                let val = c[col.key] || '';
                if (col.isDate && val) val = formatDate(val);
                html += `<td>${esc(String(val))}</td>`;
            });
            html += '</tr>';
        });

        html += '</tbody></table>';
    } else {
        html += '<div class="empty-msg"><p>אין פרטי מבוטחים זמינים</p></div>';
    }
    html += '</div>';

    html += '</div>'; // close details-grid

    // === Additional raw data for debugging ===
    if (p) {
        const extraKeys = Object.keys(p).filter(k => {
            const skip = ['policyNumber','policyIndex','polisa','id','policyType','insuranceType','type','productName',
                'destination','destinationName','yead','azor','startDate','fromDate','beginDate','policyStartDate',
                'endDate','toDate','policyEndDate','premium','totalPremium','passengersCount','numOfPassengers',
                'travelers','agentName','agent','agentId','agentNumber','insuranceCompany','company','status','policyStatus'];
            return !skip.includes(k) && p[k] !== null && p[k] !== undefined && p[k] !== '';
        });

        if (extraKeys.length > 0) {
            html += '<div class="details-section" style="margin-top: 16px; grid-column: 1 / -1;">';
            html += '<h3><span class="icon">📊</span> נתונים נוספים</h3>';
            extraKeys.forEach(k => {
                const val = typeof p[k] === 'object' ? JSON.stringify(p[k]) : String(p[k]);
                html += `<div class="detail-row"><span class="detail-label">${esc(k)}</span><span class="detail-value">${esc(val)}</span></div>`;
            });
            html += '</div>';
        }
    }

    body.innerHTML = html;
}

function detectCustomerColumns(customer) {
    if (!customer) return [];
    const possibleColumns = [
        { key: 'firstName', label: 'שם פרטי', altKeys: ['name', 'custFirstName'] },
        { key: 'lastName', label: 'שם משפחה', altKeys: ['custLastName', 'familyName'] },
        { key: 'fullName', label: 'שם מלא', altKeys: ['customerName', 'insuredName'] },
        { key: 'idNumber', label: 'ת.ז', altKeys: ['taz', 'customerId', 'passportNumber', 'id'] },
        { key: 'birthDate', label: 'תאריך לידה', altKeys: ['dateOfBirth', 'dob'], isDate: true },
        { key: 'phone', label: 'טלפון', altKeys: ['phoneNumber', 'mobile', 'tel'] },
        { key: 'email', label: 'אימייל', altKeys: ['emailAddress', 'mail'] },
        { key: 'age', label: 'גיל', altKeys: ['customerAge'] },
        { key: 'riderName', label: 'ריידר', altKeys: ['rider', 'riderType', 'coverageName'] },
        { key: 'riderPremium', label: 'פרמיה', altKeys: ['premium', 'amount'] },
    ];

    const columns = [];
    const keys = Object.keys(customer);

    possibleColumns.forEach(col => {
        const foundKey = [col.key, ...(col.altKeys || [])].find(k => keys.includes(k) && customer[k] !== null && customer[k] !== undefined);
        if (foundKey) {
            columns.push({ key: foundKey, label: col.label, isDate: col.isDate || false });
        }
    });

    // If no known columns found, show all keys
    if (columns.length === 0) {
        keys.forEach(k => {
            if (customer[k] !== null && customer[k] !== undefined && typeof customer[k] !== 'object') {
                columns.push({ key: k, label: k, isDate: false });
            }
        });
    }

    return columns;
}

function closePolicyDetails() {
    const panel = document.getElementById('policyDetailsPanel');
    panel.classList.remove('show');
    selectedPolicyIndex = null;

    // Remove selection from rows
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
