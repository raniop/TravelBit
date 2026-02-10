// Companies Management JS
let allCompanies = [];
let importCompanyId = null;
let currentDetailCompanyId = null;

document.addEventListener('DOMContentLoaded', () => {
    const user = getUser();
    if (user) {
        const nameEl = document.getElementById('userName');
        const avatarEl = document.getElementById('userAvatar');
        if (nameEl) nameEl.textContent = user.name || 'מנהל';
        if (avatarEl) avatarEl.textContent = (user.name || 'A').charAt(0);
    }

    loadCompanies();

    // Search and filter handlers
    document.getElementById('searchInput').addEventListener('input', filterCompanies);
    document.getElementById('statusFilter').addEventListener('change', filterCompanies);
});

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

async function loadCompanies() {
    try {
        const res = await apiFetch('/admin/companies');
        if (!res.ok) return;
        allCompanies = await res.json();
        renderCompanies(allCompanies);
    } catch (err) {
        console.error('Error loading companies:', err);
    }
}

function filterCompanies() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const status = document.getElementById('statusFilter').value;

    let filtered = allCompanies;

    if (search) {
        filtered = filtered.filter(c =>
            c.name.toLowerCase().includes(search) ||
            c.contactPerson.toLowerCase().includes(search) ||
            c.email.toLowerCase().includes(search)
        );
    }

    if (status === 'active') filtered = filtered.filter(c => c.isActive);
    if (status === 'inactive') filtered = filtered.filter(c => !c.isActive);

    renderCompanies(filtered);
}

function renderCompanies(companies) {
    const tbody = document.getElementById('companiesTable');

    if (companies.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="8">
                <div class="empty-state">
                    <h3>לא נמצאו חברות</h3>
                    <p>נסה לשנות את החיפוש או הוסף חברה חדשה</p>
                </div>
            </td></tr>
        `;
        return;
    }

    tbody.innerHTML = companies.map(c => `
        <tr>
            <td><a href="#" onclick="openCompanyDetail('${c._id}');return false;" style="color:var(--dark);text-decoration:none;font-weight:700;border-bottom:1px dashed var(--gray-300);">${escapeHtml(c.name)}</a></td>
            <td>${escapeHtml(c.contactPerson)}</td>
            <td>${escapeHtml(c.email)}</td>
            <td>${escapeHtml(c.phone || '-')}</td>
            <td>${c.employeeCount || 0}</td>
            <td>${c.totalTrips || 0}</td>
            <td><span class="badge ${c.isActive ? 'badge-active' : 'badge-cancelled'}">${c.isActive ? 'פעיל' : 'מושבת'}</span></td>
            <td>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <button class="btn btn-secondary btn-sm" onclick="openAddUserModal('${c._id}', '${escapeHtml(c.name)}')" title="הוסף משתמש">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="openImportModal('${c._id}')" title="ייבוא נסיעות">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    </button>
                    <button class="btn btn-sm ${c.isActive ? 'btn-danger' : 'btn-success'}" onclick="toggleCompany('${c._id}', ${c.isActive})">
                        ${c.isActive ? 'השבת' : 'הפעל'}
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Add Company Modal
function openAddModal() {
    document.getElementById('addModal').classList.add('show');
    document.getElementById('addCompanyForm').reset();
    document.getElementById('addError').classList.remove('show');
}

function closeAddModal() {
    document.getElementById('addModal').classList.remove('show');
}

async function submitAddCompany() {
    const form = document.getElementById('addCompanyForm');
    const errorEl = document.getElementById('addError');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    if (!data.name || !data.contactPerson || !data.email || !data.username || !data.password) {
        errorEl.textContent = 'נא למלא את כל השדות הנדרשים (*)';
        errorEl.classList.add('show');
        return;
    }

    if (data.password.length < 6) {
        errorEl.textContent = 'הסיסמה חייבת להכיל לפחות 6 תווים.';
        errorEl.classList.add('show');
        return;
    }

    // Convert agentCodes comma-separated string to array
    if (data.agentCodes) {
        data.agentCodes = data.agentCodes.split(',').map(s => s.trim()).filter(Boolean);
    } else {
        data.agentCodes = [];
    }

    try {
        const res = await apiFetch('/admin/companies', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        const result = await res.json();

        if (!res.ok) {
            throw new Error(result.message);
        }

        closeAddModal();
        loadCompanies();
        alert(`החברה "${data.name}" נוצרה בהצלחה!\n\nשם משתמש: ${data.username}\nסיסמה: ${data.password}`);
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.add('show');
    }
}

// Toggle company active/inactive
async function toggleCompany(id, isActive) {
    const action = isActive ? 'להשבית' : 'להפעיל';
    if (!confirm(`האם אתה בטוח שברצונך ${action} את החברה?`)) return;

    try {
        if (isActive) {
            await apiFetch(`/admin/companies/${id}`, { method: 'DELETE' });
        } else {
            await apiFetch(`/admin/companies/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ isActive: true })
            });
        }
        loadCompanies();
    } catch (err) {
        console.error('Toggle company error:', err);
    }
}

// ==================== Company Detail Modal ====================
async function openCompanyDetail(companyId) {
    currentDetailCompanyId = companyId;
    const company = allCompanies.find(c => c._id === companyId);
    if (!company) return;

    document.getElementById('companyDetailTitle').textContent = company.name;
    document.getElementById('cdContact').value = company.contactPerson || '';
    document.getElementById('cdEmail').value = company.email || '';
    document.getElementById('cdPhone').value = company.phone || '';
    document.getElementById('cdPolicy').value = company.policyNumber || '';
    document.getElementById('cdAgentCodes').value = Array.isArray(company.agentCodes) ? company.agentCodes.join(', ') : '';
    document.getElementById('cdDashboardModules').value = company.dashboardModules || 'management';
    document.getElementById('companyUsersArea').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    document.getElementById('companyDetailModal').classList.add('show');

    // Load users
    try {
        const res = await apiFetch(`/admin/users?companyId=${companyId}`);
        if (!res.ok) throw new Error('שגיאה בטעינת משתמשים');
        const users = await res.json();
        renderCompanyUsers(users);
    } catch (err) {
        document.getElementById('companyUsersArea').innerHTML = '<p style="color:var(--danger);font-size:14px;">שגיאה בטעינת משתמשים.</p>';
    }
}

function closeCompanyDetail() {
    document.getElementById('companyDetailModal').classList.remove('show');
    currentDetailCompanyId = null;
}

async function saveCompanyDetails() {
    if (!currentDetailCompanyId) return;

    const contactPerson = document.getElementById('cdContact').value.trim();
    const email = document.getElementById('cdEmail').value.trim();
    const phone = document.getElementById('cdPhone').value.trim();
    const policyNumber = document.getElementById('cdPolicy').value.trim();
    const agentCodesStr = document.getElementById('cdAgentCodes').value.trim();
    const agentCodes = agentCodesStr ? agentCodesStr.split(',').map(s => s.trim()).filter(Boolean) : [];
    const dashboardModules = document.getElementById('cdDashboardModules').value;

    try {
        const res = await apiFetch(`/admin/companies/${currentDetailCompanyId}`, {
            method: 'PUT',
            body: JSON.stringify({ contactPerson, email, phone, policyNumber, agentCodes, dashboardModules })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message);

        // Update local data
        const idx = allCompanies.findIndex(c => c._id === currentDetailCompanyId);
        if (idx !== -1) {
            allCompanies[idx].contactPerson = contactPerson;
            allCompanies[idx].email = email;
            allCompanies[idx].phone = phone;
            allCompanies[idx].policyNumber = policyNumber;
            allCompanies[idx].agentCodes = agentCodes;
            allCompanies[idx].dashboardModules = dashboardModules;
            renderCompanies(allCompanies);
        }
        alert('פרטי החברה עודכנו בהצלחה!');
    } catch (err) {
        alert('שגיאה: ' + err.message);
    }
}

function renderCompanyUsers(users) {
    const area = document.getElementById('companyUsersArea');
    if (!users || users.length === 0) {
        area.innerHTML = '<p style="color:var(--gray-400);font-size:14px;text-align:center;padding:20px;">אין משתמשים לחברה זו.</p>';
        return;
    }

    area.innerHTML = `
        <table style="width:100%;">
            <thead>
                <tr>
                    <th>שם</th>
                    <th>שם משתמש</th>
                    <th>אימייל</th>
                    <th>התחברות אחרונה</th>
                    <th>סטטוס</th>
                    <th>פעולות</th>
                </tr>
            </thead>
            <tbody>
                ${users.map(u => `
                    <tr style="cursor:pointer;" onclick="openEditUserModal('${u._id}','${escapeHtml(u.name)}','${escapeHtml(u.username)}','${escapeHtml(u.email || '')}')">
                        <td><strong style="color:var(--primary);border-bottom:1px dashed var(--gray-300);">${escapeHtml(u.name)}</strong></td>
                        <td style="direction:ltr;text-align:right;">${escapeHtml(u.username)}</td>
                        <td>${escapeHtml(u.email || '-')}</td>
                        <td>${u.lastLogin ? new Date(u.lastLogin).toLocaleString('he-IL') : 'אף פעם'}</td>
                        <td><span class="badge ${u.isActive ? 'badge-active' : 'badge-cancelled'}">${u.isActive ? 'פעיל' : 'מושבת'}</span></td>
                        <td>
                            <div style="display:flex;gap:6px;" onclick="event.stopPropagation();">
                                <button class="btn btn-secondary btn-sm" onclick="resetUserPassword('${u._id}','${escapeHtml(u.name)}')" title="איפוס סיסמה" style="font-size:12px;padding:5px 10px;">
                                    🔑
                                </button>
                                <button class="btn btn-sm ${u.isActive ? 'btn-danger' : 'btn-success'}" onclick="toggleUser('${u._id}',${u.isActive})" style="font-size:12px;padding:5px 10px;">
                                    ${u.isActive ? 'השבת' : 'הפעל'}
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function openAddUserFromDetail() {
    if (!currentDetailCompanyId) return;
    const company = allCompanies.find(c => c._id === currentDetailCompanyId);
    openAddUserModal(currentDetailCompanyId, company ? company.name : '');
}

async function resetUserPassword(userId, userName) {
    const newPassword = prompt(`הכנס סיסמה חדשה עבור ${userName}:\n(לפחות 6 תווים)`);
    if (!newPassword) return;
    if (newPassword.length < 6) { alert('הסיסמה חייבת להכיל לפחות 6 תווים.'); return; }

    try {
        const res = await apiFetch('/admin/users', {
            method: 'PUT',
            body: JSON.stringify({ userId, password: newPassword })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message);
        alert(`הסיסמה שונתה בהצלחה!\n\nסיסמה חדשה: ${newPassword}`);
    } catch (err) {
        alert('שגיאה: ' + err.message);
    }
}

async function toggleUser(userId, isActive) {
    const action = isActive ? 'להשבית' : 'להפעיל';
    if (!confirm(`האם אתה בטוח שברצונך ${action} את המשתמש?`)) return;

    try {
        const res = await apiFetch('/admin/users', {
            method: 'PUT',
            body: JSON.stringify({ userId, isActive: !isActive })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message);
        // Reload users list
        if (currentDetailCompanyId) openCompanyDetail(currentDetailCompanyId);
    } catch (err) {
        alert('שגיאה: ' + err.message);
    }
}

// ==================== Add User Modal ====================
function openAddUserModal(companyId, companyName) {
    document.getElementById('addUserModal').classList.add('show');
    document.getElementById('addUserForm').reset();
    document.getElementById('addUserError').classList.remove('show');
    document.getElementById('addUserCompanyId').value = companyId;
    document.getElementById('addUserCompanyName').textContent = companyName;
}

function closeAddUserModal() {
    document.getElementById('addUserModal').classList.remove('show');
}

async function submitAddUser() {
    const form = document.getElementById('addUserForm');
    const errorEl = document.getElementById('addUserError');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    if (!data.name || !data.username || !data.password) {
        errorEl.textContent = 'נא למלא שם מלא, שם משתמש וסיסמה.';
        errorEl.classList.add('show');
        return;
    }

    if (data.password.length < 6) {
        errorEl.textContent = 'הסיסמה חייבת להכיל לפחות 6 תווים.';
        errorEl.classList.add('show');
        return;
    }

    try {
        const res = await apiFetch('/admin/users', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        const result = await res.json();

        if (!res.ok) {
            throw new Error(result.message);
        }

        closeAddUserModal();
        // Reload users in detail modal if open
        if (currentDetailCompanyId) openCompanyDetail(currentDetailCompanyId);
        alert(`המשתמש נוצר בהצלחה!\n\nשם: ${data.name}\nשם משתמש: ${data.username}\nסיסמה: ${data.password}`);
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.add('show');
    }
}

// ==================== Edit User Modal ====================
function openEditUserModal(userId, name, username, email) {
    document.getElementById('editUserModal').classList.add('show');
    document.getElementById('editUserId').value = userId;
    document.getElementById('editUserName').value = name;
    document.getElementById('editUserUsername').value = username;
    document.getElementById('editUserEmail').value = email;
    document.getElementById('editUserPassword').value = '';
    document.getElementById('editUserError').classList.remove('show');
}

function closeEditUserModal() {
    document.getElementById('editUserModal').classList.remove('show');
}

async function submitEditUser() {
    const errorEl = document.getElementById('editUserError');
    const userId = document.getElementById('editUserId').value;
    const name = document.getElementById('editUserName').value.trim();
    const email = document.getElementById('editUserEmail').value.trim();
    const password = document.getElementById('editUserPassword').value;

    if (!name) {
        errorEl.textContent = 'נא למלא שם מלא.';
        errorEl.classList.add('show');
        return;
    }

    if (password && password.length < 6) {
        errorEl.textContent = 'הסיסמה חייבת להכיל לפחות 6 תווים.';
        errorEl.classList.add('show');
        return;
    }

    const body = { userId, name, email };
    if (password) body.password = password;

    try {
        const res = await apiFetch('/admin/users', {
            method: 'PUT',
            body: JSON.stringify(body)
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message);

        closeEditUserModal();
        // Reload users in detail modal
        if (currentDetailCompanyId) openCompanyDetail(currentDetailCompanyId);
        alert('המשתמש עודכן בהצלחה!');
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.add('show');
    }
}

// Import CSV Modal
function openImportModal(companyId) {
    importCompanyId = companyId;
    document.getElementById('importModal').classList.add('show');
    document.getElementById('csvFile').value = '';
    document.getElementById('importError').classList.remove('show');
    document.getElementById('importResult').style.display = 'none';
}

function closeImportModal() {
    document.getElementById('importModal').classList.remove('show');
    importCompanyId = null;
}

async function submitImport() {
    const fileInput = document.getElementById('csvFile');
    const errorEl = document.getElementById('importError');
    const resultEl = document.getElementById('importResult');
    const btn = document.getElementById('importBtn');

    if (!fileInput.files[0]) {
        errorEl.textContent = 'נא לבחור קובץ CSV.';
        errorEl.classList.add('show');
        return;
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    btn.disabled = true;
    btn.textContent = 'מייבא...';
    errorEl.classList.remove('show');

    try {
        const token = getToken();
        const res = await fetch(`/api/import/${importCompanyId}/trips`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        const data = await res.json();

        if (!res.ok) throw new Error(data.message);

        resultEl.textContent = data.message;
        resultEl.style.display = 'block';
        loadCompanies();
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.add('show');
    } finally {
        btn.disabled = false;
        btn.textContent = 'ייבוא';
    }
}
