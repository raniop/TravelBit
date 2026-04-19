const XLSX = require('xlsx');
const { verifyAuth, cors } = require('../_lib/auth');

// SharePoint direct download URL (uses download.aspx for reliable server-side fetch)
const SHAREPOINT_URL = 'https://ophirins-my.sharepoint.com/personal/liorophir_ophirins_co_il/_layouts/15/download.aspx?share=IQAhhU0KB6cGSLPVEXPPgyv9AeBbsdZEG7GOcQwjNM9usM4';

// Cache: store parsed data for 5 minutes to avoid hammering SharePoint
let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000;

// Hebrew month names in order (fiscal year starting December)
const MONTH_NAMES = ['דצמבר', 'ינואר', 'פברואר', 'מרץ', 'אפריל'];

// Category detection based on product name
function detectCategory(product) {
    if (!product) return 'risk';
    const p = product.trim();
    if (/פנסיה|קרן השתלמות/.test(p) && !/ריסק|בריאות|הכנסה|מחלות/.test(p)) return 'pension';
    if (/גמל|קופת גמל|פיננס/.test(p)) return 'finance';
    return 'risk';
}

// Status detection from Hebrew text
function detectStatus(text) {
    if (!text) return '';
    if (/הופק/.test(text)) return 'issued';
    if (/ממתין|נשלח|לבדוק|לעדכן|בעבודה/.test(text)) return 'pending';
    return '';
}

function parseSheet(ws) {
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rows || rows.length < 2) return { sales: [], totals: { sikunim: 0, pension: 0, finance: 0 }, targets: {} };

    const header = rows[0].map(h => (h || '').toString().trim());

    // Find column indices
    const colMap = {};
    header.forEach((h, i) => {
        if (/שם לקוח/.test(h)) colMap.name = i;
        if (/מוצר סיכונים/.test(h)) colMap.product = i;
        if (/פרמיה חודשית/.test(h)) colMap.monthlyPremium = i;
        if (/פרמיה שנתית/.test(h)) colMap.yearlyPremium = i;
        if (/סכום ביטוח/.test(h)) colMap.sumInsured = i;
        if (/^פנסיה$/.test(h)) colMap.pension = i;
        if (/ניוד פנסיה/.test(h)) colMap.pensionTransfer = i;
        if (/^פיננסים/.test(h)) colMap.finance = i;
        if (/שם חברה/.test(h)) colMap.company = i;
        if (/הופק|לא הופק/.test(h)) colMap.status = i;
        if (/שכר מבוטח/.test(h)) colMap.salary = i;
        if (/תאריך מכירה/.test(h)) colMap.saleDate = i;
    });

    // Find targets in the right side columns
    const targets = {};
    let targetValueCol = -1; // The column where target values live (next to label)
    for (const row of rows.slice(1, 5)) {
        for (let c = 0; c < row.length; c++) {
            const val = (row[c] || '').toString().trim();
            if (/^יעד סיכונים/.test(val)) { targets.sikunim = toNum(row[c + 1]); targetValueCol = c + 1; }
            if (/^יעד פנסיה/.test(val)) targets.pensia = toNum(row[c + 1]);
            if (/^יעד פיננסים/.test(val)) targets.finansim = toNum(row[c + 1]);
        }
    }

    // Row 7 (Excel row 8) col Q = yearly pension target
    // Row 8 (Excel row 9) col Q = yearly finance target
    if (targetValueCol > 0) {
        if (rows[7]) {
            const yearlyPensionVal = toNum(rows[7][targetValueCol]);
            if (yearlyPensionVal > 0) targets.pensiaYearly = yearlyPensionVal;
        }
        if (rows[8]) {
            const yearlyFinanceVal = toNum(rows[8][targetValueCol]);
            if (yearlyFinanceVal > 0) targets.finansimYearly = yearlyFinanceVal;
        }
    }

    // Also look for "נותר ליעד" and "יעד למבצע" columns
    for (const row of rows.slice(1, 5)) {
        for (let c = 0; c < row.length; c++) {
            const val = (row[c] || '').toString().trim();
            if (/יעד למבצע/.test(val)) targets.campaign = toNum(row[c]);
        }
    }

    // Parse sales rows
    const sales = [];
    let totalSikunim = 0;
    let totalPension = 0;
    let totalFinance = 0;

    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const name = (row[colMap.name] || '').toString().trim();
        if (!name) continue;

        const product = (row[colMap.product] || '').toString().trim();
        const monthlyPremium = toNum(row[colMap.monthlyPremium]);
        const yearlyPremium = toNum(row[colMap.yearlyPremium]);
        const pension = toNum(row[colMap.pension]);
        const pensionTransfer = toNum(row[colMap.pensionTransfer]);
        const finance = toNum(row[colMap.finance]);
        const company = colMap.company !== undefined ? (row[colMap.company] || '').toString().trim() : '';
        const statusText = colMap.status !== undefined ? (row[colMap.status] || '').toString().trim() : '';
        const salary = toNum(row[colMap.salary]);

        // Skip empty data rows
        if (!product && !monthlyPremium && !pension && !finance && !salary) continue;

        const category = pension > 0 || salary > 0 ? 'pension' : detectCategory(product);
        const status = detectStatus(statusText);

        // Calculate pension contribution from salary if pension column is 0
        const pensionAmount = pension > 0 ? pension : (salary > 0 ? Math.round(salary * 2.4) : 0);

        const financeCol = colMap.finance !== undefined ? toNum(row[colMap.finance]) : 0;
        // Also check second finance column if it exists
        let financeAmount = financeCol;
        if (colMap.finance !== undefined && row[colMap.finance + 1]) {
            const secondFinance = toNum(row[colMap.finance + 1]);
            if (secondFinance > 0) financeAmount = secondFinance;
        }

        totalSikunim += monthlyPremium;
        totalPension += pensionAmount + (pensionTransfer || 0);
        totalFinance += financeAmount;

        sales.push({
            name,
            product: product || (salary > 0 ? 'פנסיה' : ''),
            category,
            monthlyPremium,
            yearlyPremium,
            pension: pensionAmount + (pensionTransfer || 0),
            finance: financeAmount,
            company,
            status
        });
    }

    return {
        sales,
        totals: {
            sikunim: totalSikunim,
            pension: totalPension,
            finance: totalFinance
        },
        targets
    };
}

function toNum(val) {
    if (val === null || val === undefined || val === '') return 0;
    const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[,₪\s]/g, ''));
    return isNaN(n) ? 0 : n;
}

async function fetchAndParse() {
    // Check cache
    if (cache.data && Date.now() - cache.timestamp < CACHE_TTL) {
        return cache.data;
    }

    const res = await fetch(SHAREPOINT_URL, {
        redirect: 'follow',
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Travelins/1.0)'
        }
    });

    if (!res.ok) {
        throw new Error(`SharePoint returned ${res.status}: ${res.statusText}`);
    }

    const buffer = await res.arrayBuffer();
    const wb = XLSX.read(Buffer.from(buffer), { type: 'buffer' });

    const months = {};
    let globalTargets = { sikunim: 4000, pensia: 480000, pensiaYearly: 0, finansim: 1000000, finansimYearly: 0 };

    for (const sheetName of wb.SheetNames) {
        // Skip non-month sheets
        const trimmed = sheetName.trim();
        if (/אלמנטרי/.test(trimmed)) continue;

        const ws = wb.Sheets[sheetName];
        const parsed = parseSheet(ws);

        months[trimmed] = {
            sales: parsed.sales,
            totals: parsed.totals
        };

        // Use targets from the first sheet that has them
        if (parsed.targets.sikunim) globalTargets.sikunim = parsed.targets.sikunim;
        if (parsed.targets.pensia) globalTargets.pensia = parsed.targets.pensia;
        if (parsed.targets.finansim) globalTargets.finansim = parsed.targets.finansim;
        if (parsed.targets.pensiaYearly) globalTargets.pensiaYearly = parsed.targets.pensiaYearly;
        if (parsed.targets.finansimYearly) globalTargets.finansimYearly = parsed.targets.finansimYearly;
    }

    const result = {
        targets: globalTargets,
        months,
        monthOrder: wb.SheetNames.filter(n => !/אלמנטרי/.test(n.trim())).map(n => n.trim()),
        lastUpdated: new Date().toISOString()
    };

    cache = { data: result, timestamp: Date.now() };
    return result;
}

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = await verifyAuth(req);
    if (!user) return res.status(401).json({ message: 'אין הרשאת גישה.' });

    try {
        const data = await fetchAndParse();
        res.json(data);
    } catch (err) {
        console.error('Yeadim API error:', err);
        res.status(500).json({ message: 'שגיאה בטעינת נתוני יעדים.', error: err.message });
    }
};
