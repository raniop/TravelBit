// Sidebar Init - runs in <head> BEFORE body renders to prevent flicker
// Reads user data from localStorage and injects CSS to hide sidebar sections immediately
(function() {
    try {
        var user = JSON.parse(localStorage.getItem('dash_user'));
        if (!user) return;
        var modules = user.dashboardModules || 'management';
        var ip = user.insurancePages || { dashboard: true, policies: true, agents: true, reports: true };
        var rules = [];

        // Hide management section if insurance-only
        if (modules === 'insurance') {
            rules.push('#managementSection { display: none !important; }');
            rules.push('.sidebar-nav a[href="/dashboard/"] { display: none !important; }');
            rules.push('.sidebar-nav a[href*="trips"] { display: none !important; }');
            rules.push('.sidebar-nav a[href*="employees"] { display: none !important; }');
            rules.push('.sidebar-nav a[href*="expenses"] { display: none !important; }');
            rules.push('.sidebar-nav a[href*="workdays"] { display: none !important; }');
            rules.push('.sidebar-nav a[href*="alerts"] { display: none !important; }');
        }

        // Hide insurance section if management-only
        if (modules === 'management') {
            rules.push('#bituhofirSection { display: none !important; }');
            rules.push('.sidebar-nav a[href*="bituhofir"] { display: none !important; }');
            rules.push('.sidebar-nav a[href*="policies"] { display: none !important; }');
            rules.push('.sidebar-nav a[href*="agents"] { display: none !important; }');
            rules.push('.sidebar-nav a[href*="reports"] { display: none !important; }');
        }

        // Granular insurance page hiding
        if (modules === 'insurance' || modules === 'both') {
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
