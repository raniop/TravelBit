/**
 * Travelsure API Integration
 *
 * This module handles integration with the existing Travelsure system
 * at ophir.travelsure.co.il for fetching trip and policy data.
 *
 * TODO: Implement when Travelsure API details are available.
 * For now, data is imported via CSV upload through the admin panel.
 */

class TravelsureClient {
    constructor(baseUrl = 'https://ophir.travelsure.co.il') {
        this.baseUrl = baseUrl;
    }

    // Placeholder for future API integration
    async fetchTrips(companyId) {
        // TODO: Implement API call to Travelsure
        throw new Error('Travelsure API integration not yet configured. Use CSV import instead.');
    }

    async fetchPolicies(companyId) {
        // TODO: Implement API call to Travelsure
        throw new Error('Travelsure API integration not yet configured. Use CSV import instead.');
    }

    async syncCompanyData(companyId) {
        // TODO: Implement full data sync
        throw new Error('Travelsure API integration not yet configured. Use CSV import instead.');
    }
}

module.exports = new TravelsureClient();
