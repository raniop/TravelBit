// Admin Dashboard JS
let currentSection = 'companies';

document.addEventListener('DOMContentLoaded', () => {
    const user = getUser();
    if (user) {
        const nameEl = document.getElementById('userName');
        const avatarEl = document.getElementById('userAvatar');
        if (nameEl) nameEl.textContent = user.name || 'מנהל';
        if (avatarEl) avatarEl.textContent = (user.name || 'A').charAt(0);
    }

    loadStats();
    loadRecentCompanies();
});

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

async function loadStats() {
    try {
        const res = await apiFetch('/admin/stats');
        if (!res.ok) return;
        const data = await res.json();

        document.getElementById('statCompanies').textContent = data.companies;
        document.getElementById('statEmployees').textContent = data.employees;
        document.getElementById('statTrips').textContent = data.activeTrips;
        document.getElementById('statExpiring').textContent = data.expiringPolicies;
    } catch (err) {
        console.error('Error loading stats:', err);
    }
}

// === Section Switching ===

function showSection(type) {
    if (currentSection === type) return;
    currentSection = type;

    // Hide all sections
    document.querySelectorAll('.section-panel').forEach(el => el.style.display = 'none');

    // Remove active from all cards
    document.querySelectorAll('.stat-card').forEach(el => el.classList.remove('active'));

    // Show selected section + highlight card
    const sectionMap = {
        companies: { section: 'sectionCompanies', card: 'cardCompanies' },
        employees: { section: 'sectionEmployees', card: 'cardEmployees' },
        trips: { section: 'sectionTrips', card: 'cardTrips' },
        policies: { section: 'sectionPolicies', card: 'cardPolicies' }
    };

    const target = sectionMap[type];
    if (target) {
        document.getElementById(target.section).style.display = '';
        document.getElementById(target.card).classList.add('active');
    }

    // Load data for selected section
    if (type === 'companies') loadRecentCompanies();
    if (type === 'employees') loadEmployees();
    if (type === 'trips') loadTrips();
    if (type === 'policies') loadPolicies();
}

// === Companies ===

async function loadRecentCompanies() {
    try {
        const res = await apiFetch('/admin/companies');
        if (!res.ok) return;
        const companies = await res.json();

        const tbody = document.getElementById('companiesTable');
        if (companies.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><h3>אין חברות במערכת</h3><p>לחץ על "הוספת חברה" כדי להתחיל</p></div></td></tr>`;
            return;
        }

        tbody.innerHTML = companies.slice(0, 10).map(c => `
            <tr>
                <td><strong>${esc(c.name)}</strong></td>
                <td>${esc(c.contactPerson)}</td>
                <td>${esc(c.email)}</td>
                <td>${c.employeeCount || 0}</td>
                <td>${c.totalTrips || 0}</td>
                <td><span class="badge ${c.isActive ? 'badge-active' : 'badge-cancelled'}">${c.isActive ? 'פעיל' : 'מושבת'}</span></td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Error loading companies:', err);
    }
}

// === Employees ===

async function loadEmployees() {
    const tbody = document.getElementById('employeesTable');
    tbody.innerHTML = '<tr><td colspan="6" class="loading"><div class="spinner"></div></td></tr>';
    try {
        const res = await apiFetch('/admin/stats?details=employees');
        if (!res.ok) return;
        const data = await res.json();
        const list = data.employeesList || [];

        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><h3>אין עובדים רשומים</h3></div></td></tr>';
            return;
        }

        tbody.innerHTML = list.map(e => `
            <tr>
                <td><strong>${esc(e.firstName)} ${esc(e.lastName)}</strong></td>
                <td>${esc(e.companyName)}</td>
                <td>${esc(e.department || '-')}</td>
                <td>${esc(e.position || '-')}</td>
                <td>${esc(e.email || '-')}</td>
                <td>${esc(e.phone || '-')}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Error loading employees:', err);
    }
}

// === Trips ===

async function loadTrips() {
    const tbody = document.getElementById('tripsTable');
    tbody.innerHTML = '<tr><td colspan="7" class="loading"><div class="spinner"></div></td></tr>';
    try {
        const res = await apiFetch('/admin/stats?details=trips');
        if (!res.ok) return;
        const data = await res.json();
        const list = data.tripsList || [];

        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><h3>אין נסיעות פעילות</h3></div></td></tr>';
            return;
        }

        tbody.innerHTML = list.map(t => {
            const emp = t.employeeId;
            const empName = emp ? `${esc(emp.firstName)} ${esc(emp.lastName)}` : '-';
            return `
                <tr>
                    <td><strong>${empName}</strong></td>
                    <td>${esc(t.companyName)}</td>
                    <td>${esc(t.destination)}</td>
                    <td>${fmtDate(t.departureDate)}</td>
                    <td>${fmtDate(t.returnDate)}</td>
                    <td>${fmtCurrency(t.cost)}</td>
                    <td><span class="badge badge-active">פעיל</span></td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Error loading trips:', err);
    }
}

// === Policies ===

async function loadPolicies() {
    const tbody = document.getElementById('policiesTable');
    tbody.innerHTML = '<tr><td colspan="5" class="loading"><div class="spinner"></div></td></tr>';
    try {
        const res = await apiFetch('/admin/stats?details=policies');
        if (!res.ok) return;
        const data = await res.json();
        const list = data.policiesList || [];

        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><h3>אין פוליסות לחידוש</h3></div></td></tr>';
            return;
        }

        tbody.innerHTML = list.map(p => `
            <tr>
                <td><strong>${esc(p.companyName)}</strong></td>
                <td>${esc(p.policyNumber || '-')}</td>
                <td>${esc(p.type || '-')}</td>
                <td>${fmtDate(p.expirationDate)}</td>
                <td><span class="badge badge-planned">${esc(p.status || '-')}</span></td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Error loading policies:', err);
    }
}

// === Utilities ===

function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Keep old name for backward compat
const escapeHtml = esc;

function fmtDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('he-IL');
}

function fmtCurrency(amount) {
    if (!amount && amount !== 0) return '-';
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(amount);
}
