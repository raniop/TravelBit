// Commissions Dashboard
let allAgreements = [];

const API_BASE_C = '/api';

function getTokenC() { return localStorage.getItem('dash_token'); }

async function loadAgreements() {
    const container = document.getElementById('agreementsContainer');
    try {
        const res = await fetch(API_BASE_C + '/dashboard/commissions', {
            headers: { 'Authorization': 'Bearer ' + getTokenC() }
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'שגיאה בטעינת ההסכמים');
        }
        allAgreements = await res.json();
        document.getElementById('agreementCount').textContent = allAgreements.length;
        renderAgreements(allAgreements);
    } catch (err) {
        container.innerHTML = '<div class="empty-state">⚠️ ' + (err.message || 'שגיאה') + '</div>';
    }
}

function fmtDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt)) return '';
    return dt.toLocaleDateString('he-IL', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function fmtPct(rate) {
    const n = Number(rate) || 0;
    return n + '%';
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderAgreements(list) {
    const container = document.getElementById('agreementsContainer');
    if (!list || list.length === 0) {
        container.innerHTML = '<div class="empty-state">אין הסכמי עמלות פעילים. צור קשר עם מנהל המערכת להוספת הסכמים.</div>';
        return;
    }

    const html = list.map((ag, idx) => {
        const agentInfo = [ag.agentCode, ag.agentCodeSecondary].filter(Boolean).join(' / ');
        const meta = [
            ag.effectiveDate ? 'תוקף: ' + fmtDate(ag.effectiveDate) : '',
            agentInfo ? 'סוכן: ' + agentInfo : '',
            ag.documentRef || ''
        ].filter(Boolean).join(' • ');

        const ratesHtml = (ag.rates || []).map(r => {
            const pct = Number(r.rate) || 0;
            const cls = pct > 0 ? 'positive' : 'zero';
            return '<tr>' +
                '<td>' + escapeHtml(r.category || '') + '</td>' +
                '<td class="rate-code">' + escapeHtml(r.productCode || '') + '</td>' +
                '<td>' + escapeHtml(r.productName || '') + (r.notes ? '<div style="font-size:11px;color:var(--gray-500);margin-top:2px;">' + escapeHtml(r.notes) + '</div>' : '') + '</td>' +
                '<td class="rate-pct ' + cls + '">' + fmtPct(pct) + '</td>' +
                '</tr>';
        }).join('');

        const notesHtml = (ag.notes && ag.notes.length) ? (
            '<div class="agreement-notes"><strong>הערות:</strong><ol>' +
            ag.notes.map(n => '<li>' + escapeHtml(n) + '</li>').join('') +
            '</ol></div>'
        ) : '';

        return '<div class="agreement-card">' +
            '<div class="agreement-head" onclick="toggleAgreement(' + idx + ')">' +
                '<div>' +
                    '<div class="agreement-title">' + escapeHtml(ag.insurer) + '</div>' +
                    '<div class="agreement-meta">' + escapeHtml(meta) + '</div>' +
                '</div>' +
                '<div class="agreement-toggle" id="toggle-' + idx + '">+</div>' +
            '</div>' +
            '<div class="agreement-body" id="body-' + idx + '">' +
                '<table class="rate-table">' +
                    '<thead><tr><th>קטגוריה</th><th>קוד</th><th>תיאור</th><th style="text-align:left;">עמלה נטו</th></tr></thead>' +
                    '<tbody>' + ratesHtml + '</tbody>' +
                '</table>' +
                notesHtml +
            '</div>' +
        '</div>';
    }).join('');

    container.innerHTML = '<div class="agreements-grid">' + html + '</div>';
}

function toggleAgreement(idx) {
    const body = document.getElementById('body-' + idx);
    const toggle = document.getElementById('toggle-' + idx);
    if (!body) return;
    body.classList.toggle('open');
    toggle.textContent = body.classList.contains('open') ? '−' : '+';
}

// Search/filter
document.addEventListener('DOMContentLoaded', () => {
    const search = document.getElementById('searchInput');
    if (search) {
        search.addEventListener('input', () => {
            const q = search.value.trim().toLowerCase();
            if (!q) { renderAgreements(allAgreements); return; }
            const filtered = allAgreements
                .map(ag => {
                    const matchInsurer = ag.insurer.toLowerCase().includes(q);
                    const matchedRates = (ag.rates || []).filter(r =>
                        (r.productCode || '').toLowerCase().includes(q) ||
                        (r.productName || '').toLowerCase().includes(q) ||
                        (r.category || '').toLowerCase().includes(q)
                    );
                    if (matchInsurer) return ag;
                    if (matchedRates.length > 0) return Object.assign({}, ag, { rates: matchedRates });
                    return null;
                })
                .filter(Boolean);
            renderAgreements(filtered);
            document.getElementById('agreementCount').textContent = filtered.length;
        });
    }
    loadAgreements();
});

// Commission calculation utility (exposed globally for future use)
// Usage: calculateCommission('שירביט', '211', 1000) → returns { rate: 28, amount: 280 }
window.calculateCommission = function(insurer, productCode, premium) {
    const ag = allAgreements.find(a => a.insurer === insurer);
    if (!ag) return { rate: 0, amount: 0, found: false, reason: 'הסכם לא נמצא עבור ' + insurer };
    const rate = (ag.rates || []).find(r => r.productCode === String(productCode));
    if (!rate) return { rate: 0, amount: 0, found: false, reason: 'קוד ענף ' + productCode + ' לא מופיע בהסכם ' + insurer };
    const pct = Number(rate.rate) || 0;
    return { rate: pct, amount: (Number(premium) || 0) * pct / 100, found: true, productName: rate.productName };
};
