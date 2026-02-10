// Employees Management JS
let currentPage = 1;
let editingEmployeeId = null;

document.addEventListener('DOMContentLoaded', () => {
    initUser();
    loadEmployees();

    document.getElementById('searchInput').addEventListener('input', debounce(() => loadEmployees(), 300));
    document.getElementById('statusFilter').addEventListener('change', () => loadEmployees());
    document.getElementById('deptFilter').addEventListener('change', () => loadEmployees());
});

function initUser() {
    const user = getUser();
    if (user) {
        const nameEl = document.getElementById('userName');
        const avatarEl = document.getElementById('userAvatar');
        const companyEl = document.getElementById('companyName');
        if (nameEl) nameEl.textContent = user.name || 'משתמש';
        if (avatarEl) avatarEl.textContent = (user.name || 'C').charAt(0);
        if (companyEl) companyEl.textContent = user.companyName || user.name || 'חברה';
    }
}

async function loadEmployees(page = 1) {
    currentPage = page;
    const search = document.getElementById('searchInput').value;
    const status = document.getElementById('statusFilter').value;
    const department = document.getElementById('deptFilter').value;

    let url = `/dashboard/employees?page=${page}&limit=30`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (status) url += `&status=${status}`;
    if (department) url += `&department=${encodeURIComponent(department)}`;

    try {
        const res = await apiFetch(url);
        if (!res || !res.ok) return;
        const data = await res.json();

        document.getElementById('empCount').textContent = `סה"כ ${data.total} עובדים`;
        renderEmployees(data.employees);
        renderPagination(data.page, data.pages);
        updateDepartmentFilter(data.departments);
    } catch (err) {
        console.error('Error loading employees:', err);
    }
}

function updateDepartmentFilter(departments) {
    const select = document.getElementById('deptFilter');
    const currentVal = select.value;
    // Keep existing selection
    if (select.options.length <= 1 && departments && departments.length > 0) {
        departments.filter(d => d).forEach(dept => {
            const opt = document.createElement('option');
            opt.value = dept;
            opt.textContent = dept;
            select.appendChild(opt);
        });
        if (currentVal) select.value = currentVal;
    }
}

function renderEmployees(employees) {
    const tbody = document.getElementById('employeesTable');

    if (!employees || employees.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><h3>לא נמצאו עובדים</h3><p>הוסף עובד חדש או שנה את הסינון</p></div></td></tr>`;
        return;
    }

    tbody.innerHTML = employees.map(emp => `
        <tr>
            <td><strong>${esc(emp.firstName + ' ' + emp.lastName)}</strong></td>
            <td>${esc(emp.idNumber || '-')}</td>
            <td>${esc(emp.email || '-')}</td>
            <td>${esc(emp.phone || '-')}</td>
            <td>${esc(emp.department || '-')}</td>
            <td>${esc(emp.position || '-')}</td>
            <td><span class="badge ${emp.isActive ? 'badge-active' : 'badge-cancelled'}">${emp.isActive ? 'פעיל' : 'מושבת'}</span></td>
            <td>
                <div style="display:flex; gap:6px;">
                    <button class="btn btn-secondary btn-sm" onclick='openEditModal(${JSON.stringify(emp)})' title="עריכה">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    ${emp.isActive
                        ? `<button class="btn btn-danger btn-sm" onclick="deactivateEmployee('${emp._id}', '${esc(emp.firstName + ' ' + emp.lastName)}')" title="השבתה">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                           </button>`
                        : `<button class="btn btn-sm" style="background:var(--success);color:white;" onclick="activateEmployee('${emp._id}')" title="הפעלה">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                           </button>`
                    }
                </div>
            </td>
        </tr>
    `).join('');
}

function renderPagination(page, totalPages) {
    const el = document.getElementById('pagination');
    if (totalPages <= 1) { el.innerHTML = ''; return; }

    let html = '';
    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="btn btn-sm ${i === page ? 'btn-primary' : 'btn-secondary'}" onclick="loadEmployees(${i})">${i}</button>`;
    }
    el.innerHTML = html;
}

// === Modal Functions ===

function openAddModal() {
    editingEmployeeId = null;
    document.getElementById('modalTitle').textContent = 'הוספת עובד חדש';
    document.getElementById('employeeForm').reset();
    document.getElementById('modalError').classList.remove('show');
    document.getElementById('submitBtn').textContent = 'הוספת עובד';
    document.getElementById('employeeModal').classList.add('show');
}

function openEditModal(emp) {
    editingEmployeeId = emp._id;
    document.getElementById('modalTitle').textContent = 'עריכת עובד';
    document.getElementById('submitBtn').textContent = 'שמירת שינויים';
    document.getElementById('modalError').classList.remove('show');

    // Populate form
    document.querySelector('#employeeForm [name="firstName"]').value = emp.firstName || '';
    document.querySelector('#employeeForm [name="lastName"]').value = emp.lastName || '';
    document.querySelector('#employeeForm [name="idNumber"]').value = emp.idNumber || '';
    document.querySelector('#employeeForm [name="email"]').value = emp.email || '';
    document.querySelector('#employeeForm [name="phone"]').value = emp.phone || '';
    document.querySelector('#employeeForm [name="department"]').value = emp.department || '';
    document.querySelector('#employeeForm [name="position"]').value = emp.position || '';

    document.getElementById('employeeModal').classList.add('show');
}

function closeModal() {
    document.getElementById('employeeModal').classList.remove('show');
    editingEmployeeId = null;
}

async function submitEmployee() {
    const form = document.getElementById('employeeForm');
    const errorEl = document.getElementById('modalError');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    if (!data.firstName || !data.lastName) {
        errorEl.textContent = 'נא למלא שם פרטי ושם משפחה.';
        errorEl.classList.add('show');
        return;
    }

    try {
        let url = '/dashboard/employees';
        let method = 'POST';

        if (editingEmployeeId) {
            url += `?id=${editingEmployeeId}`;
            method = 'PUT';
        }

        const res = await apiFetch(url, {
            method,
            body: JSON.stringify(data)
        });

        const result = await res.json();
        if (!res.ok) throw new Error(result.message);

        closeModal();
        loadEmployees(currentPage);
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.add('show');
    }
}

async function deactivateEmployee(id, name) {
    if (!confirm(`האם אתה בטוח שברצונך להשבית את העובד ${name}?`)) return;

    try {
        const res = await apiFetch(`/dashboard/employees?id=${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.message);
        }
        loadEmployees(currentPage);
    } catch (err) {
        console.error('Deactivate error:', err);
        alert('שגיאה בהשבתת העובד: ' + err.message);
    }
}

async function activateEmployee(id) {
    try {
        const res = await apiFetch(`/dashboard/employees?id=${id}`, {
            method: 'PUT',
            body: JSON.stringify({ isActive: true })
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.message);
        }
        loadEmployees(currentPage);
    } catch (err) {
        console.error('Activate error:', err);
        alert('שגיאה בהפעלת העובד: ' + err.message);
    }
}

// === Utilities ===

function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
