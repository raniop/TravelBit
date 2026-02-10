// Alerts Page JS
document.addEventListener('DOMContentLoaded', () => {
    initUser();
    loadAlerts();
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

async function loadAlerts() {
    try {
        const res = await apiFetch('/dashboard/alerts');
        if (!res || !res.ok) return;
        const data = await res.json();

        // Summary
        document.getElementById('statOk').textContent = data.summary.ok;
        document.getElementById('statWarning').textContent = data.summary.warning;
        document.getElementById('statCritical').textContent = (data.summary.critical + data.summary.expired);
        document.getElementById('totalPolicies').textContent = `סה"כ ${data.summary.total} פוליסות`;

        renderAlerts(data.alerts);
    } catch (err) {
        console.error('Error loading alerts:', err);
    }
}

function renderAlerts(alerts) {
    const container = document.getElementById('alertsList');

    if (!alerts || alerts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <h3>אין פוליסות</h3>
                <p>לא נמצאו פוליסות ביטוח עבור החברה</p>
            </div>
        `;
        return;
    }

    const severityLabels = {
        ok: 'תקין',
        warning: 'פג תוקף בקרוב',
        critical: 'דחוף!',
        expired: 'פג תוקף'
    };

    container.innerHTML = alerts.map(alert => {
        const daysText = getDaysText(alert.daysLeft, alert.severity);

        return `
            <div class="alert-item">
                <div class="alert-dot ${alert.severity}"></div>
                <div class="alert-info">
                    <h4>פוליסה ${esc(alert.policyNumber)} - ${esc(alert.type)}</h4>
                    <p>תוקף: ${fmtDate(alert.startDate)} - ${fmtDate(alert.expirationDate)}</p>
                </div>
                <div style="text-align:left;">
                    <span class="badge badge-${alert.severity}" style="margin-bottom:4px; display:inline-block;">${severityLabels[alert.severity]}</span>
                    <div class="alert-days" style="color: ${getColor(alert.severity)}">${daysText}</div>
                </div>
            </div>
        `;
    }).join('');
}

function getDaysText(days, severity) {
    if (severity === 'expired') return 'פג תוקף';
    if (days === 0) return 'פג היום!';
    if (days === 1) return 'מחר';
    return `${days} ימים`;
}

function getColor(severity) {
    const colors = { ok: '#10B981', warning: '#F59E0B', critical: '#EF4444', expired: '#94A3B8' };
    return colors[severity] || '#64748B';
}

function fmtDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('he-IL');
}

function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
