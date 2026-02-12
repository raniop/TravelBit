// Admin Auth Module
const API_BASE = '/api';

// Check if already logged in
(function() {
    const token = localStorage.getItem('admin_token');
    const currentPage = window.location.pathname;

    if (token && currentPage.includes('login')) {
        window.location.href = '/admin';
        return;
    }

    if (!token && !currentPage.includes('login')) {
        window.location.href = '/admin/login';
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

            if (data.user.role !== 'admin') {
                throw new Error('אין לך הרשאת מנהל.');
            }

            localStorage.setItem('admin_token', data.accessToken);
            localStorage.setItem('admin_refresh', data.refreshToken);
            localStorage.setItem('admin_user', JSON.stringify(data.user));
            window.location.href = '/admin';
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.classList.add('show');
        } finally {
            btn.disabled = false;
            btn.textContent = 'כניסה';
        }
    });
}

// Auth helper functions
function getToken() {
    return localStorage.getItem('admin_token');
}

function getUser() {
    try {
        return JSON.parse(localStorage.getItem('admin_user'));
    } catch { return null; }
}

function logout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_refresh');
    localStorage.removeItem('admin_user');
    window.location.href = '/admin/login';
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
