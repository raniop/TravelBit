// Admin Dashboard JS
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

async function loadRecentCompanies() {
    try {
        const res = await apiFetch('/admin/companies');
        if (!res.ok) return;
        const companies = await res.json();

        const tbody = document.getElementById('companiesTable');
        if (companies.length === 0) {
            tbody.innerHTML = `
                <tr><td colspan="6">
                    <div class="empty-state">
                        <h3>אין חברות במערכת</h3>
                        <p>לחץ על "הוספת חברה" כדי להתחיל</p>
                    </div>
                </td></tr>
            `;
            return;
        }

        tbody.innerHTML = companies.slice(0, 10).map(c => `
            <tr>
                <td><strong>${escapeHtml(c.name)}</strong></td>
                <td>${escapeHtml(c.contactPerson)}</td>
                <td>${escapeHtml(c.email)}</td>
                <td>${c.employeeCount || 0}</td>
                <td>${c.totalTrips || 0}</td>
                <td><span class="badge ${c.isActive ? 'badge-active' : 'badge-cancelled'}">${c.isActive ? 'פעיל' : 'מושבת'}</span></td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Error loading companies:', err);
    }
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
