/**
 * TossArena - Frontend Configuration
 * Client-side constants, endpoints, and utility helpers.
 * Strictly non-sensitive configuration. Never store secrets here.
 */

const TossArenaConfig = (function () {
  // Determine backend API host: defaults to localhost:5000 for local development
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const API_ORIGIN = isLocalhost ? 'http://localhost:5000' : window.location.origin;

  return {
    API_ORIGIN,
    API_BASE_URL: `${API_ORIGIN}/api`,
    APP_NAME: 'TossArena',
    APP_VERSION: '1.0.0 (Day 5 User Dashboard)',
    ENDPOINTS: {
      HEALTH: '/health',
      HEALTH_DB: '/health/db',
      MATCHES: '/matches',
      ROOT: '/',
      AUTH_CSRF: '/auth/csrf',
      AUTH_REGISTER: '/auth/register',
      AUTH_LOGIN: '/auth/login',
      AUTH_LOGOUT: '/auth/logout',
      AUTH_ME: '/auth/me',
      DASHBOARD_SUMMARY: '/dashboard/summary',
      DASHBOARD_ACTIVITY: '/dashboard/activity',
      USER_PROFILE: '/users/me',
      PREDICTIONS: '/predictions',
      WALLET: '/wallet/me',
      WALLET_TRANSACTIONS: '/wallet/transactions'
    },


    /**
     * Resolves an API path to a fully qualified URL
     * @param {string} endpoint - API path (e.g. '/matches')
     * @returns {string} Fully qualified URL
     */
    getApiUrl: function (endpoint) {
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      return `${this.API_BASE_URL}${cleanEndpoint}`;
    }
  };
})();

// Attach to window global object
window.TossArenaConfig = TossArenaConfig;
