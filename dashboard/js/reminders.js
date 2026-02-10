// Reminders Dashboard — Card Grid Logic
const REMINDER_TYPES = {
    agentAppointment: 'מינוי סוכן',
    policyCancellations: 'ביטולי פוליסות',
    newProductions: 'הפקות חדשות',
    claims: 'תביעות',
    firstDeposit: 'הפקדה ראשונה שבוצעה',
    completingDeficiencies: 'השלמת חוסרים'
};

const CARD_ICONS = {
    agentAppointment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
    policyCancellations: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    newProductions: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
    claims: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    firstDeposit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
    completingDeficiencies: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
};

let allReminders = [];

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

    // Load all reminders
    await loadAllReminders();

    // Setup email drop zone
    setupEmailDropZone();
})();

async function loadAllReminders() {
    try {
        const res = await apiFetch('/dashboard/reminders');
        if (!res || !res.ok) throw new Error('Failed to load');
        const data = await res.json();
        allReminders = data.reminders || [];
        renderDashboard();
    } catch (err) {
        console.error('Load reminders error:', err);
        document.getElementById('cardsContainer').innerHTML =
            '<div style="text-align:center;padding:40px;color:var(--gray-400);">שגיאה בטעינת תזכורות</div>';
    }
}

function renderDashboard() {
    const user = getUser();
    const rp = user ? (user.reminderPages || {}) : {};
    const container = document.getElementById('cardsContainer');
    if (!container) return;

    let html = '<div class="reminder-cards-grid">';

    for (const [key, label] of Object.entries(REMINDER_TYPES)) {
        if (rp[key] === false) continue;

        const typeReminders = allReminders.filter(r => r.type === key);
        const total = typeReminders.length;
        const openCount = typeReminders.filter(r => r.status === 'open').length;
        const inProgressCount = typeReminders.filter(r => r.status === 'inProgress').length;
        const completedCount = typeReminders.filter(r => r.status === 'completed').length;
        const icon = CARD_ICONS[key] || '';

        html += `
        <a class="reminder-card" href="reminder-detail.html?type=${key}">
            <div class="card-icon">${icon}</div>
            <div class="reminder-card-title">${label}</div>
            <div class="reminder-card-count">${total}</div>
            <div class="reminder-card-statuses">
                ${openCount ? `<span class="mini-badge mini-open">${openCount} פתוח</span>` : ''}
                ${inProgressCount ? `<span class="mini-badge mini-inProgress">${inProgressCount} בטיפול</span>` : ''}
                ${completedCount ? `<span class="mini-badge mini-completed">${completedCount} הושלם</span>` : ''}
            </div>
        </a>`;
    }

    html += '</div>';
    container.innerHTML = html;
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

function handleEmailDrop(e) {
    // 1. Try to get files (.msg from Outlook Desktop)
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
        const file = files[0];
        const name = file.name || '';
        const emailData = {
            source: 'file',
            fileName: name,
            notes: 'יובא מקובץ: ' + name
        };
        navigateToDetailWithEmail(emailData);
        return;
    }

    // 2. Try to get text (from Gmail / Outlook Web)
    const text = e.dataTransfer.getData('text/plain') || '';
    const html = e.dataTransfer.getData('text/html') || '';

    if (text || html) {
        const extracted = extractEmailData(text || html);
        navigateToDetailWithEmail(extracted);
        return;
    }

    // 3. Fallback: navigate to first available type
    navigateToDetailWithEmail({ source: 'empty', notes: '' });
}

function extractEmailData(text) {
    const data = { source: 'text', notes: text.substring(0, 500) };

    // Try to extract phone number (Israeli format)
    const phoneMatch = text.match(/0[2-9]\d[\s-]?\d{3}[\s-]?\d{4}|0[2-9]\d{7,8}/);
    if (phoneMatch) data.phone = phoneMatch[0].replace(/[\s-]/g, '');

    // Try to extract ID number (9 digits)
    const idMatch = text.match(/\b\d{9}\b/);
    if (idMatch && idMatch[0] !== (data.phone || '')) data.idNumber = idMatch[0];

    // Try to extract email address
    const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (emailMatch) data.email = emailMatch[0];

    // Try to extract amount (number with ₪ or NIS or ש"ח)
    const amountMatch = text.match(/(?:₪|NIS|ש"ח)\s*[\d,]+\.?\d*|\d[\d,]+\.?\d*\s*(?:₪|NIS|ש"ח)/);
    if (amountMatch) {
        data.amount = parseFloat(amountMatch[0].replace(/[^\d.]/g, ''));
    }

    return data;
}

function navigateToDetailWithEmail(emailData) {
    // Store in sessionStorage for the detail page to pick up
    sessionStorage.setItem('emailDraft', JSON.stringify(emailData));

    // Navigate to first available type
    const user = getUser();
    const rp = user ? (user.reminderPages || {}) : {};
    let targetType = 'agentAppointment';
    for (const key of Object.keys(REMINDER_TYPES)) {
        if (rp[key] !== false) { targetType = key; break; }
    }

    window.location.href = `reminder-detail.html?type=${targetType}&fromEmail=1`;
}
