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
      // Redirect to home page or sign in page if currently on an authenticated page
      if (window.location.pathname.includes('dashboard') || window.location.pathname.includes('admin')) {
        window.location.href = '../index.html';
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

        container.innerHTML = `
          <div style="display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;">
            <div style="display: flex; flex-direction: column; align-items: flex-end; line-height: 1.2;">
              <div style="display: flex; align-items: center; gap: 0.35rem; font-weight: 600; font-size: var(--text-sm); color: var(--text-primary);">
                <span>${escapeHtml(user.fullName)}</span>
                ${roleBadge}
              </div>
              <span style="font-size: var(--text-xs); color: var(--accent-mint); font-weight: 600;">
                🪙 ${formattedCredits} Demo Credits
              </span>
            </div>
            <button type="button" class="btn btn-outline btn-sm logout-trigger" id="navLogoutBtn">Sign Out</button>
          </div>
        `;
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
        window.location.reload();
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

  return {
    getCsrfToken,
    register,
    login,
    logout,
    getCurrentUser,
    updateNavState,
    initPasswordToggles
  };
})();

window.TossArenaAuth = TossArenaAuth;

// Automatically check session on page load
document.addEventListener('DOMContentLoaded', () => {
  TossArenaAuth.getCurrentUser();
  TossArenaAuth.initPasswordToggles();
});
