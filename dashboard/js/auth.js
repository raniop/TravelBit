// Dashboard Auth Module
const API_BASE = '/api';

// Determine default landing page based on company's dashboardModules + insurancePages
function getDefaultDashboard(user) {
    if (!user) return '/dashboard/';
    const modules = user.dashboardModules || 'management';
    const ip = user.insurancePages || { dashboard: true, policies: true, agents: true, reports: true };

    if (modules === 'insurance') {
        // Find first allowed insurance page
        if (ip.dashboard !== false) return '/dashboard/bituhofir.html';
        if (ip.policies !== false) return '/dashboard/policies.html';
        if (ip.agents !== false) return '/dashboard/agents.html';
        if (ip.reports !== false) return '/dashboard/reports.html';
        return '/dashboard/'; // fallback
    }
    // management or both → go to general dashboard
    return '/dashboard/';
}

// Check which pages this user is allowed to visit
function isPageAllowed(user, currentPage) {
    if (!user) return true; // let auth check handle it
    const modules = user.dashboardModules || 'management';
    const ip = user.insurancePages || { dashboard: true, policies: true, agents: true, reports: true };

    // Map current page to insurance page type
    let insurancePageType = null;
    if (currentPage.includes('bituhofir')) insurancePageType = 'dashboard';
    else if (currentPage.includes('policies')) insurancePageType = 'policies';
    else if (currentPage.includes('agents')) insurancePageType = 'agents';
    else if (currentPage.includes('reports')) insurancePageType = 'reports';

    const isManagementPage = !insurancePageType && !currentPage.includes('login');

    // Management-only: no insurance pages
    if (modules === 'management' && insurancePageType) return false;
    // Insurance-only: no management pages
    if (modules === 'insurance' && isManagementPage) return false;

    // Granular insurance page check
    if (insurancePageType && (modules === 'insurance' || modules === 'both')) {
        if (ip[insurancePageType] === false) return false;
    }

    return true;
}

// Check if already logged in
(async function() {
    const token = localStorage.getItem('dash_token');
    const currentPage = window.location.pathname;

    if (token && currentPage.includes('login')) {
        let user = null;
        try { user = JSON.parse(localStorage.getItem('dash_user')); } catch(_) {}

        // Always refresh user data from server to get latest dashboardModules + insurancePages
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
                        if (data.user.insurancePages) user.insurancePages = data.user.insurancePages;
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

        // Always sync user data from server to get latest dashboardModules + insurancePages
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
                        if (data.user.insurancePages) user.insurancePages = data.user.insurancePages;
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
                if (data.user.insurancePages) user.insurancePages = data.user.insurancePages;
                localStorage.setItem('dash_user', JSON.stringify(user));
            }
        }
    } catch(_) {}
    return user;
}

// Hide/show sidebar sections based on dashboardModules + insurancePages
function updateSidebarVisibility() {
    const user = getUser();
    if (!user) return;
    const modules = user.dashboardModules || 'management';
    const ip = user.insurancePages || { dashboard: true, policies: true, agents: true, reports: true };

    // Remove the head-injected init CSS (sidebar-init.js) so inline styles take over
    const initCss = document.getElementById('sidebar-init-css');
    if (initCss) initCss.remove();

    const bituhofirSection = document.getElementById('bituhofirSection');
    const managementSection = document.getElementById('managementSection');
    const showManagement = (modules === 'management' || modules === 'both');
    const showInsurance = (modules === 'insurance' || modules === 'both');

    // Management section: show/hide
    if (managementSection) {
        managementSection.style.display = showManagement ? '' : 'none';
        let el = managementSection.nextElementSibling;
        while (el && el.id !== 'bituhofirSection') {
            el.style.display = showManagement ? '' : 'none';
            el = el.nextElementSibling;
        }
    }

    // Bituhofir section header + all insurance links: first set all based on showInsurance
    if (bituhofirSection) {
        bituhofirSection.style.display = showInsurance ? '' : 'none';
        let el = bituhofirSection.nextElementSibling;
        while (el && el.tagName === 'A') {
            el.style.display = showInsurance ? '' : 'none';
            el = el.nextElementSibling;
        }
    }

    // Granular: hide individual insurance pages based on insurancePages
    if (showInsurance) {
        const nav = document.querySelector('.sidebar-nav');
        if (nav) {
            const pageMap = { 'bituhofir': 'dashboard', 'policies': 'policies', 'agents': 'agents', 'reports': 'reports' };
            let visibleCount = 0;
            nav.querySelectorAll('a').forEach(link => {
                const href = link.getAttribute('href') || '';
                for (const [urlPart, pageKey] of Object.entries(pageMap)) {
                    if (href.includes(urlPart)) {
                        if (ip[pageKey] === false) {
                            link.style.display = 'none';
                        } else {
                            visibleCount++;
                        }
                    }
                }
            });
            // If all insurance pages hidden, hide section header too
            if (bituhofirSection && visibleCount === 0) {
                bituhofirSection.style.display = 'none';
            }
        }
    }
}
// Run immediately (script is at bottom of body, DOM is ready)
updateSidebarVisibility();
