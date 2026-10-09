/**
 * TossArena - Frontend Configuration
 * Contains client-side constants and API endpoints.
 * Never store private keys, secrets, or database credentials here.
 */

const TossArenaConfig = (function () {
  // Determine backend API host: default to localhost:5000 for Day 1 local development
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const API_ORIGIN = isLocalhost ? 'http://localhost:5000' : window.location.origin;

  return {
    API_ORIGIN,
    API_BASE_URL: `${API_ORIGIN}/api`,
    APP_NAME: 'TossArena',
    APP_VERSION: '1.0.0 (Day 1 Dev)',
    ENDPOINTS: {
      HEALTH: '/health',
      ROOT: '/'
    },
    /**
     * Resolves an API path to a fully qualified URL
     * @param {string} endpoint - API path (e.g., '/health')
     * @returns {string} Fully qualified URL
     */
    getApiUrl: function (endpoint) {
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      return `${this.API_BASE_URL}${cleanEndpoint}`;
    }
  };
})();

// Expose on global window object
window.TossArenaConfig = TossArenaConfig;
