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

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let totalOverdue = 0;

    let html = '<div class="reminder-cards-grid">';

    for (const [key, label] of Object.entries(REMINDER_TYPES)) {
        if (rp[key] === false) continue;

        const typeReminders = allReminders.filter(r => r.type === key);
        const total = typeReminders.length;
        const openCount = typeReminders.filter(r => r.status === 'open').length;
        const inProgressCount = typeReminders.filter(r => r.status === 'inProgress').length;
        const completedCount = typeReminders.filter(r => r.status === 'completed').length;

        // Count overdue (open/inProgress with past due date)
        const overdueCount = typeReminders.filter(r => {
            if (!r.date || r.status === 'completed' || r.status === 'cancelled') return false;
            const dueDate = new Date(r.date);
            dueDate.setHours(0, 0, 0, 0);
            return dueDate < today;
        }).length;
        totalOverdue += overdueCount;

        const icon = CARD_ICONS[key] || '';

        // Get top urgent reminders (open/inProgress, sorted by due date urgency)
        const urgentItems = getUrgentItems(typeReminders, today, 5);
        const denseClass = urgentItems.length >= 4 ? ' urgent-dense' : '';
        const urgentHtml = urgentItems.length ? `
            <div class="card-urgent-panel${denseClass}">
                <div class="urgent-panel-title">דורשים טיפול</div>
                <ul class="card-urgent-list">
                    ${urgentItems.map(item => {
                        const metaParts = [];
                        if (item.dateLabel) metaParts.push(`<span class="urgent-date ${item.urgency}">${item.dateLabel}</span>`);
                        if (item.insuranceCompany) metaParts.push(`<span>${escHtml(item.insuranceCompany)}</span>`);
                        if (item.policyNumber) metaParts.push(`<span>פוליסה ${escHtml(item.policyNumber)}</span>`);
                        if (item.statusLabel) metaParts.push(`<span class="urgent-status-${item.statusKey}">${item.statusLabel}</span>`);
                        const metaHtml = metaParts.join('<span class="urgent-sep">·</span>');
                        return `
                        <li>
                            <span class="urgent-dot ${item.urgency}"></span>
                            <div class="urgent-info">
                                <span class="urgent-name">${escHtml(item.name)}</span>
                                <div class="urgent-meta">${metaHtml}</div>
                            </div>
                        </li>`;
                    }).join('')}
                </ul>
            </div>` : '';

        html += `
        <a class="reminder-card ${urgentItems.length ? 'has-urgent' : ''}" href="reminder-detail.html?type=${key}">
            <div class="card-main-info">
                <div class="card-icon">${icon}</div>
                <div class="reminder-card-title">${label}</div>
                <div class="reminder-card-count">${total}</div>
                <div class="reminder-card-statuses">
                    ${overdueCount ? `<span class="mini-badge mini-overdue">${overdueCount} באיחור</span>` : ''}
                    ${openCount ? `<span class="mini-badge mini-open">${openCount} פתוח</span>` : ''}
                    ${inProgressCount ? `<span class="mini-badge mini-inProgress">${inProgressCount} בטיפול</span>` : ''}
                    ${completedCount ? `<span class="mini-badge mini-completed">${completedCount} הושלם</span>` : ''}
                </div>
            </div>
            ${urgentHtml}
        </a>`;
    }

    html += '</div>';
    container.innerHTML = html;

    // Show sidebar badge
    if (totalOverdue > 0) {
        const sidebarLink = document.getElementById('sidebarRemindersLink');
        if (sidebarLink) {
            const existing = sidebarLink.querySelector('.overdue-badge');
            if (existing) existing.remove();
            const badge = document.createElement('span');
            badge.className = 'overdue-badge';
            badge.textContent = totalOverdue;
            sidebarLink.appendChild(badge);
        }
    }

    // Show banner
    if (totalOverdue > 0 && !sessionStorage.getItem('overdue_banner_dismissed')) {
        showOverdueBanner(totalOverdue);
    }
}

function showOverdueBanner(count) {
    const pageBody = document.querySelector('.page-body');
    if (!pageBody) return;
    if (pageBody.querySelector('.overdue-banner')) return;

    const banner = document.createElement('div');
    banner.className = 'overdue-banner';
    banner.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span class="overdue-banner-text">יש לך <strong>${count}</strong> תזכורות שעבר תאריך היעד שלהן</span>
        <button class="overdue-banner-close" onclick="this.parentElement.remove(); sessionStorage.setItem('overdue_banner_dismissed','1')">&times;</button>
    `;
    pageBody.insertBefore(banner, pageBody.firstChild);
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
    // 1. Try to get files (.eml / .msg from Outlook Desktop)
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
        const file = files[0];
        // Read file content and extract data
        const emailData = await readEmailFile(file);
        navigateToDetailWithEmail(emailData);
        return;
    }

    // 2. Try to get text (from Gmail / Outlook Web)
    const text = e.dataTransfer.getData('text/plain') || '';
    const html = e.dataTransfer.getData('text/html') || '';

    if (text || html) {
        const extracted = extractEmailDataEnhanced(text, html);
        navigateToDetailWithEmail(extracted);
        return;
    }

    // 3. Fallback: navigate to first available type
    navigateToDetailWithEmail({ source: 'empty', notes: '' });
}

function navigateToDetailWithEmail(emailData) {
    // Store in sessionStorage for the detail page to pick up
    sessionStorage.setItem('emailDraft', JSON.stringify(emailData));

    // Smart routing: use detected type if available and allowed
    const user = getUser();
    const rp = user ? (user.reminderPages || {}) : {};

    let targetType = null;

    // If type was auto-detected, use it (if the page is enabled)
    if (emailData.detectedType && rp[emailData.detectedType] !== false) {
        targetType = emailData.detectedType;
    }

    // Fallback: first available type
    if (!targetType) {
        for (const key of Object.keys(REMINDER_TYPES)) {
            if (rp[key] !== false) { targetType = key; break; }
        }
    }

    if (!targetType) targetType = 'agentAppointment';

    window.location.href = `reminder-detail.html?type=${targetType}&fromEmail=1`;
}

// ===== Urgent Items Helper =====
// Returns the top N most urgent reminders (open/inProgress), sorted by due date
function getUrgentItems(reminders, today, maxItems) {
    // Filter to active reminders only
    const active = reminders.filter(r => r.status === 'open' || r.status === 'inProgress');
    if (!active.length) return [];

    // Sort: overdue first (oldest first), then by nearest due date, then no-date last
    active.sort((a, b) => {
        const aDate = a.date ? new Date(a.date) : null;
        const bDate = b.date ? new Date(b.date) : null;

        // No date goes to the end
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;

        // Both have dates — sort by date ascending (earliest/most overdue first)
        return aDate - bDate;
    });

    const STATUS_LABELS = { open: 'פתוח', inProgress: 'בטיפול' };

    return active.slice(0, maxItems).map(r => {
        const name = r.customerName || r.notes?.substring(0, 30) || 'ללא שם';
        let urgency = 'normal';
        let dateLabel = '';

        if (r.date) {
            const dueDate = new Date(r.date);
            dueDate.setHours(0, 0, 0, 0);
            const diffMs = dueDate - today;
            const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

            if (diffDays < 0) {
                urgency = 'overdue';
                dateLabel = diffDays === -1 ? 'אתמול' : `לפני ${Math.abs(diffDays)} ימים`;
            } else if (diffDays === 0) {
                urgency = 'warning';
                dateLabel = 'היום';
            } else if (diffDays <= 3) {
                urgency = 'warning';
                dateLabel = diffDays === 1 ? 'מחר' : `בעוד ${diffDays} ימים`;
            } else {
                dateLabel = isoToIL(r.date.substring(0, 10));
            }
        } else {
            dateLabel = 'ללא תאריך';
        }

        return {
            name,
            urgency,
            dateLabel,
            insuranceCompany: r.insuranceCompany || '',
            policyNumber: r.policyNumber || '',
            statusLabel: STATUS_LABELS[r.status] || '',
            statusKey: r.status || 'open'
        };
    });
}

function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
