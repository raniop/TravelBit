// Trips Page JS
let currentPage = 1;

document.addEventListener('DOMContentLoaded', () => {
    initUser();
    loadTrips();
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

async function loadTrips(page = 1) {
    currentPage = page;
    const dest = document.getElementById('filterDest').value;
    const status = document.getElementById('filterStatus').value;
    const startDate = document.getElementById('filterStart').value;
    const endDate = document.getElementById('filterEnd').value;

    let url = `/dashboard/trips?page=${page}&limit=20`;
    if (dest) url += `&destination=${encodeURIComponent(dest)}`;
    if (status) url += `&status=${status}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;

    try {
        const res = await apiFetch(url);
        if (!res || !res.ok) return;
        const data = await res.json();

        document.getElementById('tripCount').textContent = `סה"כ ${data.total} נסיעות`;
        renderTrips(data.trips);
        renderPagination(data.page, data.pages);
    } catch (err) {
        console.error('Error loading trips:', err);
    }
}

function renderTrips(trips) {
    const tbody = document.getElementById('tripsTable');

    if (!trips || trips.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><h3>לא נמצאו נסיעות</h3><p>נסה לשנות את הסינון</p></div></td></tr>`;
        return;
    }

    const statusMap = {
        planned: { label: 'מתוכנן', class: 'badge-planned' },
        active: { label: 'פעיל', class: 'badge-active' },
        completed: { label: 'הושלם', class: 'badge-completed' },
        cancelled: { label: 'בוטל', class: 'badge-cancelled' }
    };

    tbody.innerHTML = trips.map(t => {
        const emp = t.employeeId;
        const status = statusMap[t.status] || { label: t.status, class: '' };
        const duration = t.duration || '-';
        return `
            <tr>
                <td><strong>${emp ? esc(emp.firstName + ' ' + emp.lastName) : '-'}</strong></td>
                <td>${emp ? esc(emp.department || '-') : '-'}</td>
                <td>${esc(t.destination)}</td>
                <td>${fmtDate(t.departureDate)}</td>
                <td>${fmtDate(t.returnDate)}</td>
                <td>${duration}</td>
                <td>${t.workdaysAbroad || 0}</td>
                <td>${fmtCurrency(t.cost)}</td>
                <td><span class="badge ${status.class}">${status.label}</span></td>
            </tr>
        `;
    }).join('');
}

function renderPagination(page, totalPages) {
    const el = document.getElementById('pagination');
    if (totalPages <= 1) { el.innerHTML = ''; return; }

    let html = '';
    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="btn btn-sm ${i === page ? 'btn-primary' : 'btn-secondary'}" onclick="loadTrips(${i})">${i}</button>`;
    }
    el.innerHTML = html;
}

function exportTrips() {
    const token = getToken();
    window.open(`/api/dashboard/export/trips?token=${token}`, '_blank');
}

function fmtDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('he-IL');
}

function fmtCurrency(amount) {
    if (!amount && amount !== 0) return '-';
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(amount);
}

function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
