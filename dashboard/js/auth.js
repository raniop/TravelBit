// Dashboard Auth Module
const API_BASE = '/api';

// Normalize dashboardModules: supports both old string format and new object format
function normModules(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return { management: raw.management !== false, insurance: raw.insurance === true, reminders: raw.reminders === true };
    }
    if (raw === 'insurance') return { management: false, insurance: true, reminders: false };
    if (raw === 'both') return { management: true, insurance: true, reminders: false };
    return { management: true, insurance: false, reminders: false };
}

// Determine default landing page based on company's dashboardModules + insurancePages
function getDefaultDashboard(user) {
    if (!user) return '/dashboard/';
    const modules = normModules(user.dashboardModules);
    const ip = user.insurancePages || { dashboard: true, policies: true, agents: true, reports: true };

    if (modules.management) return '/dashboard/';

    if (modules.insurance) {
        if (ip.dashboard !== false) return '/dashboard/bituhofir.html';
        if (ip.policies !== false) return '/dashboard/policies.html';
        if (ip.agents !== false) return '/dashboard/agents.html';
        if (ip.reports !== false) return '/dashboard/reports.html';
    }

    if (modules.reminders) return '/dashboard/reminders.html';

    return '/dashboard/';
}

// Check which pages this user is allowed to visit
function isPageAllowed(user, currentPage) {
    if (!user) return true; // let auth check handle it
    const modules = normModules(user.dashboardModules);
    const ip = user.insurancePages || { dashboard: true, policies: true, agents: true, reports: true };
    const rp = user.reminderPages || { agentAppointment: true, policyCancellations: true, newProductions: true, claims: true, firstDeposit: true, completingDeficiencies: true };

    // Determine page category
    let insurancePageType = null;
    if (currentPage.includes('bituhofir')) insurancePageType = 'dashboard';
    else if (currentPage.includes('policies')) insurancePageType = 'policies';
    else if (currentPage.includes('agents')) insurancePageType = 'agents';
    else if (currentPage.includes('reports')) insurancePageType = 'reports';

    const isRemindersPage = currentPage.includes('reminders') || currentPage.includes('reminder-detail');
    const isManagementPage = !insurancePageType && !isRemindersPage && !currentPage.includes('login');

    // Check module-level access
    if (isManagementPage && !modules.management) return false;
    if (insurancePageType && !modules.insurance) return false;
    if (isRemindersPage && !modules.reminders) return false;

    // Granular insurance page check
    if (insurancePageType && modules.insurance) {
        if (ip[insurancePageType] === false) return false;
    }

    // Granular reminder page check
    if (currentPage.includes('reminder-detail') && modules.reminders) {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const type = urlParams.get('type');
            if (type && rp[type] === false) return false;
        } catch(_) {}
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

        // Always refresh user data from server to get latest dashboardModules + insurancePages + reminderPages
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
                        if (data.user.hasReminders !== undefined) user.hasReminders = data.user.hasReminders;
                        if (data.user.dashboardModules) user.dashboardModules = data.user.dashboardModules;
                        if (data.user.insurancePages) user.insurancePages = data.user.insurancePages;
                        if (data.user.reminderPages) user.reminderPages = data.user.reminderPages;
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

        // Always sync user data from server to get latest dashboardModules + insurancePages + reminderPages
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
                        if (data.user.hasReminders !== undefined) user.hasReminders = data.user.hasReminders;
                        if (data.user.dashboardModules) user.dashboardModules = data.user.dashboardModules;
                        if (data.user.insurancePages) user.insurancePages = data.user.insurancePages;
                        if (data.user.reminderPages) user.reminderPages = data.user.reminderPages;
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

// ========== OTP Login Flow ==========
let _otpToken = null; // stored in memory only, not localStorage
let _otpResendTimer = null;

// Login form handler (Step 1)
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

            // OTP required — show Step 2
            if (data.otpRequired) {
                _otpToken = data.otpToken;
                showOtpStep(data.maskedPhone);
                return;
            }

            // Admin or direct login — save tokens
            completeLogin(data);
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.classList.add('show');
        } finally {
            btn.disabled = false;
            btn.textContent = 'כניסה';
        }
    });
}

// OTP form handler (Step 2)
const otpForm = document.getElementById('otpForm');
if (otpForm) {
    otpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorEl = document.getElementById('otpError');
        const btn = document.getElementById('otpBtn');

        const code = getOtpValue();
        if (code.length !== 6) {
            errorEl.textContent = 'נא להזין קוד בן 6 ספרות.';
            errorEl.classList.add('show');
            return;
        }

        btn.disabled = true;
        btn.textContent = 'מאמת...';
        errorEl.classList.remove('show');

        try {
            const res = await fetch(`${API_BASE}/auth/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ otpToken: _otpToken, otpCode: code })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'שגיאה באימות.');
            }

            completeLogin(data);
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.classList.add('show');
            clearOtpInputs();
        } finally {
            btn.disabled = false;
            btn.textContent = 'אימות';
        }
    });

    // OTP digit inputs — auto-advance + paste support
    const digits = otpForm.querySelectorAll('.otp-digit');
    digits.forEach((input, idx) => {
        input.addEventListener('input', (e) => {
            const val = e.target.value.replace(/[^0-9]/g, '');
            e.target.value = val.slice(0, 1);
            if (val && idx < 5) digits[idx + 1].focus();
            // Auto-submit when all 6 digits filled
            if (getOtpValue().length === 6) otpForm.requestSubmit();
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && idx > 0) {
                digits[idx - 1].focus();
            }
        });
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pasted = (e.clipboardData.getData('text') || '').replace(/[^0-9]/g, '').slice(0, 6);
            pasted.split('').forEach((ch, i) => {
                if (digits[i]) digits[i].value = ch;
            });
            if (pasted.length > 0) digits[Math.min(pasted.length, 5)].focus();
            if (pasted.length === 6) otpForm.requestSubmit();
        });
    });
}

// Back button
const otpBackBtn = document.getElementById('otpBackBtn');
if (otpBackBtn) {
    otpBackBtn.addEventListener('click', () => {
        _otpToken = null;
        showLoginStep();
    });
}

// Resend button
const otpResendBtn = document.getElementById('otpResendBtn');
if (otpResendBtn) {
    otpResendBtn.addEventListener('click', async () => {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        if (!username || !password) { showLoginStep(); return; }

        otpResendBtn.disabled = true;
        const errorEl = document.getElementById('otpError');
        errorEl.classList.remove('show');

        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            if (data.otpRequired) {
                _otpToken = data.otpToken;
                clearOtpInputs();
                startResendTimer();
            }
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.classList.add('show');
        }
    });
}

function showOtpStep(maskedPhone) {
    const loginStep = document.getElementById('loginStep');
    const otpStep = document.getElementById('otpStep');
    const phoneMask = document.getElementById('otpPhoneMask');
    if (loginStep) loginStep.style.display = 'none';
    if (otpStep) otpStep.style.display = 'block';
    if (phoneMask && maskedPhone) phoneMask.textContent = maskedPhone;
    clearOtpInputs();
    startResendTimer();
    // Focus first digit
    const firstDigit = document.querySelector('.otp-digit[data-index="0"]');
    if (firstDigit) setTimeout(() => firstDigit.focus(), 100);
}

function showLoginStep() {
    const loginStep = document.getElementById('loginStep');
    const otpStep = document.getElementById('otpStep');
    if (loginStep) loginStep.style.display = 'block';
    if (otpStep) otpStep.style.display = 'none';
    if (_otpResendTimer) { clearInterval(_otpResendTimer); _otpResendTimer = null; }
}

function getOtpValue() {
    const digits = document.querySelectorAll('.otp-digit');
    return Array.from(digits).map(d => d.value).join('');
}

function clearOtpInputs() {
    document.querySelectorAll('.otp-digit').forEach(d => { d.value = ''; });
}

function startResendTimer() {
    const resendBtn = document.getElementById('otpResendBtn');
    const timerEl = document.getElementById('otpTimer');
    if (_otpResendTimer) clearInterval(_otpResendTimer);

    let seconds = 60;
    if (resendBtn) resendBtn.disabled = true;
    if (timerEl) timerEl.textContent = `שליחה חוזרת אפשרית בעוד ${seconds} שניות`;

    _otpResendTimer = setInterval(() => {
        seconds--;
        if (timerEl) timerEl.textContent = seconds > 0 ? `שליחה חוזרת אפשרית בעוד ${seconds} שניות` : '';
        if (seconds <= 0) {
            clearInterval(_otpResendTimer);
            _otpResendTimer = null;
            if (resendBtn) resendBtn.disabled = false;
        }
    }, 1000);
}

function completeLogin(data) {
    if (data.user && data.user.role !== 'admin' && data.user.role !== 'company') {
        throw new Error('חשבון זה אינו חשבון חברה.');
    }
    localStorage.setItem('dash_token', data.accessToken);
    localStorage.setItem('dash_refresh', data.refreshToken);
    localStorage.setItem('dash_user', JSON.stringify(data.user));
    window.location.href = getDefaultDashboard(data.user);
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

// Sync user data from server (companyName, dashboardModules, hasBituhOfir, hasReminders, reminderPages)
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
                if (data.user.hasReminders !== undefined) user.hasReminders = data.user.hasReminders;
                if (data.user.dashboardModules) user.dashboardModules = data.user.dashboardModules;
                if (data.user.insurancePages) user.insurancePages = data.user.insurancePages;
                if (data.user.reminderPages) user.reminderPages = data.user.reminderPages;
                localStorage.setItem('dash_user', JSON.stringify(user));
            }
        }
    } catch(_) {}
    return user;
}

// Hide/show sidebar sections based on dashboardModules + insurancePages + reminderPages
function updateSidebarVisibility() {
    const user = getUser();
    if (!user) return;
    const modules = normModules(user.dashboardModules);
    const ip = user.insurancePages || { dashboard: true, policies: true, agents: true, reports: true };

    // Remove the head-injected init CSS (sidebar-init.js) so inline styles take over
    const initCss = document.getElementById('sidebar-init-css');
    if (initCss) initCss.remove();

    const managementSection = document.getElementById('managementSection');
    const bituhofirSection = document.getElementById('bituhofirSection');
    const remindersSection = document.getElementById('remindersSection');

    // Management section: show/hide
    if (managementSection) {
        managementSection.style.display = modules.management ? '' : 'none';
        let el = managementSection.nextElementSibling;
        while (el && el.id !== 'bituhofirSection' && el.id !== 'remindersSection') {
            el.style.display = modules.management ? '' : 'none';
            el = el.nextElementSibling;
        }
    }

    // Bituhofir section header + all insurance links
    if (bituhofirSection) {
        bituhofirSection.style.display = modules.insurance ? '' : 'none';
        let el = bituhofirSection.nextElementSibling;
        while (el && el.tagName === 'A' && el.id !== 'remindersSection') {
            el.style.display = modules.insurance ? '' : 'none';
            el = el.nextElementSibling;
        }
    }

    // Granular: hide individual insurance pages based on insurancePages
    if (modules.insurance) {
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
            if (bituhofirSection && visibleCount === 0) {
                bituhofirSection.style.display = 'none';
            }
        }
    }

    // Reminders section: show/hide
    if (remindersSection) {
        const rp = user.reminderPages || { agentAppointment: true, policyCancellations: true, newProductions: true, claims: true, firstDeposit: true, completingDeficiencies: true };
        remindersSection.style.display = modules.reminders ? '' : 'none';
        let el = remindersSection.nextElementSibling;
        while (el && el.tagName === 'A') {
            if (!modules.reminders) {
                el.style.display = 'none';
            } else {
                // Check granular reminder type links
                const href = el.getAttribute('href') || '';
                const typeMatch = href.match(/type=(\w+)/);
                if (typeMatch) {
                    el.style.display = rp[typeMatch[1]] === false ? 'none' : '';
                } else {
                    el.style.display = '';
                }
            }
            el = el.nextElementSibling;
        }
    }
}
// Run immediately (script is at bottom of body, DOM is ready)
updateSidebarVisibility();
