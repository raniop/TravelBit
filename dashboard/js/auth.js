// Dashboard Auth Module
const API_BASE = '/api';

// Determine default landing page based on company
function getDefaultDashboard(user) {
    const cName = user && (user.companyName || user.name || '');
    if (cName.includes('אופיר')) {
        return '/dashboard/bituhofir.html';
    }
    return '/dashboard/';
}

// Check if already logged in
(function() {
    const token = localStorage.getItem('dash_token');
    const currentPage = window.location.pathname;

    if (token && currentPage.includes('login')) {
        let user = null;
        try { user = JSON.parse(localStorage.getItem('dash_user')); } catch(_) {}
        window.location.href = getDefaultDashboard(user);
        return;
    }

    if (!token && !currentPage.includes('login')) {
        window.location.href = '/dashboard/login.html';
        return;
    }
})();

// Login form handler
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorEl = document.getElementById('loginError');
        const btn = document.getElementById('loginBtn');

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        if (!username || !password) {
            errorEl.textContent = 'נא למלא את כל השדות.';
            errorEl.classList.add('show');
            return;
        }

        btn.disabled = true;
        btn.textContent = 'מתחבר...';
        errorEl.classList.remove('show');

        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'שגיאה בהתחברות');
            }

            if (data.user.role !== 'company') {
                throw new Error('חשבון זה אינו חשבון חברה.');
            }

            localStorage.setItem('dash_token', data.accessToken);
            localStorage.setItem('dash_refresh', data.refreshToken);
            localStorage.setItem('dash_user', JSON.stringify(data.user));
            window.location.href = getDefaultDashboard(data.user);
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.classList.add('show');
        } finally {
            btn.disabled = false;
            btn.textContent = 'כניסה';
        }
    });
}

function getToken() {
    return localStorage.getItem('dash_token');
}

function getUser() {
    try {
        return JSON.parse(localStorage.getItem('dash_user'));
    } catch { return null; }
}

function logout() {
    localStorage.removeItem('dash_token');
    localStorage.removeItem('dash_refresh');
    localStorage.removeItem('dash_user');
    window.location.href = '/dashboard/login.html';
}

async function apiFetch(url, options = {}) {
    const token = getToken();
    const res = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers
        }
    });

    if (res.status === 401) {
        logout();
        return;
    }

    return res;
}
