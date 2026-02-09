// Trips Page JS
let currentPage = 1;
let editingTripId = null;
let employeesList = [];

document.addEventListener('DOMContentLoaded', () => {
    initUser();
    loadTrips();
    loadEmployeesForDropdown();
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

async function loadEmployeesForDropdown() {
    try {
        const res = await apiFetch('/dashboard/employees?limit=500&status=active');
        if (!res || !res.ok) return;
        const data = await res.json();
        employeesList = data.employees || [];
    } catch (err) {
        console.error('Error loading employees:', err);
    }
}

function populateEmployeeDropdown(selectedId) {
    const select = document.getElementById('tripEmployee');
    select.innerHTML = '<option value="">-- בחר עובד --</option>';
    employeesList.forEach(emp => {
        const opt = document.createElement('option');
        opt.value = emp._id;
        opt.textContent = emp.firstName + ' ' + emp.lastName + (emp.department ? ' (' + emp.department + ')' : '');
        if (selectedId && emp._id === selectedId) opt.selected = true;
        select.appendChild(opt);
    });
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
        tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><h3>לא נמצאו נסיעות</h3><p>הוסף נסיעה חדשה או שנה את הסינון</p></div></td></tr>`;
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
        const tripJson = JSON.stringify(t).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
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
                <td>
                    <div style="display:flex; gap:6px;">
                        <button class="btn btn-secondary btn-sm" onclick='openEditTripModal(${tripJson})' title="עריכה">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        ${t.status !== 'cancelled' ? `<button class="btn btn-danger btn-sm" onclick="cancelTrip('${t._id}', '${esc(t.destination)}')" title="ביטול">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                        </button>` : ''}
                    </div>
                </td>
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

// === Modal Functions ===

function openAddTripModal() {
    editingTripId = null;
    document.getElementById('tripModalTitle').textContent = 'הוספת נסיעה חדשה';
    document.getElementById('tripForm').reset();
    document.getElementById('tripModalError').classList.remove('show');
    document.getElementById('tripSubmitBtn').textContent = 'הוספת נסיעה';
    populateEmployeeDropdown(null);
    document.getElementById('tripModal').classList.add('show');
}

function openEditTripModal(trip) {
    editingTripId = trip._id;
    document.getElementById('tripModalTitle').textContent = 'עריכת נסיעה';
    document.getElementById('tripSubmitBtn').textContent = 'שמירת שינויים';
    document.getElementById('tripModalError').classList.remove('show');

    // Populate employee dropdown
    const empId = trip.employeeId ? (trip.employeeId._id || trip.employeeId) : '';
    populateEmployeeDropdown(empId);

    // Populate form fields
    document.querySelector('#tripForm [name="destination"]').value = trip.destination || '';
    document.querySelector('#tripForm [name="departureDate"]').value = trip.departureDate ? trip.departureDate.substring(0, 10) : '';
    document.querySelector('#tripForm [name="returnDate"]').value = trip.returnDate ? trip.returnDate.substring(0, 10) : '';
    document.querySelector('#tripForm [name="purpose"]').value = trip.purpose || '';
    document.querySelector('#tripForm [name="status"]').value = trip.status || 'planned';
    document.querySelector('#tripForm [name="cost"]').value = trip.cost || '';
    document.querySelector('#tripForm [name="currency"]').value = trip.currency || 'ILS';
    document.querySelector('#tripForm [name="workdaysAbroad"]').value = trip.workdaysAbroad || '';
    document.querySelector('#tripForm [name="notes"]').value = trip.notes || '';

    document.getElementById('tripModal').classList.add('show');
}

function closeTripModal() {
    document.getElementById('tripModal').classList.remove('show');
    editingTripId = null;
}

async function submitTrip() {
    const form = document.getElementById('tripForm');
    const errorEl = document.getElementById('tripModalError');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    // Use dropdown value for employeeId
    data.employeeId = document.getElementById('tripEmployee').value;

    if (!data.employeeId || !data.destination || !data.departureDate || !data.returnDate) {
        errorEl.textContent = 'נא למלא עובד, יעד, תאריך יציאה ותאריך חזרה.';
        errorEl.classList.add('show');
        return;
    }

    try {
        let url = '/dashboard/trips';
        let method = 'POST';

        if (editingTripId) {
            url += `?id=${editingTripId}`;
            method = 'PUT';
        }

        const res = await apiFetch(url, {
            method,
            body: JSON.stringify(data)
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.message);

        closeTripModal();
        loadTrips(currentPage);
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.add('show');
    }
}

async function cancelTrip(id, destination) {
    if (!confirm(`האם אתה בטוח שברצונך לבטל את הנסיעה ל${destination}?`)) return;

    try {
        const res = await apiFetch(`/dashboard/trips?id=${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.message);
        }
        loadTrips(currentPage);
    } catch (err) {
        console.error('Cancel trip error:', err);
        alert('שגיאה בביטול הנסיעה: ' + err.message);
    }
}

// === Utilities ===

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
