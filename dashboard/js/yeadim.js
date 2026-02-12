// Yeadim (Targets) Dashboard - fetches live data from SharePoint Excel
(function () {
    'use strict';

    let TARGETS = { sikunim: 4000, pensia: 480000, finansim: 1000000 };
    let MONTHS_DATA = {};
    let MONTH_ORDER = [];
    let currentMonth = '';
    let barChart = null;
    let pieChart = null;

    // ===== Init =====
    async function init() {
        const user = typeof getUser === 'function' ? getUser() : null;
        if (user) {
            const nameEl = document.getElementById('userName');
            const avatarEl = document.getElementById('userAvatar');
            const companyEl = document.getElementById('companyName');
            if (nameEl) nameEl.textContent = user.name || user.companyName || 'חברה';
            if (avatarEl) avatarEl.textContent = (user.name || user.companyName || 'C').charAt(0);
            if (companyEl) companyEl.textContent = user.companyName || 'חברה';
        }

        await loadData();
    }

    // ===== Load Data from API =====
    async function loadData() {
        try {
            const res = await apiFetch('/dashboard/yeadim');
            if (!res || !res.ok) throw new Error('שגיאה בטעינת נתונים');
            const data = await res.json();

            TARGETS = data.targets || TARGETS;
            MONTHS_DATA = data.months || {};
            MONTH_ORDER = data.monthOrder || Object.keys(MONTHS_DATA);

            // Default to the last month that has sales data
            currentMonth = '';
            for (let i = MONTH_ORDER.length - 1; i >= 0; i--) {
                const m = MONTH_ORDER[i];
                if (MONTHS_DATA[m] && MONTHS_DATA[m].sales && MONTHS_DATA[m].sales.length > 0) {
                    currentMonth = m;
                    break;
                }
            }
            if (!currentMonth && MONTH_ORDER.length > 0) currentMonth = MONTH_ORDER[MONTH_ORDER.length - 1];

            buildMonthTabs();
            renderMonth(currentMonth);
        } catch (err) {
            console.error('Failed to load yeadim data:', err);
            document.getElementById('targetsSummary').innerHTML =
                '<div class="empty-month"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg><p>שגיאה בטעינת נתוני יעדים. נסה שוב מאוחר יותר.</p></div>';
        }
    }

    // ===== Month Tabs =====
    function buildMonthTabs() {
        const container = document.getElementById('monthTabs');
        // Clear existing tabs (keep label)
        const label = container.querySelector('label');
        container.innerHTML = '';
        if (label) container.appendChild(label);

        MONTH_ORDER.forEach(month => {
            const btn = document.createElement('button');
            btn.className = 'month-tab' + (month === currentMonth ? ' active' : '');
            btn.textContent = month;
            btn.addEventListener('click', () => {
                currentMonth = month;
                container.querySelectorAll('.month-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderMonth(month);
            });
            container.appendChild(btn);
        });
    }

    // ===== Render Month =====
    function renderMonth(month) {
        const data = MONTHS_DATA[month];
        if (!data) return;

        // Calculate cumulative totals up to and including current month
        const cumulative = { sikunim: 0, pension: 0, finance: 0 };
        for (const m of MONTH_ORDER) {
            const d = MONTHS_DATA[m];
            if (d && d.totals) {
                cumulative.sikunim += d.totals.sikunim || 0;
                cumulative.pension += d.totals.pension || 0;
                cumulative.finance += d.totals.finance || 0;
            }
            if (m === month) break;
        }

        renderTargetCards(data.totals || { sikunim: 0, pension: 0, finance: 0 }, cumulative);
        renderSalesTable(data.sales, month);
        renderCharts(data.totals || { sikunim: 0, pension: 0, finance: 0 }, cumulative);
    }

    // ===== Target Cards =====
    function renderTargetCards(monthTotals, cumulative) {
        const container = document.getElementById('targetsSummary');
        const remaining = {
            sikunim: Math.max(0, TARGETS.sikunim - monthTotals.sikunim),
            pensia: Math.max(0, TARGETS.pensia - cumulative.pension),
            finansim: Math.max(0, TARGETS.finansim - cumulative.finance)
        };
        const pct = {
            sikunim: TARGETS.sikunim ? Math.min(100, Math.round((monthTotals.sikunim / TARGETS.sikunim) * 100)) : 0,
            pensia: TARGETS.pensia ? Math.min(100, Math.round((cumulative.pension / TARGETS.pensia) * 100)) : 0,
            finansim: TARGETS.finansim ? Math.min(100, Math.round((cumulative.finance / TARGETS.finansim) * 100)) : 0
        };

        container.innerHTML = `
            <div class="target-card">
                <div class="target-card-header">
                    <div class="target-card-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    </div>
                    <div class="target-card-title">יעד סיכונים (חודשי)</div>
                </div>
                <div class="target-card-values">
                    <div class="target-achieved">${formatCurrency(monthTotals.sikunim)}</div>
                    <div class="target-goal">יעד: <span>${formatCurrency(TARGETS.sikunim)}</span></div>
                </div>
                <div class="target-progress-bar"><div class="target-progress-fill" style="width:${pct.sikunim}%"></div></div>
                <div class="target-progress-pct">${pct.sikunim}% — נותר ${formatCurrency(remaining.sikunim)}</div>
            </div>
            <div class="target-card">
                <div class="target-card-header">
                    <div class="target-card-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
                    </div>
                    <div class="target-card-title">יעד פנסיה (שנתי מצטבר)</div>
                </div>
                <div class="target-card-values">
                    <div class="target-achieved">${formatCurrency(cumulative.pension)}</div>
                    <div class="target-goal">יעד: <span>${formatCurrency(TARGETS.pensia)}</span></div>
                </div>
                <div class="target-progress-bar"><div class="target-progress-fill" style="width:${pct.pensia}%"></div></div>
                <div class="target-progress-pct">${pct.pensia}% — נותר ${formatCurrency(remaining.pensia)}</div>
            </div>
            <div class="target-card">
                <div class="target-card-header">
                    <div class="target-card-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                    </div>
                    <div class="target-card-title">יעד פיננסים (שנתי מצטבר)</div>
                </div>
                <div class="target-card-values">
                    <div class="target-achieved">${formatCurrency(cumulative.finance)}</div>
                    <div class="target-goal">יעד: <span>${formatCurrency(TARGETS.finansim)}</span></div>
                </div>
                <div class="target-progress-bar"><div class="target-progress-fill" style="width:${pct.finansim}%"></div></div>
                <div class="target-progress-pct">${pct.finansim}% — נותר ${formatCurrency(remaining.finansim)}</div>
            </div>
        `;
    }

    // ===== Sales Table =====
    function renderSalesTable(sales, month) {
        const section = document.getElementById('salesSection');
        const titleEl = document.getElementById('salesMonthTitle');
        const tbody = document.getElementById('salesTableBody');

        if (!sales || sales.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = '';
        titleEl.textContent = month;

        let totalPremium = 0, totalYearly = 0, totalPension = 0, totalFinance = 0;

        tbody.innerHTML = sales.map(s => {
            totalPremium += s.monthlyPremium || 0;
            totalYearly += s.yearlyPremium || 0;
            totalPension += s.pension || 0;
            totalFinance += s.finance || 0;

            const catBadge = s.category === 'risk' ? '<span class="badge-product badge-risk">סיכונים</span>'
                : s.category === 'pension' ? '<span class="badge-product badge-pension">פנסיה</span>'
                : '<span class="badge-product badge-finance">פיננסים</span>';

            const statusBadge = s.status === 'issued' ? '<span class="status-badge status-issued">הופק</span>'
                : s.status === 'pending' ? '<span class="status-badge status-pending">ממתין</span>'
                : '';

            return `<tr>
                <td><strong>${escapeHtml(s.name)}</strong></td>
                <td>${catBadge} ${escapeHtml(s.product)}</td>
                <td>${s.monthlyPremium ? formatCurrency(s.monthlyPremium) : '-'}</td>
                <td>${s.yearlyPremium ? formatCurrency(s.yearlyPremium) : '-'}</td>
                <td>${s.pension ? formatCurrency(s.pension) : '-'}</td>
                <td>${s.finance ? formatCurrency(s.finance) : '-'}</td>
                <td>${statusBadge}</td>
            </tr>`;
        }).join('');

        // Total row
        tbody.innerHTML += `<tr class="total-row">
            <td>סה"כ</td>
            <td></td>
            <td>${formatCurrency(totalPremium)}</td>
            <td>${formatCurrency(totalYearly)}</td>
            <td>${formatCurrency(totalPension)}</td>
            <td>${formatCurrency(totalFinance)}</td>
            <td></td>
        </tr>`;
    }

    // ===== Charts =====
    function renderCharts(monthTotals, cumulative) {
        const chartsRow = document.getElementById('chartsRow');
        chartsRow.style.display = '';

        // Bar chart: target vs achieved
        if (barChart) barChart.destroy();
        const barCtx = document.getElementById('targetsBarChart').getContext('2d');
        barChart = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: ['סיכונים (חודשי)', 'פנסיה (מצטבר)', 'פיננסים (מצטבר)'],
                datasets: [
                    {
                        label: 'הושג',
                        data: [monthTotals.sikunim, cumulative.pension, cumulative.finance],
                        backgroundColor: ['#EF4444', '#3B82F6', '#00B67A'],
                        borderRadius: 6,
                        barPercentage: 0.5
                    },
                    {
                        label: 'יעד',
                        data: [TARGETS.sikunim, TARGETS.pensia, TARGETS.finansim],
                        backgroundColor: ['#FECACA', '#BFDBFE', '#A7F3D0'],
                        borderRadius: 6,
                        barPercentage: 0.5
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { font: { family: 'Heebo', size: 12 }, usePointStyle: true, pointStyle: 'circle' } },
                    tooltip: {
                        rtl: true, textDirection: 'rtl',
                        callbacks: { label: ctx => ctx.dataset.label + ': ' + formatCurrency(ctx.raw) }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true, grid: { color: '#F1F5F9' },
                        ticks: { font: { family: 'Heebo', size: 11 }, callback: v => formatShort(v) }
                    },
                    x: { grid: { display: false }, ticks: { font: { family: 'Heebo', size: 11 } } }
                }
            }
        });

        // Pie chart: breakdown by category for current month
        if (pieChart) pieChart.destroy();
        const pieCtx = document.getElementById('salesPieChart').getContext('2d');
        pieChart = new Chart(pieCtx, {
            type: 'doughnut',
            data: {
                labels: ['סיכונים', 'פנסיה', 'פיננסים'],
                datasets: [{
                    data: [monthTotals.sikunim, monthTotals.pension || cumulative.pension, monthTotals.finance || cumulative.finance],
                    backgroundColor: ['#EF4444', '#3B82F6', '#00B67A'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: { position: 'bottom', labels: { font: { family: 'Heebo', size: 12 }, usePointStyle: true, pointStyle: 'circle', padding: 16 } },
                    tooltip: {
                        rtl: true, textDirection: 'rtl',
                        callbacks: { label: ctx => ctx.label + ': ' + formatCurrency(ctx.raw) }
                    }
                }
            }
        });
    }

    // ===== Helpers =====
    function formatCurrency(num) {
        if (!num && num !== 0) return '-';
        return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
    }

    function formatShort(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
        return num.toString();
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ===== Start =====
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
