// Production Dashboard
const API = '/api';
function getTok() { return localStorage.getItem('dash_token'); }
function authHdr() { return { 'Authorization': 'Bearer ' + getTok() }; }

let allRecords = [];
let allUploads = [];
let allSummary = null;

function fmtNum(n) {
    if (n === null || n === undefined || isNaN(n)) return '-';
    return Math.round(n).toLocaleString('he-IL');
}
function fmtPct(n) {
    if (n === null || n === undefined || isNaN(n)) return '-';
    return n.toFixed(1) + '%';
}
function fmtDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt)) return '';
    return dt.toLocaleDateString('he-IL', { year: '2-digit', month: '2-digit', day: '2-digit' });
}
function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function loadAll() {
    const insurer = document.getElementById('filterInsurer').value;
    const month = document.getElementById('filterMonth').value;
    const params = new URLSearchParams();
    if (insurer) params.set('insurer', insurer);
    if (month) params.set('month', month);

    const container = document.getElementById('contentArea');
    container.innerHTML = '<div class="cards-loading"><div class="spinner"></div><p>טוען...</p></div>';

    try {
        const [recRes, upRes] = await Promise.all([
            fetch(API + '/dashboard/production?' + params.toString(), { headers: authHdr() }),
            fetch(API + '/dashboard/production/uploads', { headers: authHdr() })
        ]);
        if (!recRes.ok || !upRes.ok) {
            const err = await recRes.json().catch(() => ({}));
            throw new Error(err.message || 'שגיאה בטעינה');
        }
        const data = await recRes.json();
        allRecords = data.records;
        allSummary = data.summary;
        allUploads = await upRes.json();
        populateFilters();
        render();
    } catch (err) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#DC2626;">⚠️ ' + (err.message || 'שגיאה') + '</div>';
    }
}

function populateFilters() {
    const insurerSel = document.getElementById('filterInsurer');
    const monthSel = document.getElementById('filterMonth');
    const insurers = new Set(allRecords.map(r => r.insurer).filter(Boolean));
    const months = new Set(allRecords.map(r => r.productionYearMonth).filter(Boolean));

    const curIns = insurerSel.value;
    const curMonth = monthSel.value;
    insurerSel.innerHTML = '<option value="">כל המבטחים</option>' +
        [...insurers].sort().map(i => '<option value="' + escapeHtml(i) + '"' + (i === curIns ? ' selected' : '') + '>' + escapeHtml(i) + '</option>').join('');
    monthSel.innerHTML = '<option value="">כל החודשים</option>' +
        [...months].sort().reverse().map(m => '<option value="' + escapeHtml(m) + '"' + (m === curMonth ? ' selected' : '') + '>' + escapeHtml(m) + '</option>').join('');
}

function render() {
    const container = document.getElementById('contentArea');
    if (!allRecords || allRecords.length === 0) {
        container.innerHTML = renderUploadsList() +
            '<div style="text-align:center;padding:60px 20px;color:var(--gray-400);background:white;border-radius:12px;">אין נתוני תפוקה. לחץ על "העלאת קובץ תפוקה" כדי להתחיל.</div>';
        return;
    }

    const s = allSummary;
    const gapClass = (s.totalGap < 0) ? 'gap-negative' : (s.totalGap > 0 ? 'gap-positive' : '');
    const gapSign = s.totalGap > 0 ? '+' : '';

    const cardsHtml =
        '<div class="summary-cards">' +
            '<div class="sum-card"><div class="sum-card-label">סה"כ פוליסות</div><div class="sum-card-value">' + s.totalRecords + '</div></div>' +
            '<div class="sum-card"><div class="sum-card-label">פרמיה נטו</div><div class="sum-card-value">' + fmtNum(s.totalNetPremium) + ' ₪</div></div>' +
            '<div class="sum-card"><div class="sum-card-label">עמלה ששולמה</div><div class="sum-card-value">' + fmtNum(s.totalCommission) + ' ₪</div></div>' +
            '<div class="sum-card"><div class="sum-card-label">עמלה צפויה (לפי הסכם)</div><div class="sum-card-value">' + fmtNum(s.totalExpectedCommission) + ' ₪</div></div>' +
            '<div class="sum-card ' + gapClass + '"><div class="sum-card-label">פער עמלה</div><div class="sum-card-value">' + gapSign + fmtNum(s.totalGap) + ' ₪</div></div>' +
        '</div>';

    container.innerHTML =
        cardsHtml +
        '<div class="section-title">פילוח לפי ענף</div>' +
        renderBranchTable() +
        '<div class="section-title">פילוח לפי חודש</div>' +
        renderMonthTable() +
        '<div class="section-title">פוליסות (' + allRecords.length + ')</div>' +
        renderRecordsTable() +
        renderUploadsList();
}

function renderUploadsList() {
    if (!allUploads || allUploads.length === 0) return '';
    const sorted = [...allUploads].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const RECENT = 3;

    const rowHtml = u => {
        const date = new Date(u.createdAt);
        return '<div class="upload-row">' +
            '<div>' +
                '<strong>' + escapeHtml(u.insurer) + '</strong>' +
                ' <span class="upload-meta">' + escapeHtml(u.fileName || '') + ' • ' + u.rowCount + ' רשומות • חודשים: ' + (u.monthsCovered || []).join(', ') + ' • הועלה ' + date.toLocaleDateString('he-IL') + '</span>' +
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

// Mirror of the server's bkey builder (api/dashboard/production.js).
// Used to group raw records back into the same buckets as allSummary.byBranch.
function recordBranchKey(r) {
    const code = (r.branchCode || '').toString().trim();
    const name = (r.branchName || '').toString().trim();
    if (code && name && code !== name) return code + ' - ' + name;
    return name || code || 'לא ידוע';
}

function renderBranchTable() {
    const entries = Object.entries(allSummary.byBranch).sort((a, b) => b[1].premium - a[1].premium);
    const rows = entries.map(([branch, s], idx) => {
        let badge = '<span class="badge-status badge-na">אין הסכם</span>';
        let gapHtml = '-';
        if (s.expected > 0 || s.gap !== 0) {
            const gapPct = s.expected > 0 ? (s.gap / s.expected * 100) : 0;
            const cls = s.gap < 0 ? 'gap-neg' : 'gap-pos';
            gapHtml = '<span class="num ' + cls + '">' + (s.gap > 0 ? '+' : '') + fmtNum(s.gap) + ' ₪</span>';
            if (s.gap >= 0) badge = '<span class="badge-status badge-ok">תקין</span>';
            else if (Math.abs(gapPct) < 3) badge = '<span class="badge-status badge-warn">פער קל</span>';
            else badge = '<span class="badge-status badge-bad">פער ' + Math.round(gapPct) + '%</span>';
        }
        const effRate = s.premium > 0 ? (s.commission / s.premium * 100) : 0;
        const escBranch = escapeHtml(branch).replace(/'/g, "\\'");
        return '<tr class="branch-row" onclick="toggleBranchDetails(' + idx + ", '" + escBranch + '\')" style="cursor:pointer;">' +
            '<td><span class="branch-toggle" id="bt-' + idx + '" style="display:inline-block;width:14px;color:var(--gray-400);">▸</span> ' + escapeHtml(branch) + '</td>' +
            '<td class="num">' + s.count + '</td>' +
            '<td class="num">' + fmtNum(s.premium) + '</td>' +
            '<td class="num">' + fmtNum(s.commission) + '</td>' +
            '<td class="num">' + (s.expected > 0 ? fmtNum(s.expected) : '-') + '</td>' +
            '<td>' + gapHtml + '</td>' +
            '<td class="num">' + fmtPct(effRate) + '</td>' +
            '<td>' + badge + '</td>' +
        '</tr>' +
        '<tr class="branch-detail-row" id="bd-' + idx + '" style="display:none;"><td colspan="8" style="padding:0;background:#FAFBFC;"><div id="bdc-' + idx + '"></div></td></tr>';
    }).join('');
    return '<table class="branch-table"><thead><tr>' +
        '<th>ענף</th>' +
        '<th class="num">פוליסות</th>' +
        '<th class="num">פרמיה נטו</th>' +
        '<th class="num">עמלה ששולמה</th>' +
        '<th class="num">עמלה צפויה</th>' +
        '<th>פער</th>' +
        '<th class="num">% בפועל</th>' +
        '<th>סטטוס</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>';
}

function toggleBranchDetails(idx, branchKey) {
    const row = document.getElementById('bd-' + idx);
    const tog = document.getElementById('bt-' + idx);
    if (!row) return;
    if (row.style.display === 'none') {
        // Lazy-render the inner table on first open
        const container = document.getElementById('bdc-' + idx);
        if (container && !container.dataset.rendered) {
            const matched = (allRecords || []).filter(r => recordBranchKey(r) === branchKey);
            container.innerHTML = renderBranchDetailTable(matched);
            container.dataset.rendered = '1';
        }
        row.style.display = '';
        if (tog) { tog.textContent = '▾'; tog.style.color = 'var(--primary)'; }
    } else {
        row.style.display = 'none';
        if (tog) { tog.textContent = '▸'; tog.style.color = 'var(--gray-400)'; }
    }
}

function renderBranchDetailTable(records) {
    if (!records.length) return '<div style="padding:20px;text-align:center;color:var(--gray-400);">אין רשומות</div>';
    const sorted = [...records].sort((a, b) => (b.netPremium || 0) - (a.netPremium || 0));
    const rows = sorted.map(r => {
        const prem = r.netPremium || 0;
        const comm = r.commissionPaid || 0;
        const premCls = prem < 0 ? 'gap-neg' : '';
        const commCls = comm < 0 ? 'gap-neg' : '';
        const txnBadge = r.transactionType
            ? '<span style="font-size:10px;padding:1px 6px;background:#E5E7EB;border-radius:8px;color:var(--gray-600);">' + escapeHtml(r.transactionType) + '</span>'
            : '';
        // Mark commission source: blue dot for "agreement" (computed, not from file).
        let commMarker = '';
        if (r.commissionSource === 'agreement') {
            commMarker = ' <span title="חושב לפי הסכם — לא קיים בקובץ" style="color:#3B82F6;font-size:10px;">●</span>';
        }
        return '<tr>' +
            '<td>' + escapeHtml(r.insurer || '') + '</td>' +
            '<td>' + escapeHtml(r.productionYearMonth || '-') + '</td>' +
            '<td>' + escapeHtml(r.policyNumber || '') + ' ' + txnBadge + '</td>' +
            '<td>' + escapeHtml(r.insuredName || '') + '</td>' +
            '<td>' + escapeHtml(r.insuredId || '-') + '</td>' +
            '<td>' + escapeHtml(r.licenseNumber || '-') + '</td>' +
            '<td class="num ' + premCls + '">' + fmtNum(prem) + ' ₪</td>' +
            '<td class="num ' + commCls + '">' + fmtNum(comm) + ' ₪' + commMarker + '</td>' +
        '</tr>';
    }).join('');
    return '<table class="branch-detail-table" style="width:100%;border-collapse:collapse;font-size:12px;margin:0;">' +
        '<thead><tr style="background:#F3F4F6;">' +
            '<th style="padding:8px;text-align:right;color:var(--gray-600);font-weight:700;">חברה</th>' +
            '<th style="padding:8px;text-align:right;color:var(--gray-600);font-weight:700;">חודש</th>' +
            '<th style="padding:8px;text-align:right;color:var(--gray-600);font-weight:700;">מס׳ פוליסה</th>' +
            '<th style="padding:8px;text-align:right;color:var(--gray-600);font-weight:700;">מבוטח</th>' +
            '<th style="padding:8px;text-align:right;color:var(--gray-600);font-weight:700;">ת.ז.</th>' +
            '<th style="padding:8px;text-align:right;color:var(--gray-600);font-weight:700;">רכב</th>' +
            '<th style="padding:8px;text-align:left;color:var(--gray-600);font-weight:700;">פרמיה</th>' +
            '<th style="padding:8px;text-align:left;color:var(--gray-600);font-weight:700;">עמלה</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>';
}

function renderMonthTable() {
    const entries = Object.entries(allSummary.byMonth).sort();
    const rows = entries.map(([m, s]) => {
        const eff = s.premium > 0 ? (s.commission / s.premium * 100) : 0;
        return '<tr>' +
            '<td>' + escapeHtml(m) + '</td>' +
            '<td class="num">' + s.count + '</td>' +
            '<td class="num">' + fmtNum(s.premium) + '</td>' +
            '<td class="num">' + fmtNum(s.commission) + '</td>' +
            '<td class="num">' + fmtPct(eff) + '</td>' +
        '</tr>';
    }).join('');
    return '<table class="branch-table"><thead><tr>' +
        '<th>חודש</th>' +
        '<th class="num">פוליסות</th>' +
        '<th class="num">פרמיה נטו</th>' +
        '<th class="num">עמלה</th>' +
        '<th class="num">% אפקטיבי</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>';
}

function renderRecordsTable() {
    const sorted = [...allRecords].sort((a, b) => {
        if ((b.commissionGap || 0) !== (a.commissionGap || 0)) return (a.commissionGap || 0) - (b.commissionGap || 0);
        return (b.netPremium || 0) - (a.netPremium || 0);
    });
    const rows = sorted.slice(0, 500).map(r => {
        let gapHtml = '<span class="badge-status badge-na">אין הסכם</span>';
        if (r.expectedCommission !== null && r.expectedCommission !== undefined) {
            const gap = r.commissionGap || 0;
            const gapPct = r.expectedCommission > 0 ? (gap / r.expectedCommission * 100) : 0;
            const cls = gap < 0 ? 'gap-neg' : 'gap-pos';
            const sign = gap > 0 ? '+' : '';
            gapHtml = '<span class="num ' + cls + '">' + sign + fmtNum(gap) + ' ₪';
            if (Math.abs(gapPct) >= 3) gapHtml += ' (' + Math.round(gapPct) + '%)';
            gapHtml += '</span>';
        }
        return '<tr>' +
            '<td>' + escapeHtml(r.productionMonth || '') + '</td>' +
            '<td>' + escapeHtml(r.insurer || '') + '</td>' +
            '<td>' + escapeHtml(r.policyNumber || '') + '</td>' +
            '<td>' + escapeHtml(r.insuredName || '') + '</td>' +
            '<td>' + escapeHtml(r.branchCode || '') + '</td>' +
            '<td>' + escapeHtml(r.branchName || '') + '</td>' +
            '<td>' + escapeHtml(r.transactionType || '') + '</td>' +
            '<td class="num">' + fmtNum(r.netPremium) + '</td>' +
            '<td class="num">' + fmtNum(r.commissionPaid) + '</td>' +
            '<td class="num">' + (r.expectedCommission !== null && r.expectedCommission !== undefined ? fmtNum(r.expectedCommission) : '-') + '</td>' +
            '<td>' + gapHtml + '</td>' +
        '</tr>';
    }).join('');
    return '<div style="overflow-x:auto;"><table class="records-table"><thead><tr>' +
        '<th>חודש</th>' +
        '<th>מבטח</th>' +
        '<th>פוליסה</th>' +
        '<th>מבוטח</th>' +
        '<th>קוד ענף</th>' +
        '<th>שם ענף</th>' +
        '<th>סוג</th>' +
        '<th class="num">פרמיה נטו</th>' +
        '<th class="num">עמלה ששולמה</th>' +
        '<th class="num">עמלה צפויה</th>' +
        '<th>פער</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
        (sorted.length > 500 ? '<div style="text-align:center;padding:12px;color:var(--gray-400);font-size:12px;">מציג 500 ראשונות מתוך ' + sorted.length + '</div>' : '');
}

function reload() { loadAll(); }

// ===== Upload =====
let _previewedFiles = []; // [{file, detectedInsurer}]

function openUploadModal() {
    document.getElementById('uploadModal').classList.add('show');
    document.getElementById('uploadStatus').innerHTML = '';
    document.getElementById('uploadFile').value = '';
    document.getElementById('filePreview').style.display = 'none';
    document.getElementById('filePreview').innerHTML = '';
    _previewedFiles = [];
}
function closeUploadModal() {
    document.getElementById('uploadModal').classList.remove('show');
}

const KNOWN_INSURERS = ['מנורה','שלמה','הכשרה','מגדל','הראל','שירביט','פניקס','איילון','כלל'];

// Try to figure out the insurer from a file. Strategy in order:
//   1. HTML files — read title "קליטת פרודוקציה מחברת ביטוח X"
//   2. Filename contains a Hebrew insurer name
//   3. Filename pattern hints (doh_tfukat_sohnim → שלמה)
//   4. Extension fallback (.csv → מנורה, .xls/.xlsx → שלמה — current single-source-per-format setup)
async function detectInsurerFromFile(file) {
    const name = file.name;
    const lower = name.toLowerCase();

    // 1. HTML title
    if (lower.endsWith('.html') || lower.endsWith('.htm')) {
        try {
            const slice = file.slice(0, 4096);
            const buf = await slice.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let txt = '';
            for (let i = 0; i < bytes.length; i++) {
                const b = bytes[i];
                if (b >= 0xE0 && b <= 0xFA) txt += String.fromCharCode(0x05D0 + (b - 0xE0));
                else if (b < 0x80) txt += String.fromCharCode(b);
                else txt += ' ';
            }
            const m = txt.match(/קליטת פרודוקציה מחברת ביטוח\s+(\S+)/);
            if (m) return normalizeInsurer(m[1]);
        } catch (_) { /* fall through */ }
    }

    // 2. Hebrew insurer name in filename
    const fromName = normalizeInsurer(name);
    if (fromName) return fromName;

    // 3. Known filename patterns
    if (/doh[_-]?tfukat[_-]?sohnim/i.test(lower)) return 'שלמה';

    // 4. Extension fallback (single-source-per-format)
    if (lower.endsWith('.csv')) return 'מנורה';
    if (lower.endsWith('.xls') || lower.endsWith('.xlsx')) return 'שלמה';

    return null;
}

function normalizeInsurer(name) {
    if (!name) return null;
    for (const k of KNOWN_INSURERS) {
        if (name.includes(k)) return k;
    }
    return null;
}

async function onFilesSelected() {
    const files = Array.from(document.getElementById('uploadFile').files);
    const preview = document.getElementById('filePreview');
    if (files.length === 0) { preview.style.display = 'none'; preview.innerHTML = ''; _previewedFiles = []; return; }

    _previewedFiles = [];
    const rows = [];
    for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const detected = normalizeInsurer(await detectInsurerFromFile(f));
        _previewedFiles.push({ file: f, detectedInsurer: detected });
        const sizeKb = (f.size / 1024).toFixed(1);
        const tag = detected
            ? '<span style="background:#D1FAE5;color:#065F46;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">✓ ' + detected + '</span>'
            : '<span style="background:#FEF3CD;color:#856404;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">לא זוהה — ישתמש בברירת מחדל</span>';
        rows.push(
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;margin-bottom:6px;font-size:12px;">' +
                '<div style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-left:8px;">' + (i+1) + '. ' + escapeHTML(f.name) + ' <span style="color:#9CA3AF;">(' + sizeKb + ' KB)</span></div>' +
                tag +
            '</div>'
        );
    }
    preview.innerHTML = rows.join('');
    preview.style.display = 'block';
}

function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function submitUpload() {
    const fallbackInsurer = document.getElementById('uploadInsurer').value;
    const replaceExisting = document.getElementById('uploadReplace').checked;
    const status = document.getElementById('uploadStatus');
    const btn = document.getElementById('uploadSubmit');

    if (_previewedFiles.length === 0) {
        status.innerHTML = '<div class="upload-status err">בחר קובץ אחד או יותר</div>';
        return;
    }

    btn.disabled = true; btn.textContent = 'מעלה...';
    let okCount = 0, failCount = 0, totalRows = 0;
    const log = [];

    for (let i = 0; i < _previewedFiles.length; i++) {
        const { file, detectedInsurer } = _previewedFiles[i];
        const insurer = detectedInsurer || fallbackInsurer;
        log.push('<div style="font-size:12px;padding:4px 0;">⏳ (' + (i+1) + '/' + _previewedFiles.length + ') ' + escapeHTML(file.name) + ' → ' + insurer + '...</div>');
        status.innerHTML = log.join('');
        try {
            const buf = await file.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binary = '';
            for (let j = 0; j < bytes.byteLength; j++) binary += String.fromCharCode(bytes[j]);
            const base64 = btoa(binary);

            const res = await fetch(API + '/dashboard/production', {
                method: 'POST',
                headers: Object.assign({ 'Content-Type': 'application/json' }, authHdr()),
                body: JSON.stringify({ insurer, fileName: file.name, csvBase64: base64, replaceExisting })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'שגיאה');
            okCount++;
            totalRows += (data.rowsImported || 0);
            log[log.length - 1] = '<div style="font-size:12px;padding:4px 0;color:#065F46;">✅ (' + (i+1) + '/' + _previewedFiles.length + ') ' + escapeHTML(file.name) + ' → ' + insurer + ' — ' + data.rowsImported + ' שורות</div>';
        } catch (err) {
            failCount++;
            log[log.length - 1] = '<div style="font-size:12px;padding:4px 0;color:#991B1B;">⚠️ (' + (i+1) + '/' + _previewedFiles.length + ') ' + escapeHTML(file.name) + ' — ' + (err.message || 'שגיאה') + '</div>';
        }
        status.innerHTML = log.join('');
    }

    const summary = '<div style="margin-top:8px;padding:8px;border-radius:6px;background:' + (failCount ? '#FEF3CD' : '#D1FAE5') + ';font-weight:700;font-size:13px;">' +
        'סיכום: ' + okCount + ' הצליחו, ' + failCount + ' נכשלו, סה״כ ' + totalRows + ' שורות.</div>';
    status.innerHTML = log.join('') + summary;
    btn.disabled = false; btn.textContent = 'העלה';
    if (okCount > 0) {
        loadAll();
        // Auto-close on full success; on partial/full failure leave open so the user can read errors.
        if (failCount === 0) setTimeout(() => closeUploadModal(), 1500);
    }
}

async function deleteUpload(id) {
    if (!confirm('למחוק את ההעלאה הזו ואת כל הפוליסות שבה?')) return;
    try {
        const res = await fetch(API + '/dashboard/production/uploads/' + id, {
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
