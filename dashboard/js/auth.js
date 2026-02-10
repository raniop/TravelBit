// Dashboard Auth Module
const API_BASE = '/api';

// Determine default landing page based on company
function getDefaultDashboard(user) {
    if (user && user.hasBituhOfir) {
        return '/dashboard/bituhofir.html';
    }
    return '/dashboard/';
}

// Check if already logged in
(async function() {
    const token = localStorage.getItem('dash_token');
    const currentPage = window.location.pathname;

    if (token && currentPage.includes('login')) {
        let user = null;
        try { user = JSON.parse(localStorage.getItem('dash_user')); } catch(_) {}

        // If user data is missing companyName or hasBituhOfir, refresh from server
        if (user && (!user.companyName || user.hasBituhOfir === undefined)) {
            try {
                const res = await fetch(`${API_BASE}/auth/me`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.user) {
                        if (data.user.companyName) user.companyName = data.user.companyName;
                        if (data.user.hasBituhOfir !== undefined) user.hasBituhOfir = data.user.hasBituhOfir;
                        localStorage.setItem('dash_user', JSON.stringify(user));
                    }
                }
            } catch(_) {}
        }

        window.location.href = getDefaultDashboard(user);
        return;
    }

    if (!token && !currentPage.includes('login')) {
        window.location.href = '/dashboard/login.html';
        return;
    }

    // If logged in and on a dashboard page, check redirect + sync companyName
    if (token && !currentPage.includes('login')) {
        let user = null;
        try { user = JSON.parse(localStorage.getItem('dash_user')); } catch(_) {}

        // FIRST: Immediate redirect check
        if (user) {
            const correctPage = getDefaultDashboard(user);
            if (!currentPage.includes('bituhofir') && !currentPage.includes('policies') && correctPage.includes('bituhofir')) {
                window.location.href = correctPage;
                return;
            }
        }

        // THEN: Background sync companyName + hasBituhOfir for sidebar display
        if (user && (!user.companyName || user.hasBituhOfir === undefined)) {
            try {
                const res = await fetch(`${API_BASE}/auth/me`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.user) {
                        if (data.user.companyName) user.companyName = data.user.companyName;
                        if (data.user.hasBituhOfir !== undefined) user.hasBituhOfir = data.user.hasBituhOfir;
                        localStorage.setItem('dash_user', JSON.stringify(user));
                    }
                }
            } catch(_) {}
        }
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

// Sync companyName + hasBituhOfir from server if missing in localStorage
// Returns the (possibly updated) user object
async function syncCompanyName() {
    let user = getUser();
    if (!user || (user.companyName && user.hasBituhOfir !== undefined)) return user;

    try {
        const token = getToken();
        if (!token) return user;
        const res = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            if (data.user) {
                if (data.user.companyName) user.companyName = data.user.companyName;
                if (data.user.hasBituhOfir !== undefined) user.hasBituhOfir = data.user.hasBituhOfir;
                localStorage.setItem('dash_user', JSON.stringify(user));
            }
        }
    } catch(_) {}
    return user;
}

// Hide bituhofir sidebar section for companies without access
function updateBituhofirVisibility() {
    const user = getUser();
    const section = document.getElementById('bituhofirSection');
    if (!section) return;
    if (!user || !user.hasBituhOfir) {
        // Hide the section header and its two sibling links
        section.style.display = 'none';
        let el = section.nextElementSibling;
        while (el && el.tagName === 'A') {
            el.style.display = 'none';
            el = el.nextElementSibling;
        }
    }
}
document.addEventListener('DOMContentLoaded', updateBituhofirVisibility);
