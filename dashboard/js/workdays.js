// Workdays Page JS
let workdaysChart;

document.addEventListener('DOMContentLoaded', () => {
    initUser();
    loadWorkdays();
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

async function loadWorkdays() {
    const year = document.getElementById('yearFilter').value;

    try {
        const res = await apiFetch(`/dashboard/workdays?year=${year}`);
        if (!res || !res.ok) return;
        const data = await res.json();

        document.getElementById('yearLabel').textContent = `שנת ${data.year}`;

        renderMonthlyChart(data.monthlyWorkdays);
        renderWorkdaysTable(data.workdaysByEmployee);
    } catch (err) {
        console.error('Error loading workdays:', err);
    }
}

function renderMonthlyChart(data) {
    const ctx = document.getElementById('monthlyWorkdaysChart').getContext('2d');
    const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

    // Fill all 12 months
    const monthData = new Array(12).fill(0);
    data.forEach(d => {
        monthData[d._id - 1] = d.totalWorkdays;
    });

    if (workdaysChart) workdaysChart.destroy();
    workdaysChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [{
                label: 'ימי עבודה בחו"ל',
                data: monthData,
                backgroundColor: 'rgba(139, 92, 246, 0.8)',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            }
        }
    });
}

function renderWorkdaysTable(employees) {
    const tbody = document.getElementById('workdaysTable');

    if (!employees || employees.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><h3>אין נתונים</h3><p>לא נמצאו ימי עבודה בחו"ל לשנה זו</p></div></td></tr>`;
        return;
    }

    tbody.innerHTML = employees.map(e => `
        <tr>
            <td><strong>${esc(e.employeeName)}</strong></td>
            <td>${esc(e.department || '-')}</td>
            <td><span style="font-weight:700; font-size:16px; color:var(--primary);">${e.totalWorkdays}</span> ימים</td>
            <td>${e.totalTrips}</td>
            <td>${e.destinations.map(d => `<span class="badge badge-planned" style="margin:2px;">${esc(d)}</span>`).join(' ')}</td>
        </tr>
    `).join('');
}

function exportWorkdays() {
    const token = getToken();
    window.open(`/api/dashboard/export/workdays?token=${token}`, '_blank');
}

function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
