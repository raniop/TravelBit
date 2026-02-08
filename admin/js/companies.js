// Companies Management JS
let allCompanies = [];
let importCompanyId = null;

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
            <td><strong>${escapeHtml(c.name)}</strong></td>
            <td>${escapeHtml(c.contactPerson)}</td>
            <td>${escapeHtml(c.email)}</td>
            <td>${escapeHtml(c.phone || '-')}</td>
            <td>${c.employeeCount || 0}</td>
            <td>${c.totalTrips || 0}</td>
            <td><span class="badge ${c.isActive ? 'badge-active' : 'badge-cancelled'}">${c.isActive ? 'פעיל' : 'מושבת'}</span></td>
            <td>
                <div style="display:flex; gap:6px;">
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
