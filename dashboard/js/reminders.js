// Reminders Page Logic
const REMINDER_TYPES = {
    agentAppointment: 'מינוי סוכן',
    policyCancellations: 'ביטולי פוליסות',
    newProductions: 'הפקות חדשות',
    claims: 'תביעות',
    firstDeposit: 'הפקדה ראשונה שבוצעה',
    completingDeficiencies: 'השלמת חוסרים'
};

const STATUS_LABELS = {
    open: 'פתוח',
    inProgress: 'בטיפול',
    completed: 'הושלם',
    cancelled: 'בוטל'
};

let currentType = null; // null = all
let allReminders = [];
let agentCodes = [];

// Init
(async function() {
    const user = getUser();
    if (!user) return;

    // Set company name + user info
    const companyEl = document.getElementById('companyName');
    const userNameEl = document.getElementById('userName');
    const avatarEl = document.getElementById('userAvatar');
    if (companyEl && user.companyName) companyEl.textContent = user.companyName;
    if (userNameEl && user.name) userNameEl.textContent = user.name;
    if (avatarEl && user.name) avatarEl.textContent = user.name.charAt(0);

    // Build tabs based on reminderPages
    buildTabs(user);

    // Load reminders
    await loadReminders();
})();

function buildTabs(user) {
    const rp = user.reminderPages || {};
    const tabsEl = document.getElementById('reminderTabs');
    if (!tabsEl) return;

    // "All" tab
    let html = `<button class="reminder-tab active" data-type="" onclick="switchTab(this, '')">הכל</button>`;

    for (const [key, label] of Object.entries(REMINDER_TYPES)) {
        if (rp[key] === false) continue; // hidden page
        html += `<button class="reminder-tab" data-type="${key}" onclick="switchTab(this, '${key}')">${label}</button>`;
    }

    tabsEl.innerHTML = html;

    // Also update form type dropdown — remove hidden types
    const formType = document.getElementById('formType');
    if (formType) {
        Array.from(formType.options).forEach(opt => {
            if (rp[opt.value] === false) opt.remove();
        });
    }
}

function switchTab(btn, type) {
    document.querySelectorAll('.reminder-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    currentType = type || null;
    renderTable();
}

async function loadReminders() {
    try {
        let url = '/dashboard/reminders';
        const params = [];
        if (currentType) params.push(`type=${currentType}`);
        if (params.length) url += '?' + params.join('&');

        const res = await apiFetch(url);
        if (!res || !res.ok) throw new Error('Failed to load');
        const data = await res.json();

        allReminders = data.reminders || [];
        agentCodes = data.agentCodes || [];

        // Populate agent filter dropdown
        populateAgentDropdowns();

        renderTable();
    } catch (err) {
        console.error('Load reminders error:', err);
        document.getElementById('remindersBody').innerHTML =
            '<tr><td colspan="11" style="text-align:center; padding:40px; color:var(--gray-400);">שגיאה בטעינת תזכורות</td></tr>';
    }
}

function populateAgentDropdowns() {
    const filterAgent = document.getElementById('filterAgent');
    const formAgent = document.getElementById('formAgentCode');

    if (filterAgent) {
        filterAgent.innerHTML = '<option value="">הכל</option>';
        agentCodes.forEach(code => {
            filterAgent.innerHTML += `<option value="${code}">${code}</option>`;
        });
    }
    if (formAgent) {
        formAgent.innerHTML = '<option value="">ללא</option>';
        agentCodes.forEach(code => {
            formAgent.innerHTML += `<option value="${code}">${code}</option>`;
        });
    }
}

function getFilteredReminders() {
    let list = allReminders;
    if (currentType) list = list.filter(r => r.type === currentType);

    const agent = document.getElementById('filterAgent')?.value;
    if (agent) list = list.filter(r => r.agentCode === agent);

    const status = document.getElementById('filterStatus')?.value;
    if (status) list = list.filter(r => r.status === status);

    return list;
}

function renderTable() {
    const filtered = getFilteredReminders();
    const tbody = document.getElementById('remindersBody');
    const countEl = document.getElementById('totalCount');
    const titleEl = document.getElementById('tableTitle');

    if (countEl) countEl.textContent = filtered.length;
    if (titleEl) {
        titleEl.textContent = currentType ? REMINDER_TYPES[currentType] : 'כל התזכורות';
    }

    // Update tab counts
    document.querySelectorAll('.reminder-tab').forEach(tab => {
        const type = tab.dataset.type;
        let count;
        if (!type) {
            count = allReminders.length;
        } else {
            count = allReminders.filter(r => r.type === type).length;
        }
        let existingCount = tab.querySelector('.tab-count');
        if (existingCount) existingCount.textContent = count;
        else {
            const span = document.createElement('span');
            span.className = 'tab-count';
            span.textContent = count;
            tab.appendChild(span);
        }
    });

    if (!filtered.length) {
        tbody.innerHTML = `
            <tr><td colspan="11">
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
                    <p>אין תזכורות${currentType ? ' מסוג זה' : ''}</p>
                </div>
            </td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(r => {
        const dateStr = r.date ? new Date(r.date).toLocaleDateString('he-IL') : '-';
        const amountStr = r.amount ? r.amount.toLocaleString('he-IL') : '-';
        const statusClass = `status-${r.status || 'open'}`;
        const statusLabel = STATUS_LABELS[r.status] || 'פתוח';
        const typeLabel = REMINDER_TYPES[r.type] || r.type;

        return `<tr>
            <td><strong>${escHtml(r.customerName || '-')}</strong></td>
            <td>${escHtml(r.idNumber || '-')}</td>
            <td>${escHtml(r.phone || '-')}</td>
            <td>${escHtml(r.policyNumber || '-')}</td>
            <td>${escHtml(r.insuranceCompany || '-')}</td>
            <td>${escHtml(r.agentCode || '-')}</td>
            <td>${dateStr}</td>
            <td>${amountStr}</td>
            <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
            <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(r.notes || '')}">${escHtml(r.notes || '-')}</td>
            <td style="white-space:nowrap;">
                <button class="action-btn edit" title="ערוך" onclick="openEditModal('${r._id}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="action-btn delete" title="מחק" onclick="deleteReminder('${r._id}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                </button>
            </td>
        </tr>`;
    }).join('');
}

function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Filter change handlers
document.getElementById('filterAgent')?.addEventListener('change', renderTable);
document.getElementById('filterStatus')?.addEventListener('change', renderTable);

// ===== Modal =====
function openAddModal() {
    document.getElementById('editId').value = '';
    document.getElementById('modalTitle').textContent = 'הוסף תזכורת';
    document.getElementById('formStatusRow').style.display = 'none';

    // Set type to current tab type
    const formType = document.getElementById('formType');
    if (currentType && formType) {
        formType.value = currentType;
    }

    // Clear form
    document.getElementById('formCustomerName').value = '';
    document.getElementById('formIdNumber').value = '';
    document.getElementById('formPhone').value = '';
    document.getElementById('formPolicyNumber').value = '';
    document.getElementById('formInsuranceCompany').value = '';
    document.getElementById('formDate').value = '';
    document.getElementById('formAmount').value = '';
    document.getElementById('formNotes').value = '';
    document.getElementById('formAgentCode').value = '';
    document.getElementById('formStatus').value = 'open';

    document.getElementById('reminderModal').classList.add('show');
}

function openEditModal(id) {
    const r = allReminders.find(x => x._id === id);
    if (!r) return;

    document.getElementById('editId').value = r._id;
    document.getElementById('modalTitle').textContent = 'ערוך תזכורת';
    document.getElementById('formStatusRow').style.display = 'block';

    document.getElementById('formType').value = r.type;
    document.getElementById('formCustomerName').value = r.customerName || '';
    document.getElementById('formIdNumber').value = r.idNumber || '';
    document.getElementById('formPhone').value = r.phone || '';
    document.getElementById('formPolicyNumber').value = r.policyNumber || '';
    document.getElementById('formInsuranceCompany').value = r.insuranceCompany || '';
    document.getElementById('formDate').value = r.date ? r.date.substring(0, 10) : '';
    document.getElementById('formAmount').value = r.amount || '';
    document.getElementById('formNotes').value = r.notes || '';
    document.getElementById('formAgentCode').value = r.agentCode || '';
    document.getElementById('formStatus').value = r.status || 'open';

    document.getElementById('reminderModal').classList.add('show');
}

function closeModal() {
    document.getElementById('reminderModal').classList.remove('show');
}

async function saveReminder() {
    const editId = document.getElementById('editId').value;
    const isEdit = !!editId;

    const body = {
        type: document.getElementById('formType').value,
        customerName: document.getElementById('formCustomerName').value.trim(),
        idNumber: document.getElementById('formIdNumber').value.trim(),
        phone: document.getElementById('formPhone').value.trim(),
        policyNumber: document.getElementById('formPolicyNumber').value.trim(),
        insuranceCompany: document.getElementById('formInsuranceCompany').value.trim(),
        date: document.getElementById('formDate').value || null,
        amount: document.getElementById('formAmount').value || 0,
        notes: document.getElementById('formNotes').value.trim(),
        agentCode: document.getElementById('formAgentCode').value
    };

    if (isEdit) {
        body.status = document.getElementById('formStatus').value;
    }

    const saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'שומר...';

    try {
        let url = '/dashboard/reminders';
        let method = 'POST';
        if (isEdit) {
            url = `/dashboard/reminders/${editId}`;
            method = 'PUT';
        }

        const res = await apiFetch(url, {
            method,
            body: JSON.stringify(body)
        });

        if (!res || !res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.message || 'שגיאה בשמירה');
        }

        closeModal();
        await loadReminders();
    } catch (err) {
        alert(err.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'שמור';
    }
}

async function deleteReminder(id) {
    if (!confirm('האם למחוק תזכורת זו?')) return;

    try {
        const res = await apiFetch(`/dashboard/reminders/${id}`, { method: 'DELETE' });
        if (!res || !res.ok) throw new Error('שגיאה במחיקה');
        await loadReminders();
    } catch (err) {
        alert(err.message);
    }
}
