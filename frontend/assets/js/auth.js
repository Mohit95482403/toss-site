/**
 * TossArena Authentication & Session Client
 * Manages CSRF token exchange, credentialed requests, session checks, and navigation state.
 * Strictly avoids storing sensitive session IDs or credentials in localStorage.
 */

const TossArenaAuth = (function () {
  let cachedCsrfToken = null;
  let currentUser = null;
  let authChecked = false;

  /**
   * Helper to resolve API URLs via TossArenaConfig
   */
  function getUrl(endpoint) {
    if (window.TossArenaConfig && window.TossArenaConfig.getApiUrl) {
      return window.TossArenaConfig.getApiUrl(endpoint);
    }
    return `http://localhost:5000/api${endpoint}`;
  }

  /**
   * Fetches or retrieves the session CSRF token with credentials included
   * @returns {Promise<string>}
   */
  async function getCsrfToken(forceRefresh = false) {
    if (cachedCsrfToken && !forceRefresh) {
      return cachedCsrfToken;
    }

    try {
      const endpoint = window.TossArenaConfig?.ENDPOINTS?.AUTH_CSRF || '/auth/csrf';
      const response = await fetch(getUrl(endpoint), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to obtain security token: HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data && data.csrfToken) {
        cachedCsrfToken = data.csrfToken;
        return cachedCsrfToken;
      }
      throw new Error('CSRF token missing from response payload.');
    } catch (err) {
      console.error('CSRF fetch error:', err);
      throw err;
    }
  }

  /**
   * Submits user registration to the backend
   * @param {{ fullName: string, email: string, password: string, confirmPassword?: string }} payload
   * @returns {Promise<{ success: boolean, message: string, user?: object, errors?: string[] }>}
   */
  async function register(payload) {
    const token = await getCsrfToken();
    const endpoint = window.TossArenaConfig?.ENDPOINTS?.AUTH_REGISTER || '/auth/register';

    const response = await fetch(getUrl(endpoint), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRF-Token': token
      },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      // If CSRF error, clear token so next attempt fetches a fresh one
      if (response.status === 403 && data.code === 'EBADCSRFTOKEN') {
        cachedCsrfToken = null;
      }
      throw new Error(data.message || (data.errors ? data.errors[0] : 'Registration failed.'));
    }

    return data;
  }

  /**
   * Submits user login to the backend
   * @param {{ email: string, password: string }} payload
   * @returns {Promise<{ success: boolean, message: string, user: object }>}
   */
  async function login(payload) {
    const token = await getCsrfToken();
    const endpoint = window.TossArenaConfig?.ENDPOINTS?.AUTH_LOGIN || '/auth/login';

    const response = await fetch(getUrl(endpoint), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRF-Token': token
      },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 403 && data.code === 'EBADCSRFTOKEN') {
        cachedCsrfToken = null;
      }
      throw new Error(data.message || 'Login failed. Please check your credentials.');
    }

    // Update in-memory user and rotated CSRF token
    currentUser = data.user;
    if (data.csrfToken) {
      cachedCsrfToken = data.csrfToken;
    }

    updateNavState(currentUser);
    return data;
  }

  /**
   * Logs out the user and destroys the session cookie
   * @returns {Promise<boolean>}
   */
  async function logout() {
    try {
      const token = await getCsrfToken();
      const endpoint = window.TossArenaConfig?.ENDPOINTS?.AUTH_LOGOUT || '/auth/logout';

      await fetch(getUrl(endpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-Token': token
        },
        credentials: 'include'
      });
    } catch (e) {
      console.warn('Logout request completed with warning:', e);
    } finally {
      currentUser = null;
      cachedCsrfToken = null;
      updateNavState(null);
      // Redirect to login page if currently on an authenticated/protected page
      const isPagesDir = window.location.pathname.includes('/pages/');
      const isUserDir = window.location.pathname.includes('/user/');
      const isAdminDir = window.location.pathname.includes('/admin/');
      const isProtected = window.location.pathname.includes('dashboard') ||
                          window.location.pathname.includes('admin') ||
                          window.location.pathname.includes('matches') ||
                          window.location.pathname.includes('wallet') ||
                          window.location.pathname.includes('history') ||
                          window.location.pathname.includes('profile');
      if (isProtected) {
        if (isAdminDir) {
          window.location.href = 'login.html';
        } else if (isUserDir) {
          window.location.href = '../pages/login.html';
        } else if (isPagesDir) {
          window.location.href = 'login.html';
        } else {
          window.location.href = 'pages/login.html';
        }
      }
    }
    return true;
  }

  /**
   * Checks current authentication status by calling /api/auth/me
   * @returns {Promise<object|null>} The authenticated user object or null
   */
  async function getCurrentUser(force = false) {
    if (authChecked && !force) {
      return currentUser;
    }

    try {
      const endpoint = window.TossArenaConfig?.ENDPOINTS?.AUTH_ME || '/auth/me';
      const response = await fetch(getUrl(endpoint), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        currentUser = data.user || null;
      } else {
        currentUser = null;
      }
    } catch (e) {
      currentUser = null;
    } finally {
      authChecked = true;
      updateNavState(currentUser);
    }

    return currentUser;
  }

  /**
   * Dynamically renders auth state in navigation bars across pages
   * @param {object|null} user
   */
  function updateNavState(user) {
    const navActions = document.querySelectorAll('.navbar .nav-actions, .nav-actions-mobile');

    navActions.forEach((container) => {
      if (!container) return;

      if (user) {
        const formattedCredits = Number(user.demoBalance || 0).toLocaleString();
        const roleBadge = user.role === 'admin'
          ? `<span class="badge badge-amber" style="padding: 0.15rem 0.45rem; font-size: 0.7rem;">ADMIN</span>`
          : '';

        const isMobile = container.classList.contains('nav-actions-mobile');

        if (isMobile) {
          container.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: var(--space-3); width: 100%;">
              <div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-2) 0; border-bottom: 1px solid var(--border-subtle);">
                <div style="display: flex; align-items: center; gap: 0.35rem; font-weight: 600; font-size: var(--text-sm); color: var(--text-primary);">
                  <span>${escapeHtml(user.fullName)}</span>
                  ${roleBadge}
                </div>
                <span style="font-size: var(--text-xs); color: var(--accent-mint); font-weight: 600;">
                  🪙 ${formattedCredits} Credits
                </span>
              </div>
              <button type="button" class="btn btn-outline btn-sm logout-trigger" style="width: 100%;">Sign Out</button>
            </div>
          `;
        } else {
          container.innerHTML = `
            <div style="display: flex; align-items: center; gap: var(--space-3);">
              <div style="display: flex; flex-direction: column; align-items: flex-end; line-height: 1.2;">
                <div style="display: flex; align-items: center; gap: 0.35rem; font-weight: 600; font-size: var(--text-sm); color: var(--text-primary);">
                  <span>${escapeHtml(user.fullName)}</span>
                  ${roleBadge}
                </div>
                <span style="font-size: var(--text-xs); color: var(--accent-mint); font-weight: 600;">
                  🪙 ${formattedCredits} Credits
                </span>
              </div>
              <button type="button" class="btn btn-outline btn-sm logout-trigger">Sign Out</button>
            </div>
          `;
        }
      } else {
        // Find relative path for links depending on whether we are in /pages or root
        const isPagesDir = window.location.pathname.includes('/pages/');
        const loginPath = isPagesDir ? 'login.html' : 'pages/login.html';
        const registerPath = isPagesDir ? 'register.html' : 'pages/register.html';

        container.innerHTML = `
          <a href="${loginPath}" class="btn btn-outline btn-sm">Sign In</a>
          <a href="${registerPath}" class="btn btn-primary btn-sm">Get 1,000 Credits</a>
        `;
      }
    });

    // Attach click listener for sign out triggers
    document.querySelectorAll('.logout-trigger').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        btn.textContent = 'Signing out...';
        btn.disabled = true;
        await logout();
      });
    });
  }

  /**
   * Password Visibility Toggle Helper
   */
  function initPasswordToggles() {
    const toggleBtns = document.querySelectorAll('[data-toggle-password]');
    toggleBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = btn.getAttribute('data-toggle-password');
        const input = document.getElementById(targetId);
        if (!input) return;

        if (input.type === 'password') {
          input.type = 'text';
          btn.textContent = 'Hide';
          btn.setAttribute('aria-label', 'Hide password');
        } else {
          input.type = 'password';
          btn.textContent = 'Show';
          btn.setAttribute('aria-label', 'Show password');
        }
      });
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Fetches dashboard summary statistics for the authenticated user
   * @returns {Promise<object>}
   */
  async function getDashboardSummary() {
    const endpoint = window.TossArenaConfig?.ENDPOINTS?.DASHBOARD_SUMMARY || '/dashboard/summary';
    const response = await fetch(getUrl(endpoint), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });

    if (response.status === 401) {
      throw new Error('UNAUTHORIZED');
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to load dashboard summary.');
    }
    return data.data;
  }

  /**
   * Fetches recent activity stream for the authenticated user
   * @returns {Promise<Array>}
   */
  async function getDashboardActivity() {
    const endpoint = window.TossArenaConfig?.ENDPOINTS?.DASHBOARD_ACTIVITY || '/dashboard/activity';
    const response = await fetch(getUrl(endpoint), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });

    if (response.status === 401) {
      throw new Error('UNAUTHORIZED');
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to load dashboard activity.');
    }
    return data.data?.activities || [];
  }

  /**
   * Updates user profile (full name)
   * @param {{ fullName: string }} payload
   * @returns {Promise<object>}
   */
  async function updateProfile(payload) {
    const token = await getCsrfToken();
    const endpoint = window.TossArenaConfig?.ENDPOINTS?.USER_PROFILE || '/users/me';

    const response = await fetch(getUrl(endpoint), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRF-Token': token
      },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      if (response.status === 403 && data.code === 'EBADCSRFTOKEN') {
        cachedCsrfToken = null;
      }
      throw new Error(data.message || 'Failed to update profile.');
    }

    currentUser = data.user;
    updateNavState(currentUser);
    return data;
  }

  /**
   * Retrieves authoritative virtual demo wallet balance
   * @returns {Promise<object>}
   */
  async function getWallet() {
    const endpoint = window.TossArenaConfig?.ENDPOINTS?.WALLET || '/wallet/me';
    const response = await fetch(getUrl(endpoint), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to retrieve wallet balance.');
    }
    return data.data;
  }

  /**
   * Retrieves paginated transaction history from the immutable ledger
   * @param {object} params
   * @param {number} [params.page=1]
   * @param {number} [params.limit=10]
   * @param {string} [params.type]
   * @param {string} [params.sort='newest']
   * @returns {Promise<{ transactions: Array, pagination: object }>}
   */
  async function getWalletTransactions({ page = 1, limit = 10, type, sort = 'newest' } = {}) {
    const endpoint = window.TossArenaConfig?.ENDPOINTS?.WALLET_TRANSACTIONS || '/wallet/transactions';
    const url = new URL(getUrl(endpoint), window.location.origin);
    url.searchParams.set('page', page);
    url.searchParams.set('limit', limit);
    if (type) url.searchParams.set('type', type);
    if (sort) url.searchParams.set('sort', sort);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to retrieve transaction history.');
    }
    return {
      transactions: data.data || [],
      pagination: data.pagination || { page: 1, limit: 10, total: 0, totalPages: 0 }
    };
  }

  /**
   * Retrieves server-defined virtual demo packages
   * @returns {Promise<{ packages: Array, userClaim: object|null }>}
   */
  async function getDemoPackages() {
    const endpoint = window.TossArenaConfig?.ENDPOINTS?.WALLET_PACKAGES || '/wallet/demo-packages';
    const response = await fetch(getUrl(endpoint), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to retrieve credit packages.');
    }
    return {
      packages: data.data || [],
      userClaim: data.userClaim || null
    };
  }

  /**
   * Retrieves one-time demo package claim status for authenticated user
   * @returns {Promise<{ hasClaimed: boolean, claim: object|null }>}
   */
  async function getClaimStatus() {
    const endpoint = window.TossArenaConfig?.ENDPOINTS?.WALLET_CLAIM_STATUS || '/wallet/claim-status';
    const response = await fetch(getUrl(endpoint), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to retrieve claim status.');
    }
    return data.data || { hasClaimed: false, claim: null };
  }

  /**
   * Claims a one-time virtual demo credit package
   * @param {string} packageId
   * @param {string} [idempotencyKey]
   * @returns {Promise<object>}
   */
  async function claimDemoCredits(packageId, idempotencyKey = null) {
    const token = await getCsrfToken();
    const endpoint = window.TossArenaConfig?.ENDPOINTS?.WALLET_CLAIM || '/wallet/claim-demo-credits';

    const finalKey = idempotencyKey || `idem-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const response = await fetch(getUrl(endpoint), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRF-Token': token
      },
      credentials: 'include',
      body: JSON.stringify({
        packageId,
        idempotencyKey: finalKey
      })
    });

    const data = await response.json();
    if (!response.ok) {
      if (response.status === 403 && data.code === 'EBADCSRFTOKEN') {
        cachedCsrfToken = null;
      }
      const err = new Error(data.message || 'Failed to claim credits.');
      err.code = data.code;
      err.data = data.data;
      throw err;
    }

    return data;
  }

  /**
   * Retrieves user prediction history with filtering, searching, and pagination
   * @param {object} params
   * @returns {Promise<{ predictions: Array, pagination: object, filters: object }>}
   */
  async function getPredictions({
    page = 1,
    limit = 10,
    search,
    status,
    dateFrom,
    dateTo,
    datePreset,
    sort = 'newest'
  } = {}) {
    const endpoint = window.TossArenaConfig?.ENDPOINTS?.PREDICTIONS || '/predictions';
    const url = new URL(getUrl(endpoint), window.location.origin);
    url.searchParams.set('page', page);
    url.searchParams.set('limit', limit);
    if (search) url.searchParams.set('search', search);
    if (status && status !== 'all') url.searchParams.set('status', status);
    if (datePreset && datePreset !== 'all') url.searchParams.set('datePreset', datePreset);
    if (dateFrom) url.searchParams.set('dateFrom', dateFrom);
    if (dateTo) url.searchParams.set('dateTo', dateTo);
    if (sort) url.searchParams.set('sort', sort);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to retrieve predictions history.');
    }
    return {
      predictions: data.data || [],
      pagination: data.pagination || { page: 1, limit: 10, total: 0, totalPages: 0 },
      filters: data.filters || {}
    };
  }

  /**
   * Retrieves single prediction details by ID
   * @param {number|string} id
   * @returns {Promise<object>}
   */
  async function getPredictionDetails(id) {
    const endpoint = `${window.TossArenaConfig?.ENDPOINTS?.PREDICTIONS || '/predictions'}/${encodeURIComponent(id)}`;
    const response = await fetch(getUrl(endpoint), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to retrieve prediction details.');
    }
    return data.data;
  }

  /**
   * Retrieves authoritative user prediction statistics
   * @returns {Promise<object>}
   */
  async function getPredictionStatistics() {
    const endpoint = window.TossArenaConfig?.ENDPOINTS?.PREDICTIONS_STATISTICS || '/predictions/statistics';
    const response = await fetch(getUrl(endpoint), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to retrieve prediction statistics.');
    }
    return data.data;
  }

  return {
    getCsrfToken,
    register,
    login,
    logout,
    getCurrentUser,
    getDashboardSummary,
    getDashboardActivity,
    updateProfile,
    updateNavState,
    initPasswordToggles,
    getWallet,
    getWalletTransactions,
    getDemoPackages,
    getClaimStatus,
    claimDemoCredits,
    getPredictions,
    getPredictionDetails,
    getPredictionStatistics
  };
})();


window.TossArenaAuth = TossArenaAuth;

// Automatically check session on page load
document.addEventListener('DOMContentLoaded', () => {
  TossArenaAuth.getCurrentUser();
  TossArenaAuth.initPasswordToggles();
});
