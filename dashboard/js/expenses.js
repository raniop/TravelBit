// Expenses Page JS
let monthlyChart, destinationChart, employeeChart;

document.addEventListener('DOMContentLoaded', () => {
    initUser();
    loadExpenses();
});

function initUser() {
    const user = getUser();
    if (user) {
        const nameEl = document.getElementById('userName');
        const avatarEl = document.getElementById('userAvatar');
        const companyEl = document.getElementById('companyName');
        if (nameEl) nameEl.textContent = user.name || 'חברה';
        if (avatarEl) avatarEl.textContent = (user.name || 'C').charAt(0);
        if (companyEl) companyEl.textContent = user.name || 'חברה';
    }
}

async function loadExpenses() {
    try {
        const res = await apiFetch('/dashboard/expenses');
        if (!res || !res.ok) return;
        const data = await res.json();

        // Summary
        document.getElementById('totalCost').textContent = fmtCurrency(data.summary.totalCost);
        document.getElementById('totalTrips').textContent = data.summary.totalTrips;
        document.getElementById('avgCost').textContent = fmtCurrency(data.summary.avgCost);

        renderMonthlyChart(data.monthlyCosts);
        renderDestinationChart(data.costByDestination);
        renderEmployeeChart(data.costByEmployee);
    } catch (err) {
        console.error('Error loading expenses:', err);
    }
}

function renderMonthlyChart(data) {
    const ctx = document.getElementById('monthlyChart').getContext('2d');
    const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
    const labels = data.map(d => {
        const [y, m] = d._id.split('-');
        return months[parseInt(m) - 1];
    });

    if (monthlyChart) monthlyChart.destroy();
    monthlyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'הוצאות (₪)',
                data: data.map(d => d.totalCost),
                backgroundColor: 'rgba(255, 107, 44, 0.8)',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { callback: v => '₪' + v.toLocaleString() } }
            }
        }
    });
}

function renderDestinationChart(data) {
    const ctx = document.getElementById('destinationChart').getContext('2d');
    const colors = ['#FF6B2C', '#00B67A', '#0EA5E9', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4', '#84CC16'];

    if (destinationChart) destinationChart.destroy();
    destinationChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: data.map(d => d._id),
            datasets: [{
                data: data.map(d => d.totalCost),
                backgroundColor: colors.slice(0, data.length),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: 'Heebo' }, padding: 12 } },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.label}: ₪${ctx.parsed.toLocaleString()} (${ctx.raw} נסיעות)`
                    }
                }
            }
        }
    });
}

function renderEmployeeChart(data) {
    const ctx = document.getElementById('employeeChart').getContext('2d');
    const topEmployees = data.slice(0, 10);

    if (employeeChart) employeeChart.destroy();
    employeeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: topEmployees.map(d => d.employeeName),
            datasets: [{
                label: 'הוצאות (₪)',
                data: topEmployees.map(d => d.totalCost),
                backgroundColor: 'rgba(14, 165, 233, 0.8)',
                borderRadius: 6
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { beginAtZero: true, ticks: { callback: v => '₪' + v.toLocaleString() } }
            }
        }
    });
}

function fmtCurrency(amount) {
    if (!amount && amount !== 0) return '-';
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(amount);
}
