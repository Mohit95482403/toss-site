/**
 * TossArena - Main Client-Side Script
 * Handles navigation interactions, responsive menus, and backend connectivity verification.
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
 * Verifies backend API connectivity and updates the status panel
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
  if (statusText) statusText.textContent = 'Checking API connection...';

  const startTime = performance.now();
  const healthEndpoint = window.TossArenaConfig
    ? window.TossArenaConfig.getApiUrl(window.TossArenaConfig.ENDPOINTS.HEALTH)
    : 'http://localhost:5000/api/health';

  try {
    const response = await fetch(healthEndpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    const latencyMs = Math.round(performance.now() - startTime);

    if (response.ok) {
      const data = await response.json();
      if (statusIndicator) statusIndicator.className = 'ping-indicator online';
      if (statusText) statusText.textContent = `Backend Online (${latencyMs}ms)`;

      statusDetails.textContent = JSON.stringify(
        {
          endpoint: healthEndpoint,
          httpStatus: `${response.status} ${response.statusText}`,
          responsePayload: data,
          clientLatency: `${latencyMs}ms`
        },
        null,
        2
      );
    } else {
      throw new Error(`HTTP ${response.status} - ${response.statusText}`);
    }
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
