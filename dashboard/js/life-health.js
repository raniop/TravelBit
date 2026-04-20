// Life & Health commissions dashboard

let allEntries = [];
let allUploads = [];
let allSummary = {};

const HE_MONTHS = ['ינו','פבר','מרץ','אפר','מאי','יונ','יול','אוג','ספט','אוק','נוב','דצמ'];

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function fmtNum(n) {
    return Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });
}

function fmtMonth(ym) {
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym || '';
    const [y, m] = ym.split('-');
    return HE_MONTHS[parseInt(m) - 1] + '-' + y.slice(-2);
}

function fmtDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString('he-IL');
}

const CAT_LABELS = {
    'commission': 'עמלה',
    'vat-paid':   'תשלום מע"מ',
    'vat-credit': 'זיכוי מע"מ',
    'advance':    'מקדמה',
    'other':      'אחר'
};

async function loadAll() {
    const insurer = document.getElementById('filterInsurer').value;
    const month = document.getElementById('filterMonth').value;
    const params = new URLSearchParams();
    if (insurer) params.set('insurer', insurer);
    if (month) params.set('month', month);
    try {
        const [dataRes, uploadsRes] = await Promise.all([
            fetch(API + '/dashboard/life-health-commissions?' + params.toString(), { headers: authHdr() }),
            fetch(API + '/dashboard/life-health-commissions/uploads', { headers: authHdr() })
        ]);
        const data = await dataRes.json();
        const uploads = await uploadsRes.json();
        if (!dataRes.ok) throw new Error(data.message || 'שגיאה');
        allEntries = data.entries || [];
        allSummary = data.summary || {};
        allUploads = Array.isArray(uploads) ? uploads : [];
        rebuildFilters();
        render();
    } catch (err) {
        document.getElementById('contentArea').innerHTML =
            '<div style="text-align:center;padding:40px;color:#DC2626;">⚠️ ' + escapeHtml(err.message || 'שגיאה') + '</div>';
    }
}

function rebuildFilters() {
    const insurers = new Set(), months = new Set();
    for (const e of allEntries) {
        if (e.insurer) insurers.add(e.insurer);
        if (e.yearMonth) months.add(e.yearMonth);
    }
    const curInsurer = document.getElementById('filterInsurer').value;
    const curMonth = document.getElementById('filterMonth').value;
    document.getElementById('filterInsurer').innerHTML = '<option value="">כל המבטחים</option>' +
        [...insurers].sort().map(i => '<option value="' + escapeHtml(i) + '"' + (i === curInsurer ? ' selected' : '') + '>' + escapeHtml(i) + '</option>').join('');
    document.getElementById('filterMonth').innerHTML = '<option value="">כל החודשים</option>' +
        [...months].sort().reverse().map(m => '<option value="' + escapeHtml(m) + '"' + (m === curMonth ? ' selected' : '') + '>' + fmtMonth(m) + '</option>').join('');
}

function reload() { loadAll(); }

function render() {
    const container = document.getElementById('contentArea');
    if (!allEntries || allEntries.length === 0) {
        container.innerHTML = renderUploadsList() +
            '<div style="text-align:center;padding:60px 20px;color:var(--gray-400);background:white;border-radius:12px;">אין נתוני עמלות חיים ובריאות. לחץ "העלאת דוח עמלות" כדי להתחיל.</div>';
        return;
    }

    const s = allSummary;
    const cardsHtml =
        '<div class="summary-cards">' +
            '<div class="sum-card"><div class="sum-card-label">סה"כ תנועות</div><div class="sum-card-value">' + s.totalEntries + '</div></div>' +
            '<div class="sum-card" style="border-top:3px solid #16A34A;"><div class="sum-card-label">עמלות שנכנסו</div><div class="sum-card-value">' + fmtNum(s.totalCommission) + ' ₪</div></div>' +
            '<div class="sum-card" style="border-top:3px solid #3B82F6;"><div class="sum-card-label">מע"מ שהתקבל</div><div class="sum-card-value">' + fmtNum(s.totalVatPaid) + ' ₪</div></div>' +
            '<div class="sum-card" style="border-top:3px solid #EAB308;"><div class="sum-card-label">זיכויי מע"מ (החזרים)</div><div class="sum-card-value">' + fmtNum(s.totalVatCredit) + ' ₪</div></div>' +
            '<div class="sum-card" style="border-top:3px solid #F97316;"><div class="sum-card-label">נטו לבנק</div><div class="sum-card-value">' + fmtNum(s.totalNet) + ' ₪</div></div>' +
        '</div>';

    container.innerHTML =
        cardsHtml +
        '<div class="section-title">פילוח לפי חודש</div>' +
        renderMonthTable() +
        '<div class="section-title">פילוח לפי חברה</div>' +
        renderInsurerTable() +
        '<div class="section-title">תנועות (' + allEntries.length + ')</div>' +
        renderEntriesTable() +
        renderUploadsList();
}

function renderMonthTable() {
    const entries = Object.entries(allSummary.byMonth || {}).sort();
    if (entries.length === 0) return '';
    const rows = entries.map(([m, s]) => {
        return '<tr>' +
            '<td>' + fmtMonth(m) + '</td>' +
            '<td class="num">' + s.count + '</td>' +
            '<td class="num pos">' + fmtNum(s.commission) + '</td>' +
            '<td class="num">' + fmtNum(s.vatPaid) + '</td>' +
            '<td class="num">' + fmtNum(s.vatCredit) + '</td>' +
            '<td class="num pos">' + fmtNum(s.net) + '</td>' +
        '</tr>';
    }).join('');
    return '<table class="lh-table"><thead><tr>' +
        '<th>חודש</th><th class="num">תנועות</th>' +
        '<th class="num">עמלה</th><th class="num">מע"מ שהתקבל</th><th class="num">זיכוי מע"מ</th><th class="num">נטו</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>';
}

function renderInsurerTable() {
    const entries = Object.entries(allSummary.byInsurer || {}).sort((a, b) => b[1].commission - a[1].commission);
    if (entries.length === 0) return '';
    const rows = entries.map(([ins, s]) => {
        return '<tr>' +
            '<td>' + escapeHtml(ins) + '</td>' +
            '<td class="num">' + s.count + '</td>' +
            '<td class="num pos">' + fmtNum(s.commission) + '</td>' +
        '</tr>';
    }).join('');
    return '<table class="lh-table"><thead><tr>' +
        '<th>חברה</th><th class="num">תנועות</th><th class="num">עמלה</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>';
}

function renderEntriesTable() {
    const sorted = [...allEntries].sort((a, b) => new Date(b.valueDate) - new Date(a.valueDate));
    const limit = Math.min(500, sorted.length);
    const rows = sorted.slice(0, limit).map(e => {
        const cat = e.category || 'other';
        const debit = e.debit || 0;
        const credit = e.credit || 0;
        return '<tr>' +
            '<td>' + fmtDate(e.valueDate) + '</td>' +
            '<td>' + escapeHtml(e.insurer || '') + '</td>' +
            '<td><span class="cat-pill cat-' + cat + '">' + (CAT_LABELS[cat] || cat) + '</span></td>' +
            '<td>' + escapeHtml(e.description || '') + '</td>' +
            '<td>' + escapeHtml(e.agentCode || '') + (e.agentName ? ' · ' + escapeHtml(e.agentName) : '') + '</td>' +
            '<td class="num">' + (debit ? fmtNum(debit) : '-') + '</td>' +
            '<td class="num">' + (credit ? fmtNum(credit) : '-') + '</td>' +
            '<td class="num">' + (e.balance != null ? fmtNum(e.balance) : '-') + '</td>' +
        '</tr>';
    }).join('');
    return '<table class="lh-table"><thead><tr>' +
        '<th>תאריך</th><th>חברה</th><th>קטגוריה</th><th>תיאור</th><th>סוכן</th>' +
        '<th class="num">חובה</th><th class="num">זכות</th><th class="num">יתרה</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>' +
        (sorted.length > limit ? '<div style="text-align:center;padding:12px;color:var(--gray-400);font-size:12px;">מציג ' + limit + ' ראשונות מתוך ' + sorted.length + '</div>' : '');
}

function renderUploadsList() {
    if (!allUploads || allUploads.length === 0) return '';
    const sorted = [...allUploads].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const RECENT = 3;
    const rowHtml = u => {
        const d = new Date(u.createdAt);
        return '<div class="upload-row">' +
            '<div>' +
                '<strong>' + escapeHtml(u.insurer) + '</strong>' +
                ' <span class="upload-meta">' + escapeHtml(u.fileName || '') + ' • ' + u.rowCount + ' תנועות • חודשים: ' + (u.monthsCovered || []).join(', ') + ' • הועלה ' + d.toLocaleDateString('he-IL') + '</span>' +
            '</div>' +
            '<button class="delete-btn" onclick="deleteUpload(\'' + u._id + '\')">מחק</button>' +
        '</div>';
    };
    const recent = sorted.slice(0, RECENT).map(rowHtml).join('');
    const rest = sorted.slice(RECENT).map(rowHtml).join('');
    const restBlock = rest
        ? '<details style="margin-top:6px;"><summary style="cursor:pointer;font-size:12px;color:var(--gray-500);padding:6px 12px;">הצג עוד ' + (sorted.length - RECENT) + ' העלאות ▾</summary>' + rest + '</details>'
        : '';
    return '<details style="margin-top:24px;background:white;border-radius:12px;padding:14px 18px;border:1px solid var(--gray-100);">' +
            '<summary style="cursor:pointer;font-weight:700;font-size:14px;color:var(--gray-700);">היסטוריית העלאות (' + sorted.length + ') ▸</summary>' +
            '<div class="uploads-list" style="margin-top:10px;">' + recent + restBlock + '</div>' +
        '</details>';
}

// ===== Upload =====
function openUploadModal() {
    document.getElementById('uploadModal').classList.add('show');
    document.getElementById('uploadStatus').innerHTML = '';
    document.getElementById('uploadFile').value = '';
}
function closeUploadModal() {
    document.getElementById('uploadModal').classList.remove('show');
}

async function submitUpload() {
    const insurer = document.getElementById('uploadInsurer').value;
    const file = document.getElementById('uploadFile').files[0];
    const replaceExisting = document.getElementById('uploadReplace').checked;
    const status = document.getElementById('uploadStatus');
    const btn = document.getElementById('uploadSubmit');

    if (!file) { status.innerHTML = '<div style="background:#FEE2E2;color:#991B1B;padding:8px;border-radius:6px;font-size:12px;">בחר קובץ</div>'; return; }
    btn.disabled = true; btn.textContent = 'מעלה...';
    status.innerHTML = '<div style="font-size:12px;color:var(--gray-500);">מעבד...</div>';

    try {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);

        const res = await fetch(API + '/dashboard/life-health-commissions', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, authHdr()),
            body: JSON.stringify({ insurer, fileName: file.name, csvBase64: base64, replaceExisting })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'שגיאה בהעלאה');
        status.innerHTML = '<div style="background:#DCFCE7;color:#166534;padding:8px;border-radius:6px;font-size:13px;font-weight:700;">✅ נטענו ' + data.rowsImported + ' תנועות</div>';
        loadAll();
        setTimeout(() => closeUploadModal(), 1500);
    } catch (err) {
        status.innerHTML = '<div style="background:#FEE2E2;color:#991B1B;padding:8px;border-radius:6px;font-size:13px;">⚠️ ' + escapeHtml(err.message || 'שגיאה') + '</div>';
    } finally {
        btn.disabled = false; btn.textContent = 'העלה';
    }
}

async function deleteUpload(id) {
    if (!confirm('למחוק את ההעלאה הזו ואת כל התנועות שבה?')) return;
    try {
        const res = await fetch(API + '/dashboard/life-health-commissions/uploads/' + id, {
            method: 'DELETE',
            headers: authHdr()
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'שגיאה במחיקה');
        }
        loadAll();
    } catch (err) {
        alert('שגיאה: ' + err.message);
    }
}

document.addEventListener('DOMContentLoaded', loadAll);
