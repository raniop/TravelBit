// Dashboard Auth Module
const API_BASE = '/api';

// Determine default landing page based on company's dashboardModules
function getDefaultDashboard(user) {
    if (!user) return '/dashboard/';
    const modules = user.dashboardModules || 'management';
    // insurance-only → go to bituhofir dashboard
    if (modules === 'insurance') return '/dashboard/bituhofir.html';
    // management or both → go to general dashboard
    return '/dashboard/';
}

// Check which pages this user is allowed to visit
function isPageAllowed(user, currentPage) {
    if (!user) return true; // let auth check handle it
    const modules = user.dashboardModules || 'management';

    const isBituhofirPage = currentPage.includes('bituhofir') || currentPage.includes('policies') || currentPage.includes('agents') || currentPage.includes('reports');
    const isManagementPage = !isBituhofirPage && !currentPage.includes('login');

    if (modules === 'both') return true;
    if (modules === 'insurance' && isManagementPage) return false;
    if (modules === 'management' && isBituhofirPage) return false;
    return true;
}

// Check if already logged in
(async function() {
    const token = localStorage.getItem('dash_token');
    const currentPage = window.location.pathname;

    if (token && currentPage.includes('login')) {
        let user = null;
        try { user = JSON.parse(localStorage.getItem('dash_user')); } catch(_) {}

        // Always refresh user data from server to get latest dashboardModules
        if (user) {
            try {
                const res = await fetch(`${API_BASE}/auth/me`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.user) {
                        if (data.user.companyName) user.companyName = data.user.companyName;
                        if (data.user.hasBituhOfir !== undefined) user.hasBituhOfir = data.user.hasBituhOfir;
                        if (data.user.dashboardModules) user.dashboardModules = data.user.dashboardModules;
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

    // If logged in and on a dashboard page, check access + sync
    if (token && !currentPage.includes('login')) {
        let user = null;
        try { user = JSON.parse(localStorage.getItem('dash_user')); } catch(_) {}

        // Redirect if user doesn't have access to this page
        if (user && !isPageAllowed(user, currentPage)) {
            window.location.href = getDefaultDashboard(user);
            return;
        }

        // Always sync user data from server to get latest dashboardModules
        if (user) {
            try {
                const res = await fetch(`${API_BASE}/auth/me`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.user) {
                        if (data.user.companyName) user.companyName = data.user.companyName;
                        if (data.user.hasBituhOfir !== undefined) user.hasBituhOfir = data.user.hasBituhOfir;
                        if (data.user.dashboardModules) user.dashboardModules = data.user.dashboardModules;
                        localStorage.setItem('dash_user', JSON.stringify(user));
                        // Re-check access after sync - redirect if no longer allowed
                        if (!isPageAllowed(user, currentPage)) {
                            window.location.href = getDefaultDashboard(user);
                            return;
                        }
                        // Update sidebar visibility with fresh data
                        updateSidebarVisibility();
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

// Sync user data from server (companyName, dashboardModules, hasBituhOfir)
// Returns the (possibly updated) user object
async function syncCompanyName() {
    let user = getUser();
    if (!user) return user;

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
                if (data.user.dashboardModules) user.dashboardModules = data.user.dashboardModules;
                localStorage.setItem('dash_user', JSON.stringify(user));
            }
        }
    } catch(_) {}
    return user;
}

// Hide/show sidebar sections based on dashboardModules
function updateSidebarVisibility() {
    const user = getUser();
    if (!user) return;
    const modules = user.dashboardModules || 'management';

    // Hide bituhofir section if no insurance access
    const bituhofirSection = document.getElementById('bituhofirSection');
    if (bituhofirSection && modules === 'management') {
        bituhofirSection.style.display = 'none';
        let el = bituhofirSection.nextElementSibling;
        while (el && el.tagName === 'A') {
            el.style.display = 'none';
            el = el.nextElementSibling;
        }
    }

    // Hide management section if insurance-only
    const managementSection = document.getElementById('managementSection');
    if (managementSection && modules === 'insurance') {
        managementSection.style.display = 'none';
        let el = managementSection.nextElementSibling;
        // Hide links until we reach the bituhofirSection divider
        while (el && el.id !== 'bituhofirSection') {
            el.style.display = 'none';
            el = el.nextElementSibling;
        }
    }
}
document.addEventListener('DOMContentLoaded', updateSidebarVisibility);
