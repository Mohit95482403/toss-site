/**
 * TossArena - Main Client-Side Script
 * Handles navigation interactions, responsive menus, and backend/database connectivity verification.
 */

document.addEventListener('DOMContentLoaded', () => {
  initMobileNavigation();
  initBackendHealthChecker();
});

/**
 * Initializes mobile hamburger menu toggle
 */
function initMobileNavigation() {
  const toggleBtn = document.getElementById('mobileNavToggle');
  const navMenu = document.getElementById('navMenu');

  if (toggleBtn && navMenu) {
    toggleBtn.addEventListener('click', () => {
      const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', !isExpanded);
      navMenu.classList.toggle('is-active');
    });

    // Close menu when clicking outside
    document.addEventListener('click', (event) => {
      if (!toggleBtn.contains(event.target) && !navMenu.contains(event.target)) {
        navMenu.classList.remove('is-active');
        toggleBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }
}

/**
 * Verifies backend API & MySQL database connectivity and updates the status panel
 */
async function checkBackendHealth() {
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const statusDetails = document.getElementById('statusDetails');
  const retryBtn = document.getElementById('retryHealthBtn');

  if (!statusDetails) return;

  if (retryBtn) retryBtn.disabled = true;
  if (statusIndicator) {
    statusIndicator.className = 'ping-indicator';
  }
  if (statusText) statusText.textContent = 'Checking API & Database...';

  const startTime = performance.now();
  const healthEndpoint = window.TossArenaConfig
    ? window.TossArenaConfig.getApiUrl(window.TossArenaConfig.ENDPOINTS.HEALTH)
    : 'http://localhost:5000/api/health';
  const dbHealthEndpoint = window.TossArenaConfig
    ? window.TossArenaConfig.getApiUrl(window.TossArenaConfig.ENDPOINTS.HEALTH_DB)
    : 'http://localhost:5000/api/health/db';

  try {
    // 1. Check API Liveness
    const apiResponse = await fetch(healthEndpoint, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    const latencyMs = Math.round(performance.now() - startTime);

    if (!apiResponse.ok) {
      throw new Error(`API HTTP ${apiResponse.status} - ${apiResponse.statusText}`);
    }

    const apiData = await apiResponse.json();

    // 2. Check Database Readiness
    let dbData = null;
    let dbStatus = 'checking';
    try {
      const dbResponse = await fetch(dbHealthEndpoint, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      dbData = await dbResponse.json();
      dbStatus = dbResponse.ok ? 'connected' : 'unavailable';
    } catch (e) {
      dbStatus = 'unreachable';
      dbData = { error: e.message };
    }

    if (statusIndicator) {
      statusIndicator.className = dbStatus === 'connected' ? 'ping-indicator online' : 'ping-indicator';
    }
    if (statusText) {
      statusText.textContent = dbStatus === 'connected' 
        ? `API & DB Online (${latencyMs}ms)` 
        : `API Online (${latencyMs}ms) | DB ${dbStatus}`;
    }

    statusDetails.textContent = JSON.stringify(
      {
        api: {
          endpoint: healthEndpoint,
          status: `${apiResponse.status} ${apiResponse.statusText}`,
          payload: apiData
        },
        database: {
          endpoint: dbHealthEndpoint,
          status: dbStatus,
          payload: dbData
        },
        clientLatency: `${latencyMs}ms`
      },
      null,
      2
    );
  } catch (error) {
    if (statusIndicator) statusIndicator.className = 'ping-indicator offline';
    if (statusText) statusText.textContent = 'Backend Offline';

    statusDetails.textContent = JSON.stringify(
      {
        endpoint: healthEndpoint,
        status: 'Connection Failed',
        message: 'Could not connect to TossArena backend API. Ensure backend is running via `npm run dev` on port 5000.',
        error: error.message
      },
      null,
      2
    );
  } finally {
    if (retryBtn) retryBtn.disabled = false;
  }
}

function initBackendHealthChecker() {
  const retryBtn = document.getElementById('retryHealthBtn');
  if (retryBtn) {
    retryBtn.addEventListener('click', checkBackendHealth);
  }

  // Trigger initial check
  checkBackendHealth();
}
