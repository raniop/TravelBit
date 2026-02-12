// Companies Management JS
let allCompanies = [];
let importCompanyId = null;
let currentDetailCompanyId = null;
const cachedPasswords = {}; // userId → password (kept in memory for sending credentials)

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
                    <button class="btn btn-sm btn-danger" onclick="deleteCompany('${c._id}')" title="מחיקת חברה" style="background:#dc2626;padding:5px 8px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
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
    document.getElementById('addInsurancePagesWrap').style.display = 'none';
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

    // dashboardModules from checkboxes
    const form2 = document.getElementById('addCompanyForm');
    data.dashboardModules = {
        management: form2.querySelector('[name="addModManagement"]').checked,
        insurance: form2.querySelector('[name="addModInsurance"]').checked,
        reminders: form2.querySelector('[name="addModReminders"]').checked,
        yeadim: form2.querySelector('[name="addModYeadim"]').checked
    };
    // Insurance pages checkboxes
    data.insurancePages = {
        dashboard: form2.querySelector('[name="ipDashboard"]').checked,
        policies: form2.querySelector('[name="ipPolicies"]').checked,
        agents: form2.querySelector('[name="ipAgents"]').checked,
        reports: form2.querySelector('[name="ipReports"]').checked
    };
    // Reminder pages checkboxes
    data.reminderPages = {
        agentAppointment: form2.querySelector('[name="rpAgentAppointment"]').checked,
        policyCancellations: form2.querySelector('[name="rpPolicyCancellations"]').checked,
        newProductions: form2.querySelector('[name="rpNewProductions"]').checked,
        claims: form2.querySelector('[name="rpClaims"]').checked,
        firstDeposit: form2.querySelector('[name="rpFirstDeposit"]').checked,
        completingDeficiencies: form2.querySelector('[name="rpCompletingDeficiencies"]').checked
    };
    // Remove checkbox fields from data (they came as 'on' strings)
    delete data.ipDashboard; delete data.ipPolicies; delete data.ipAgents; delete data.ipReports;
    delete data.addModManagement; delete data.addModInsurance; delete data.addModReminders; delete data.addModYeadim;
    delete data.rpAgentAppointment; delete data.rpPolicyCancellations; delete data.rpNewProductions;
    delete data.rpClaims; delete data.rpFirstDeposit; delete data.rpCompletingDeficiencies;

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
        if (result.user && result.user.id) cachedPasswords[result.user.id] = data.password;
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

// Delete company permanently
async function deleteCompany(id) {
    const company = allCompanies.find(c => c._id === id);
    const name = company ? company.name : id;
    if (!confirm(`האם אתה בטוח שברצונך למחוק את החברה "${name}"?\n\nפעולה זו תמחק לצמיתות את החברה, כל המשתמשים, העובדים, הנסיעות והפוליסות שלה.`)) return;
    if (!confirm(`אישור סופי: למחוק את "${name}" לצמיתות?\n\nלא ניתן לשחזר את הנתונים!`)) return;

    try {
        const res = await apiFetch(`/admin/companies/${id}?permanent=true`, { method: 'DELETE' });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message);
        alert(result.message);
        loadCompanies();
        // Close detail modal if open for this company
        if (currentDetailCompanyId === id) closeCompanyDetail();
    } catch (err) {
        alert('שגיאה: ' + err.message);
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
    document.getElementById('cdSlug').value = company.slug || '';
    document.getElementById('cdSlugPreview').textContent = company.slug || '...';
    // dashboardModules checkboxes — normalize old string format
    const dm = normalizeDM(company.dashboardModules);
    document.getElementById('cdModManagement').checked = dm.management;
    document.getElementById('cdModInsurance').checked = dm.insurance;
    document.getElementById('cdModReminders').checked = dm.reminders;
    document.getElementById('cdModYeadim').checked = dm.yeadim;
    // Insurance pages checkboxes
    const ip = company.insurancePages || { dashboard: true, policies: true, agents: true, reports: true };
    document.getElementById('cdIpDashboard').checked = ip.dashboard !== false;
    document.getElementById('cdIpPolicies').checked = ip.policies !== false;
    document.getElementById('cdIpAgents').checked = ip.agents !== false;
    document.getElementById('cdIpReports').checked = ip.reports !== false;
    // Reminder pages checkboxes
    const rp = company.reminderPages || { agentAppointment: true, policyCancellations: true, newProductions: true, claims: true, firstDeposit: true, completingDeficiencies: true };
    document.getElementById('cdRpAgentAppointment').checked = rp.agentAppointment !== false;
    document.getElementById('cdRpPolicyCancellations').checked = rp.policyCancellations !== false;
    document.getElementById('cdRpNewProductions').checked = rp.newProductions !== false;
    document.getElementById('cdRpClaims').checked = rp.claims !== false;
    document.getElementById('cdRpFirstDeposit').checked = rp.firstDeposit !== false;
    document.getElementById('cdRpCompletingDeficiencies').checked = rp.completingDeficiencies !== false;
    toggleDetailSubPages();
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
    const slug = document.getElementById('cdSlug').value.trim();
    const agentCodesStr = document.getElementById('cdAgentCodes').value.trim();
    const agentCodes = agentCodesStr ? agentCodesStr.split(',').map(s => s.trim()).filter(Boolean) : [];
    const dashboardModules = {
        management: document.getElementById('cdModManagement').checked,
        insurance: document.getElementById('cdModInsurance').checked,
        reminders: document.getElementById('cdModReminders').checked,
        yeadim: document.getElementById('cdModYeadim').checked
    };
    const insurancePages = {
        dashboard: document.getElementById('cdIpDashboard').checked,
        policies: document.getElementById('cdIpPolicies').checked,
        agents: document.getElementById('cdIpAgents').checked,
        reports: document.getElementById('cdIpReports').checked
    };
    const reminderPages = {
        agentAppointment: document.getElementById('cdRpAgentAppointment').checked,
        policyCancellations: document.getElementById('cdRpPolicyCancellations').checked,
        newProductions: document.getElementById('cdRpNewProductions').checked,
        claims: document.getElementById('cdRpClaims').checked,
        firstDeposit: document.getElementById('cdRpFirstDeposit').checked,
        completingDeficiencies: document.getElementById('cdRpCompletingDeficiencies').checked
    };

    try {
        const res = await apiFetch(`/admin/companies/${currentDetailCompanyId}`, {
            method: 'PUT',
            body: JSON.stringify({ contactPerson, email, phone, policyNumber, agentCodes, slug, dashboardModules, insurancePages, reminderPages })
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
            allCompanies[idx].slug = slug;
            allCompanies[idx].dashboardModules = dashboardModules;
            allCompanies[idx].insurancePages = insurancePages;
            allCompanies[idx].reminderPages = reminderPages;
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
                    <th>טלפון</th>
                    <th>התחברות אחרונה</th>
                    <th>סטטוס</th>
                    <th>פעולות</th>
                </tr>
            </thead>
            <tbody>
                ${users.map(u => `
                    <tr style="cursor:pointer;" onclick="openEditUserModal('${u._id}','${escapeHtml(u.name)}','${escapeHtml(u.username)}','${escapeHtml(u.email || '')}','${escapeHtml(u.phone || '')}')">
                        <td><strong style="color:var(--primary);border-bottom:1px dashed var(--gray-300);">${escapeHtml(u.name)}</strong></td>
                        <td style="direction:ltr;text-align:right;">${escapeHtml(u.username)}</td>
                        <td style="direction:ltr;text-align:right;">${escapeHtml(u.phone || '-')}</td>
                        <td>${u.lastLogin ? new Date(u.lastLogin).toLocaleString('he-IL') : 'אף פעם'}</td>
                        <td><span class="badge ${u.isActive ? 'badge-active' : 'badge-cancelled'}">${u.isActive ? 'פעיל' : 'מושבת'}</span></td>
                        <td>
                            <div style="display:flex;gap:4px;flex-wrap:nowrap;" onclick="event.stopPropagation();">
                                <button class="btn btn-sm" onclick="sendCredentials('${u._id}','${escapeHtml(u.name)}','${escapeHtml(u.username)}','${escapeHtml(u.phone || '')}','${escapeHtml(u.email || '')}','whatsapp')" title="שלח פרטי גישה בוואטסאפ" style="font-size:12px;padding:5px 10px;background:#25D366;color:#fff;border:none;">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                </button>
                                <button class="btn btn-sm" onclick="sendCredentials('${u._id}','${escapeHtml(u.name)}','${escapeHtml(u.username)}','${escapeHtml(u.phone || '')}','${escapeHtml(u.email || '')}','email')" title="שלח פרטי גישה במייל" style="font-size:12px;padding:5px 10px;background:#4A90D9;color:#fff;border:none;">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 4l-10 8L2 4"/></svg>
                                </button>
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
        cachedPasswords[userId] = newPassword;
        alert(`הסיסמה שונתה בהצלחה!\n\nסיסמה חדשה: ${newPassword}`);
    } catch (err) {
        alert('שגיאה: ' + err.message);
    }
}

// ==================== Send Credentials (WhatsApp / Email) ====================
async function sendCredentials(userId, userName, username, phone, email, method) {
    // Validate contact info
    if (method === 'whatsapp' && !phone) {
        alert('למשתמש זה לא הוגדר מספר טלפון.\nנא לערוך את המשתמש ולהוסיף טלפון.');
        return;
    }
    if (method === 'email' && !email) {
        alert('למשתמש זה לא הוגדרה כתובת מייל.\nנא לערוך את המשתמש ולהוסיף מייל.');
        return;
    }

    let password = cachedPasswords[userId];

    if (!password) {
        // No cached password — ask admin to set one
        password = prompt(`אין סיסמה שמורה עבור ${userName}.\nהזן סיסמה חדשה לשליחה:\n(לפחות 6 תווים)\n\nהסיסמה תעודכן במערכת ותישלח למשתמש.`);
        if (!password) return;
        if (password.length < 6) { alert('הסיסמה חייבת להכיל לפחות 6 תווים.'); return; }

        // Update password in system
        try {
            const res = await apiFetch('/admin/users', {
                method: 'PUT',
                body: JSON.stringify({ userId, password })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message);
            cachedPasswords[userId] = password;
        } catch (err) {
            alert('שגיאה בעדכון הסיסמה: ' + err.message);
            return;
        }
    }

    // Build message
    const loginUrl = 'https://travelins.co.il/dashboard';
    const message = `שלום ${userName},\n\nפרטי הגישה שלך למערכת Travelins:\n\nקישור: ${loginUrl}\nשם משתמש: ${username}\nסיסמה: ${password}\n\nבהצלחה!`;

    if (method === 'whatsapp') {
        let waPhone = phone.replace(/[-\s]/g, '');
        if (waPhone.startsWith('0')) waPhone = '972' + waPhone.slice(1);
        const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank');
    } else if (method === 'email') {
        const subject = 'פרטי גישה למערכת Travelins';
        const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
        window.open(mailtoUrl, '_blank');
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
        if (result.user && result.user.id) cachedPasswords[result.user.id] = data.password;
        // Reload users in detail modal if open
        if (currentDetailCompanyId) openCompanyDetail(currentDetailCompanyId);
        alert(`המשתמש נוצר בהצלחה!\n\nשם: ${data.name}\nשם משתמש: ${data.username}\nסיסמה: ${data.password}`);
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.add('show');
    }
}

// ==================== Edit User Modal ====================
function openEditUserModal(userId, name, username, email, phone) {
    document.getElementById('editUserModal').classList.add('show');
    document.getElementById('editUserId').value = userId;
    document.getElementById('editUserName').value = name;
    document.getElementById('editUserUsername').value = username;
    document.getElementById('editUserEmail').value = email;
    document.getElementById('editUserPhone').value = phone || '';
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
    const phone = document.getElementById('editUserPhone').value.trim();
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

    const body = { userId, name, email, phone };
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

// Normalize dashboardModules (backward compat: string → object)
function normalizeDM(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return { management: raw.management !== false, insurance: raw.insurance === true, reminders: raw.reminders === true, yeadim: raw.yeadim === true };
    }
    if (raw === 'insurance') return { management: false, insurance: true, reminders: false, yeadim: false };
    if (raw === 'both') return { management: true, insurance: true, reminders: false, yeadim: false };
    return { management: true, insurance: false, reminders: false, yeadim: false };
}

// Toggle sub-page checkboxes visibility in Add Company form
function toggleAddSubPages() {
    const form = document.getElementById('addCompanyForm');
    const insWrap = document.getElementById('addInsurancePagesWrap');
    const remWrap = document.getElementById('addReminderPagesWrap');
    if (insWrap) insWrap.style.display = form.querySelector('[name="addModInsurance"]').checked ? '' : 'none';
    if (remWrap) remWrap.style.display = form.querySelector('[name="addModReminders"]').checked ? '' : 'none';
}

// Toggle sub-page checkboxes visibility in Detail modal
function toggleDetailSubPages() {
    const insWrap = document.getElementById('cdInsurancePagesWrap');
    const remWrap = document.getElementById('cdReminderPagesWrap');
    if (insWrap) insWrap.style.display = document.getElementById('cdModInsurance').checked ? '' : 'none';
    if (remWrap) remWrap.style.display = document.getElementById('cdModReminders').checked ? '' : 'none';
}

// Attach onchange to detail modal checkboxes
document.addEventListener('DOMContentLoaded', () => {
    const modIns = document.getElementById('cdModInsurance');
    const modRem = document.getElementById('cdModReminders');
    if (modIns) modIns.addEventListener('change', toggleDetailSubPages);
    if (modRem) modRem.addEventListener('change', toggleDetailSubPages);
});
