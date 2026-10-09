/**
 * TossArena - Main Client-Side Application Script
 * Modular interactions for navigation, drawer, health bridge, featured matches, and FAQs.
 */

document.addEventListener('DOMContentLoaded', () => {
  initMobileDrawer();
  initFooterYear();
  initBackendHealthChecker();
  initFeaturedMatches();
  initFaqAccordion();
});

/**
 * 1. Mobile Navigation Drawer & Backdrop Handling
 */
function initMobileDrawer() {
  const toggleBtn = document.getElementById('mobileNavToggle');
  const closeBtn = document.getElementById('mobileNavClose');
  const navMenu = document.getElementById('navMenu');
  const backdrop = document.getElementById('navBackdrop');

  if (!toggleBtn || !navMenu) return;

  function openDrawer() {
    navMenu.classList.add('is-active');
    if (backdrop) backdrop.classList.add('is-visible');
    toggleBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden'; // prevent background scrolling
  }

  function closeDrawer() {
    navMenu.classList.remove('is-active');
    if (backdrop) backdrop.classList.remove('is-visible');
    toggleBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  toggleBtn.addEventListener('click', () => {
    const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
    if (isExpanded) {
      closeDrawer();
    } else {
      openDrawer();
    }
  });

  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);

  // Close drawer on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navMenu.classList.contains('is-active')) {
      closeDrawer();
    }
  });

  // Close drawer when clicking a navigation link
  const navLinks = navMenu.querySelectorAll('.nav-link, .nav-actions-mobile a');
  navLinks.forEach((link) => {
    link.addEventListener('click', closeDrawer);
  });
}

/**
 * 2. Dynamic Year in Footer
 */
function initFooterYear() {
  const yearEl = document.getElementById('currentYear');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
}

/**
 * 3. Backend & Database Health Checker
 */
async function checkBackendHealth() {
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const statusDetails = document.getElementById('statusDetails');
  const retryBtn = document.getElementById('retryHealthBtn');

  if (!statusDetails) return;

  if (retryBtn) retryBtn.disabled = true;
  if (statusIndicator) statusIndicator.className = 'ping-indicator';
  if (statusText) statusText.textContent = 'Checking API & Database...';

  const startTime = performance.now();
  const config = window.TossArenaConfig || {};
  const healthEndpoint = config.getApiUrl ? config.getApiUrl(config.ENDPOINTS.HEALTH) : 'http://localhost:5000/api/health';
  const dbHealthEndpoint = config.getApiUrl ? config.getApiUrl(config.ENDPOINTS.HEALTH_DB) : 'http://localhost:5000/api/health/db';

  try {
    const apiResponse = await fetch(healthEndpoint, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    const latencyMs = Math.round(performance.now() - startTime);

    if (!apiResponse.ok) {
      throw new Error(`API HTTP ${apiResponse.status} - ${apiResponse.statusText}`);
    }

    const apiData = await apiResponse.json();

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
  checkBackendHealth();
}

/**
 * 4. Featured Matches Loader (Safely handles real API response or clean empty state)
 */
async function initFeaturedMatches() {
  const container = document.getElementById('featuredMatchesContainer');
  if (!container) return;

  const config = window.TossArenaConfig || {};
  const matchesEndpoint = config.getApiUrl ? config.getApiUrl(config.ENDPOINTS.MATCHES) : 'http://localhost:5000/api/matches';

  // Render loading skeleton
  container.innerHTML = `
    <div class="skeleton-card skeleton-shimmer"></div>
    <div class="skeleton-card skeleton-shimmer"></div>
    <div class="skeleton-card skeleton-shimmer"></div>
  `;

  try {
    const response = await fetch(matchesEndpoint, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (response.ok) {
      const data = await response.json();
      const matches = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);

      if (matches.length > 0) {
        renderMatches(container, matches.slice(0, 3));
        return;
      }
    }

    // Handled gracefully: No real matches returned or endpoint not yet published
    renderEmptyState(container);
  } catch (err) {
    // Graceful offline/preview fallback
    renderEmptyState(container);
  }
}

function renderEmptyState(container) {
  container.innerHTML = `
    <div class="state-box" style="grid-column: 1 / -1;">
      <div class="state-icon">🏏</div>
      <h3 class="state-title">No Active Matches Available</h3>
      <p class="state-desc">
        Official cricket fixtures and toss prediction countdowns will appear here once live scheduling begins.
      </p>
      <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
        <a href="pages/how-to-play.html" class="btn btn-primary btn-sm">How Predictions Work</a>
        <button type="button" class="btn btn-outline btn-sm" id="retryFeaturedBtn">Refresh Matches</button>
      </div>
    </div>
  `;

  const retryBtn = document.getElementById('retryFeaturedBtn');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => initFeaturedMatches());
  }
}

function renderMatches(container, matches) {
  container.innerHTML = '';
  matches.forEach((m) => {
    const card = document.createElement('div');
    card.className = 'match-card';

    const teamAInitials = escapeHtml((m.team_a || 'A').substring(0, 2).toUpperCase());
    const teamBInitials = escapeHtml((m.team_b || 'B').substring(0, 2).toUpperCase());
    const scheduledDate = m.scheduled_at ? new Date(m.scheduled_at).toLocaleString() : 'TBD';

    card.innerHTML = `
      <div class="match-header">
        <span class="match-tournament">${escapeHtml(m.tournament_name || 'Cricket Fixture')}</span>
        <span class="badge ${m.status === 'open' ? 'badge-emerald' : 'badge-amber'}">${escapeHtml(m.status || 'Upcoming')}</span>
      </div>
      <div class="match-teams">
        <div class="match-team">
          <div class="team-badge-circle">${teamAInitials}</div>
          <div class="team-name">${escapeHtml(m.team_a || 'Team A')}</div>
        </div>
        <div class="match-vs">VS</div>
        <div class="match-team">
          <div class="team-badge-circle">${teamBInitials}</div>
          <div class="team-name">${escapeHtml(m.team_b || 'Team B')}</div>
        </div>
      </div>
      <div class="match-meta">
        <div>📅 <strong>Scheduled:</strong> ${scheduledDate}</div>
        <div>📍 <strong>Venue:</strong> ${escapeHtml(m.venue || 'Neutral Ground')}</div>
      </div>
      <a href="pages/matches.html" class="btn btn-outline btn-sm" style="margin-top: auto; width: 100%;">View Details</a>
    `;
    container.appendChild(card);
  });
}

/**
 * 5. Accessible FAQ Accordion Toggle
 */
function initFaqAccordion() {
  const faqQuestions = document.querySelectorAll('.faq-question');
  faqQuestions.forEach((btn) => {
    btn.addEventListener('click', () => {
      const parent = btn.closest('.faq-item');
      if (!parent) return;

      const isExpanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', !isExpanded);
      parent.classList.toggle('is-open', !isExpanded);
    });
  });
}

/**
 * XSS-Safe HTML String Escaper
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.escapeHtml = escapeHtml;
