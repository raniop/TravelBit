// Sidebar Init - runs in <head> BEFORE body renders to prevent flicker
// Reads user data from localStorage and injects CSS to hide sidebar sections immediately
(function() {
    try {
        var user = JSON.parse(localStorage.getItem('dash_user'));
        if (!user) return;
        var modules = user.dashboardModules;
        // Backward compatibility: normalize string format to object
        if (typeof modules === 'string') {
            if (modules === 'insurance') modules = { management: false, insurance: true, reminders: false };
            else if (modules === 'both') modules = { management: true, insurance: true, reminders: false };
            else modules = { management: true, insurance: false, reminders: false };
        }
        if (!modules) modules = { management: true, insurance: false, reminders: false, yeadim: false };

        var ip = user.insurancePages || { dashboard: true, policies: true, agents: true, reports: true };
        var rules = [];

        // Hide management section if not enabled
        if (!modules.management) {
            rules.push('#managementSection { display: none !important; }');
            rules.push('.sidebar-nav a[href="./"] { display: none !important; }');
            rules.push('.sidebar-nav a[href*="trips"] { display: none !important; }');
            rules.push('.sidebar-nav a[href*="employees"] { display: none !important; }');
            rules.push('.sidebar-nav a[href*="expenses"] { display: none !important; }');
            rules.push('.sidebar-nav a[href*="workdays"] { display: none !important; }');
            rules.push('.sidebar-nav a[href*="alerts"] { display: none !important; }');
        }

        // Hide insurance section if not enabled
        if (!modules.insurance) {
            rules.push('#bituhofirSection { display: none !important; }');
            rules.push('.sidebar-nav a[href*="bituhofir"] { display: none !important; }');
            rules.push('.sidebar-nav a[href*="policies"] { display: none !important; }');
            rules.push('.sidebar-nav a[href*="agents"] { display: none !important; }');
            rules.push('.sidebar-nav a[href*="reports"] { display: none !important; }');
        }

        // Hide reminders section if not enabled
        if (!modules.reminders) {
            rules.push('#remindersSection { display: none !important; }');
            rules.push('.sidebar-nav a[href*="reminders"] { display: none !important; }');
            rules.push('.sidebar-nav a[href*="reminder-detail"] { display: none !important; }');
        }

        // Granular reminder page hiding
        if (modules.reminders) {
            var rp = user.reminderPages || {};
            if (rp.agentAppointment === false) rules.push('.sidebar-nav a[href*="type=agentAppointment"] { display: none !important; }');
            if (rp.policyCancellations === false) rules.push('.sidebar-nav a[href*="type=policyCancellations"] { display: none !important; }');
            if (rp.newProductions === false) rules.push('.sidebar-nav a[href*="type=newProductions"] { display: none !important; }');
            if (rp.claims === false) rules.push('.sidebar-nav a[href*="type=claims"] { display: none !important; }');
            if (rp.firstDeposit === false) rules.push('.sidebar-nav a[href*="type=firstDeposit"] { display: none !important; }');
            if (rp.completingDeficiencies === false) rules.push('.sidebar-nav a[href*="type=completingDeficiencies"] { display: none !important; }');
        }

        // Hide yeadim section if not enabled
        if (!modules.yeadim) {
            rules.push('#yeadimSection { display: none !important; }');
            rules.push('.sidebar-nav a[href*="yeadim"] { display: none !important; }');
        }

        // Granular insurance page hiding
        if (modules.insurance) {
            if (ip.dashboard === false) rules.push('.sidebar-nav a[href*="bituhofir"] { display: none !important; }');
            if (ip.policies === false) rules.push('.sidebar-nav a[href*="policies"] { display: none !important; }');
            if (ip.agents === false) rules.push('.sidebar-nav a[href*="agents"] { display: none !important; }');
            if (ip.reports === false) rules.push('.sidebar-nav a[href*="reports"] { display: none !important; }');
        }

        if (rules.length) {
            var style = document.createElement('style');
            style.id = 'sidebar-init-css';
            style.textContent = rules.join('\n');
            document.head.appendChild(style);
        }
    } catch(e) {}
})();
