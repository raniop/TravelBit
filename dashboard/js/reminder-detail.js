// Reminder Detail Page — Table + CRUD Logic
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

let currentType = null;
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

    // Get type from URL
    const params = new URLSearchParams(window.location.search);
    currentType = params.get('type');

    if (!currentType || !REMINDER_TYPES[currentType]) {
        window.location.href = '/dashboard/reminders.html';
        return;
    }

    // Set page title
    const typeLabel = REMINDER_TYPES[currentType];
    document.title = `Travelins | ${typeLabel}`;
    document.getElementById('pageTitle').textContent = typeLabel;
    document.getElementById('tableTitle').textContent = typeLabel;
    document.getElementById('formType').value = currentType;

    // Highlight active sidebar link
    const activeLink = document.querySelector(`.sidebar-nav a[href*="type=${currentType}"]`);
    if (activeLink) activeLink.classList.add('active');

    // Load reminders
    await loadReminders();

    // Setup email drop zone
    setupEmailDropZone();

    // Setup date auto-format (DD/MM/YYYY)
    setupDateAutoFormat();

    // Check if coming from email drop
    const fromEmail = params.get('fromEmail');
    if (fromEmail) {
        const emailDraft = sessionStorage.getItem('emailDraft');
        if (emailDraft) {
            sessionStorage.removeItem('emailDraft');
            try {
                const data = JSON.parse(emailDraft);
                openAddModalWithData(data);
            } catch(_) {
                openAddModal();
            }
        }
    }
})();

async function loadReminders() {
    console.log('[loadReminders] Loading type:', currentType);
    try {
        const res = await apiFetch(`/dashboard/reminders?type=${currentType}`);
        console.log('[loadReminders] Response:', res ? `status=${res.status} ok=${res.ok}` : 'null');
        if (!res || !res.ok) throw new Error('Failed to load');
        const data = await res.json();
        console.log('[loadReminders] Got', (data.reminders || []).length, 'reminders');

        allReminders = data.reminders || [];
        agentCodes = data.agentCodes || [];

        populateAgentDropdowns();
        renderTable();
    } catch (err) {
        console.error('[loadReminders] Error:', err);
        document.getElementById('remindersBody').innerHTML =
            '<tr><td colspan="11" style="text-align:center; padding:40px; color:var(--gray-400);">שגיאה בטעינת תזכורות</td></tr>';
    }
}

function populateAgentDropdowns() {
    // Agent dropdowns removed from UI — keep function as no-op for compatibility
}

function getFilteredReminders() {
    let list = allReminders;

    const status = document.getElementById('filterStatus')?.value;
    if (status) list = list.filter(r => r.status === status);

    return list;
}

function renderTable() {
    const filtered = getFilteredReminders();
    const tbody = document.getElementById('remindersBody');
    const countEl = document.getElementById('totalCount');

    if (countEl) countEl.textContent = filtered.length;

    if (!filtered.length) {
        tbody.innerHTML = `
            <tr><td colspan="10">
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
                    <p>אין תזכורות מסוג זה</p>
                </div>
            </td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(r => {
        const dateStr = r.date ? isoToIL(r.date.substring(0, 10)) : '-';
        const amountStr = r.amount ? r.amount.toLocaleString('he-IL') : '-';
        const statusClass = `status-${r.status || 'open'}`;
        const statusLabel = STATUS_LABELS[r.status] || 'פתוח';

        return `<tr>
            <td><strong>${escHtml(r.customerName || '-')}</strong></td>
            <td>${escHtml(r.idNumber || '-')}</td>
            <td>${escHtml(r.phone || '-')}</td>
            <td>${escHtml(r.policyNumber || '-')}</td>
            <td>${escHtml(r.insuranceCompany || '-')}</td>
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
document.getElementById('filterStatus')?.addEventListener('change', renderTable);

// ===== Modal =====
function openAddModal() {
    document.getElementById('editId').value = '';
    document.getElementById('modalTitle').textContent = 'הוסף תזכורת';
    document.getElementById('formStatusRow').style.display = 'none';

    // Clear form
    document.getElementById('formCustomerName').value = '';
    document.getElementById('formIdNumber').value = '';
    document.getElementById('formPhone').value = '';
    document.getElementById('formPolicyNumber').value = '';
    document.getElementById('formInsuranceCompany').value = '';
    document.getElementById('formDate').value = '';
    document.getElementById('formAmount').value = '';
    document.getElementById('formNotes').value = '';
    document.getElementById('formStatus').value = 'open';

    document.getElementById('reminderModal').classList.add('show');
}

function openAddModalWithData(data) {
    openAddModal();

    // Map of data fields to form element IDs
    const fieldMap = {
        customerName: 'formCustomerName',
        idNumber: 'formIdNumber',
        phone: 'formPhone',
        policyNumber: 'formPolicyNumber',
        insuranceCompany: 'formInsuranceCompany',
        date: 'formDate',
        amount: 'formAmount',
        notes: 'formNotes'
    };

    let filledCount = 0;

    // Pre-fill all available fields
    for (const [key, elId] of Object.entries(fieldMap)) {
        if (data[key]) {
            const el = document.getElementById(elId);
            if (el) {
                el.value = data[key];
                // Mark as auto-filled with visual feedback
                if (data._extractedFields && data._extractedFields.includes(key)) {
                    markAutoFilled(elId);
                    filledCount++;
                }
            }
        }
    }

    // Auto-fill today's date if not already filled from email
    if (!data.date) {
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const todayStr = `${day}/${month}/${year}`;
        const dateEl = document.getElementById('formDate');
        if (dateEl && !dateEl.value) {
            dateEl.value = todayStr;
            markAutoFilled('formDate');
            filledCount++;
        }
    }

    // Show toast with count of auto-filled fields
    if (filledCount > 0) {
        showExtractionToast(filledCount);
    }
}

function openEditModal(id) {
    const r = allReminders.find(x => x._id === id);
    if (!r) return;

    document.getElementById('editId').value = r._id;
    document.getElementById('modalTitle').textContent = 'ערוך תזכורת';
    document.getElementById('formStatusRow').style.display = 'block';

    document.getElementById('formCustomerName').value = r.customerName || '';
    document.getElementById('formIdNumber').value = r.idNumber || '';
    document.getElementById('formPhone').value = r.phone || '';
    document.getElementById('formPolicyNumber').value = r.policyNumber || '';
    document.getElementById('formInsuranceCompany').value = r.insuranceCompany || '';
    document.getElementById('formDate').value = r.date ? isoToIL(r.date.substring(0, 10)) : '';
    document.getElementById('formAmount').value = r.amount || '';
    document.getElementById('formNotes').value = r.notes || '';
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
        type: currentType,
        customerName: document.getElementById('formCustomerName').value.trim(),
        idNumber: document.getElementById('formIdNumber').value.trim(),
        phone: document.getElementById('formPhone').value.trim(),
        policyNumber: document.getElementById('formPolicyNumber').value.trim(),
        insuranceCompany: document.getElementById('formInsuranceCompany').value.trim(),
        date: ilToIso(document.getElementById('formDate').value) || null,
        amount: document.getElementById('formAmount').value || 0,
        notes: document.getElementById('formNotes').value.trim()
    };

    if (isEdit) {
        body.status = document.getElementById('formStatus').value;
    }

    console.log('[saveReminder] isEdit:', isEdit, 'editId:', editId);
    console.log('[saveReminder] body:', JSON.stringify(body, null, 2));
    console.log('[saveReminder] currentType:', currentType);

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

        console.log('[saveReminder] Sending', method, 'to', url);

        const res = await apiFetch(url, {
            method,
            body: JSON.stringify(body)
        });

        console.log('[saveReminder] Response:', res ? `status=${res.status} ok=${res.ok}` : 'null (possibly logged out)');

        if (!res || !res.ok) {
            const data = await res.json().catch(() => ({}));
            console.error('[saveReminder] Error response data:', data);
            throw new Error(data.message || 'שגיאה בשמירה');
        }

        const result = await res.json();
        console.log('[saveReminder] Success:', result);

        closeModal();
        await loadReminders();
    } catch (err) {
        console.error('[saveReminder] Catch error:', err);
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

// ===== Email Drop Zone =====
function setupEmailDropZone() {
    const zone = document.getElementById('emailDropZone');
    if (!zone) return;

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('drag-over');
    });

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('drag-over');
        handleEmailDrop(e);
    });
}

async function handleEmailDrop(e) {
    console.log('[handleEmailDrop] Drop event received');
    console.log('[handleEmailDrop] types:', Array.from(e.dataTransfer.types));
    console.log('[handleEmailDrop] files count:', e.dataTransfer.files ? e.dataTransfer.files.length : 0);

    // 1. Try to get files (.eml / .msg from Outlook Desktop)
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
        const file = files[0];
        console.log('[handleEmailDrop] File:', file.name, 'type:', file.type, 'size:', file.size);
        // Read file content and extract data
        const emailData = await readEmailFile(file);
        console.log('[handleEmailDrop] Extracted data:', emailData);
        console.log('[handleEmailDrop] Extracted fields:', emailData._extractedFields);
        openAddModalWithData(emailData);
        return;
    }

    // 2. Try to get text (from Gmail / Outlook Web)
    const text = e.dataTransfer.getData('text/plain') || '';
    const html = e.dataTransfer.getData('text/html') || '';
    console.log('[handleEmailDrop] text length:', text.length, 'html length:', html.length);
    if (text) console.log('[handleEmailDrop] text preview:', text.substring(0, 200));

    if (text || html) {
        const extracted = extractEmailDataEnhanced(text, html);
        console.log('[handleEmailDrop] Extracted from text:', extracted);
        openAddModalWithData(extracted);
        return;
    }

    // 3. Fallback: open empty modal
    console.log('[handleEmailDrop] No data found, opening empty modal');
    openAddModal();
}

// ===== Date Auto-Format (DD/MM/YYYY) =====
function setupDateAutoFormat() {
    const dateInput = document.getElementById('formDate');
    if (!dateInput) return;

    dateInput.addEventListener('input', function(e) {
        // Get only digits from current value
        let digits = this.value.replace(/\D/g, '');

        // Limit to 8 digits (DDMMYYYY)
        if (digits.length > 8) digits = digits.substring(0, 8);

        // Auto-insert slashes
        let formatted = '';
        if (digits.length > 0) {
            formatted = digits.substring(0, Math.min(2, digits.length));
        }
        if (digits.length > 2) {
            formatted += '/' + digits.substring(2, Math.min(4, digits.length));
        }
        if (digits.length > 4) {
            formatted += '/' + digits.substring(4, 8);
        }

        // Only update if different (prevent cursor jump on no change)
        if (this.value !== formatted) {
            this.value = formatted;
        }
    });

    // Allow keyboard navigation and special keys
    dateInput.addEventListener('keydown', function(e) {
        // Allow: backspace, delete, tab, escape, enter, arrows
        if ([8, 46, 9, 27, 13, 37, 38, 39, 40].includes(e.keyCode)) return;
        // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
        if ((e.ctrlKey || e.metaKey) && [65, 67, 86, 88].includes(e.keyCode)) return;
        // Block non-digit characters
        if (!/^\d$/.test(e.key)) {
            // Allow slash (user might type it manually)
            if (e.key !== '/') e.preventDefault();
        }
    });
}
