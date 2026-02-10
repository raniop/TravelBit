// Main Dashboard JS
let tripsChart, destinationsChart;

document.addEventListener('DOMContentLoaded', () => {
    initUser();
    loadOverview();
});

async function initUser() {
    let user = getUser();
    if (user) {
        const nameEl = document.getElementById('userName');
        const avatarEl = document.getElementById('userAvatar');
        const companyEl = document.getElementById('companyName');
        if (nameEl) nameEl.textContent = user.name || 'משתמש';
        if (avatarEl) avatarEl.textContent = (user.name || 'C').charAt(0);
        if (companyEl) companyEl.textContent = user.companyName || user.name || 'חברה';

        if (!user.companyName) {
            user = await syncCompanyName();
            if (user && user.companyName && companyEl) {
                companyEl.textContent = user.companyName;
            }
        }
    }
}

async function loadOverview() {
    try {
        const res = await apiFetch('/dashboard/overview');
        if (!res || !res.ok) return;
        const data = await res.json();

        // Update stats
        document.getElementById('statEmployees').textContent = data.stats.totalEmployees;
        document.getElementById('statTrips').textContent = data.stats.activeTrips;
        document.getElementById('statWorkdays').textContent = data.stats.workdaysThisMonth;
        document.getElementById('statAlerts').textContent = data.stats.expiringPolicies;
        document.getElementById('statCost').textContent = formatCurrency(data.stats.totalCost);
        document.getElementById('statMonthTrips').textContent = data.stats.monthTrips;

        // Render charts
        renderTripsChart(data.tripsByMonth);
        renderDestinationsChart(data.topDestinations);

        // Render recent trips
        renderRecentTrips(data.recentTrips);
    } catch (err) {
        console.error('Error loading overview:', err);
    }
}

function renderTripsChart(tripsByMonth) {
    const ctx = document.getElementById('tripsChart').getContext('2d');
    const labels = tripsByMonth.map(t => formatMonth(t._id));
    const counts = tripsByMonth.map(t => t.count);
    const costs = tripsByMonth.map(t => t.totalCost);

    if (tripsChart) tripsChart.destroy();
    tripsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'מספר נסיעות',
                    data: counts,
                    backgroundColor: 'rgba(255, 107, 44, 0.8)',
                    borderRadius: 6,
                    yAxisID: 'y'
                },
                {
                    label: 'עלות (₪)',
                    data: costs,
                    type: 'line',
                    borderColor: '#0EA5E9',
                    backgroundColor: 'rgba(14, 165, 233, 0.1)',
                    tension: 0.3,
                    fill: true,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { font: { family: 'Heebo' } } }
            },
            scales: {
                y: { beginAtZero: true, position: 'right', title: { display: true, text: 'נסיעות', font: { family: 'Heebo' } } },
                y1: { beginAtZero: true, position: 'left', grid: { drawOnChartArea: false }, title: { display: true, text: '₪', font: { family: 'Heebo' } } }
            }
        }
    });
}

function renderDestinationsChart(destinations) {
    const ctx = document.getElementById('destinationsChart').getContext('2d');
    const labels = destinations.map(d => d._id);
    const counts = destinations.map(d => d.count);
    const colors = ['#FF6B2C', '#00B67A', '#0EA5E9', '#8B5CF6', '#F59E0B'];

    if (destinationsChart) destinationsChart.destroy();
    destinationsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: counts,
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: 'Heebo' }, padding: 16 } }
            }
        }
    });
}

function renderRecentTrips(trips) {
    const tbody = document.getElementById('recentTrips');

    if (!trips || trips.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="6">
                <div class="empty-state">
                    <h3>אין נסיעות עדיין</h3>
                    <p>נסיעות עובדים יוצגו כאן</p>
                </div>
            </td></tr>
        `;
        return;
    }

    const statusMap = {
        planned: { label: 'מתוכנן', class: 'badge-planned' },
        active: { label: 'פעיל', class: 'badge-active' },
        completed: { label: 'הושלם', class: 'badge-completed' },
        cancelled: { label: 'בוטל', class: 'badge-cancelled' }
    };

    tbody.innerHTML = trips.map(t => {
        const emp = t.employeeId;
        const status = statusMap[t.status] || { label: t.status, class: '' };
        return `
            <tr>
                <td>${emp ? escapeHtml(emp.firstName + ' ' + emp.lastName) : '-'}</td>
                <td>${escapeHtml(t.destination)}</td>
                <td>${formatDate(t.departureDate)}</td>
                <td>${formatDate(t.returnDate)}</td>
                <td>${formatCurrency(t.cost)}</td>
                <td><span class="badge ${status.class}">${status.label}</span></td>
            </tr>
        `;
    }).join('');
}

// Utility functions
function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('he-IL');
}

function formatCurrency(amount) {
    if (!amount && amount !== 0) return '-';
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(amount);
}

function formatMonth(yearMonth) {
    if (!yearMonth) return '';
    const [year, month] = yearMonth.split('-');
    const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
    return months[parseInt(month) - 1] || yearMonth;
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
