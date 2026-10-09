/**
 * TossArena - User Dashboard Controller (Day 5)
 * Manages authenticated data fetching, summary cards, activity timeline,
 * upcoming matches preview, profile updates, and responsive drawer interactions.
 */

document.addEventListener('DOMContentLoaded', () => {
  initUserDashboard();
});

let currentDashboardUser = null;

async function initUserDashboard() {
  // 1. Authenticate user
  try {
    const user = await window.TossArenaAuth.getCurrentUser(true);
    if (!user) {
      window.location.href = '../pages/login.html?returnUrl=../user/dashboard.html';
      return;
    }
    currentDashboardUser = user;
    renderUserIdentity(user);
  } catch (err) {
    window.location.href = '../pages/login.html?returnUrl=../user/dashboard.html';
    return;
  }

  // 2. Initialize UI controls
  initDashboardNavigation();
  initDashboardLogout();
  initProfileForm();

  // 3. Load live backend data
  loadDashboardSummary();
  loadDashboardActivity();
  loadUpcomingMatchesPreview();
}

/**
 * Renders user identity in the sidebar, topbar, and welcome banner
 */
function renderUserIdentity(user) {
  const firstName = (user.fullName || 'Cricket Fan').split(' ')[0];
  const initials = (user.fullName || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  // Topbar
  const avatarEl = document.getElementById('userAvatar');
  const nameEl = document.getElementById('userName');
  const roleEl = document.getElementById('userRole');
  if (avatarEl) avatarEl.textContent = initials;
  if (nameEl) nameEl.textContent = user.fullName;
  if (roleEl) roleEl.textContent = user.role === 'admin' ? 'Administrator' : 'Standard Member';

  // Welcome headline
  const welcomeNameEl = document.getElementById('welcomeFirstName');
  if (welcomeNameEl) welcomeNameEl.textContent = firstName;

  // Profile Form Pre-fill
  const profileNameInput = document.getElementById('profileFullName');
  const profileEmailInput = document.getElementById('profileEmail');
  const profileRoleBadge = document.getElementById('profileRoleBadge');
  const profileStatusBadge = document.getElementById('profileStatusBadge');
  const profileBigAvatar = document.getElementById('profileBigAvatar');
  const profileMemberSince = document.getElementById('profileMemberSince');
  const profileLastLogin = document.getElementById('profileLastLogin');

  if (profileNameInput) profileNameInput.value = user.fullName || '';
  if (profileEmailInput) profileEmailInput.value = user.email || '';
  if (profileRoleBadge) profileRoleBadge.textContent = (user.role || 'user').toUpperCase();
  if (profileStatusBadge) profileStatusBadge.textContent = (user.status || 'active').toUpperCase();
  if (profileBigAvatar) profileBigAvatar.textContent = initials;
  if (profileMemberSince) {
    profileMemberSince.textContent = user.createdAt
      ? new Date(user.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
      : 'Active Member';
  }
  if (profileLastLogin) {
    profileLastLogin.textContent = user.lastLoginAt
      ? new Date(user.lastLoginAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
      : 'First session';
  }
}

/**
 * Loads real account summary cards from /api/dashboard/summary
 */
async function loadDashboardSummary() {
  const statusEl = document.getElementById('statAccountStatus');
  const predictionsEl = document.getElementById('statPredictionsMade');
  const completedEl = document.getElementById('statCompletedPredictions');
  const balanceEl = document.getElementById('statDemoBalance');

  try {
    const summary = await window.TossArenaAuth.getDashboardSummary();
    const stats = summary.stats || {};

    if (statusEl) {
      statusEl.innerHTML = `
        <span style="display: inline-flex; align-items: center; gap: 0.4rem;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--accent-emerald);"></span>
          ${stats.accountStatus || 'Active'}
        </span>
      `;
    }

    if (predictionsEl) {
      predictionsEl.textContent = typeof stats.predictionsMade === 'number'
        ? stats.predictionsMade.toLocaleString()
        : '0';
    }

    if (completedEl) {
      completedEl.textContent = typeof stats.completedPredictions === 'number'
        ? stats.completedPredictions.toLocaleString()
        : '0';
    }

    if (balanceEl) {
      const balanceVal = stats.demoCreditBalance !== null && stats.demoCreditBalance !== undefined
        ? Number(stats.demoCreditBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '0.00';
      balanceEl.textContent = `${balanceVal} Credits`;
    }
  } catch (err) {
    console.error('Failed to load dashboard summary:', err);
    if (statusEl) statusEl.textContent = 'Unavailable';
    if (predictionsEl) predictionsEl.textContent = '—';
    if (completedEl) completedEl.textContent = '—';
    if (balanceEl) balanceEl.textContent = 'Error';
  }
}

/**
 * Loads real recent activity timeline from /api/dashboard/activity
 */
async function loadDashboardActivity() {
  const container = document.getElementById('activityContainer');
  if (!container) return;

  container.innerHTML = `
    <div style="padding: var(--space-4); text-align: center; color: var(--text-muted); font-size: var(--text-xs);">
      Loading recent activity...
    </div>
  `;

  try {
    const activities = await window.TossArenaAuth.getDashboardActivity();

    if (!activities || activities.length === 0) {
      container.innerHTML = `
        <div style="padding: var(--space-6); text-align: center; color: var(--text-muted); font-size: var(--text-xs);">
          <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">📜</div>
          No activity recorded yet.
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    activities.forEach((act) => {
      const item = document.createElement('div');
      item.className = 'activity-item';

      const icon = act.type === 'demo_grant' ? '🎁' : (act.category === 'wallet' ? '🪙' : '🔔');
      const timeStr = act.createdAt ? new Date(act.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '';

      item.innerHTML = `
        <div class="activity-icon-badge">${icon}</div>
        <div class="activity-content">
          <div class="activity-title">${escapeHtml(act.title)}</div>
          <div class="activity-desc">${escapeHtml(act.description)}</div>
          <div class="activity-meta">
            <span class="activity-time">${timeStr}</span>
            ${act.amount ? `<span class="activity-amount">${escapeHtml(act.amount)}</span>` : ''}
          </div>
        </div>
      `;
      container.appendChild(item);
    });
  } catch (err) {
    container.innerHTML = `
      <div style="padding: var(--space-4); text-align: center; color: #fca5a5; font-size: var(--text-xs);">
        Could not retrieve recent activity.
      </div>
    `;
  }
}

/**
 * Loads upcoming matches preview from /api/matches
 */
async function loadUpcomingMatchesPreview() {
  const container = document.getElementById('matchesPreviewContainer');
  if (!container) return;

  container.innerHTML = `
    <div style="padding: var(--space-4); text-align: center; color: var(--text-muted); font-size: var(--text-xs);">
      Loading matches...
    </div>
  `;

  try {
    const config = window.TossArenaConfig || {};
    const url = config.getApiUrl ? config.getApiUrl(config.ENDPOINTS.MATCHES || '/matches') : 'http://localhost:5000/api/matches';

    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('Matches fetch failed');

    const payload = await res.json();
    const matches = Array.isArray(payload.data) ? payload.data : [];

    if (matches.length === 0) {
      container.innerHTML = `
        <div style="padding: var(--space-6); text-align: center; color: var(--text-muted); font-size: var(--text-xs);">
          <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">🏏</div>
          No fixtures currently scheduled.
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    matches.slice(0, 3).forEach((m) => {
      const card = document.createElement('div');
      card.className = 'activity-item';
      card.style.flexDirection = 'column';
      card.style.gap = 'var(--space-2)';

      const dateStr = m.scheduled_at ? new Date(m.scheduled_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'TBD';

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <span style="font-size: 0.75rem; color: var(--accent-mint); font-weight: 600;">${escapeHtml(m.tournament_name || 'Match')}</span>
          <span class="badge ${m.status === 'open' ? 'badge-emerald' : 'badge-amber'}" style="font-size: 0.65rem; padding: 0.1rem 0.4rem;">
            ${escapeHtml(m.status || 'Upcoming')}
          </span>
        </div>
        <div style="font-weight: 600; font-size: var(--text-sm); color: var(--text-primary);">
          ${escapeHtml(m.team_a)} <span style="color: var(--accent-gold); font-size: 0.8rem;">vs</span> ${escapeHtml(m.team_b)}
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; font-size: var(--text-xs); color: var(--text-muted);">
          <span>📅 ${dateStr}</span>
          <a href="../pages/matches.html" style="color: var(--accent-mint); font-weight: 600; text-decoration: none;">View Details →</a>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    container.innerHTML = `
      <div style="padding: var(--space-4); text-align: center; color: var(--text-muted); font-size: var(--text-xs);">
        Unable to load matches preview.
        <br><button type="button" class="btn btn-outline btn-sm" style="margin-top: 0.5rem;" onclick="loadUpcomingMatchesPreview()">Retry</button>
      </div>
    `;
  }
}

/**
 * Initializes profile update form submission and cancel actions
 */
function initProfileForm() {
  const form = document.getElementById('profileForm');
  const cancelBtn = document.getElementById('profileCancelBtn');
  const alertEl = document.getElementById('profileAlert');
  const submitBtn = document.getElementById('profileSaveBtn');
  const fullNameInput = document.getElementById('profileFullName');

  if (!form) return;

  function showAlert(msg, type = 'error') {
    if (!alertEl) return;
    alertEl.textContent = msg;
    alertEl.className = `alert-banner alert-${type}`;
  }

  function clearAlert() {
    if (!alertEl) return;
    alertEl.textContent = '';
    alertEl.className = 'alert-banner';
  }

  // Cancel restores original values
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      clearAlert();
      if (currentDashboardUser && fullNameInput) {
        fullNameInput.value = currentDashboardUser.fullName || '';
      }
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();

    const fullName = fullNameInput.value.trim();
    if (!fullName || fullName.length < 2) {
      showAlert('Full name must be at least 2 characters long.', 'error');
      return;
    }

    if (fullName.length > 100) {
      showAlert('Full name cannot exceed 100 characters.', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving changes...';

    try {
      const res = await window.TossArenaAuth.updateProfile({ fullName });
      currentDashboardUser = res.user;
      renderUserIdentity(res.user);
      showAlert('Profile updated successfully!', 'success');
    } catch (err) {
      showAlert(err.message || 'Failed to update profile.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Changes';
    }
  });
}

/**
 * Mobile sidebar drawer and section switcher
 */
function initDashboardNavigation() {
  const sidebar = document.getElementById('dashSidebar');
  const toggleBtn = document.getElementById('dashMobileToggle');
  const closeBtn = document.getElementById('dashSidebarClose');
  const backdrop = document.getElementById('dashNavBackdrop');

  function openSidebar() {
    if (sidebar) sidebar.classList.add('is-open');
    if (backdrop) backdrop.classList.add('is-visible');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    if (sidebar) sidebar.classList.remove('is-open');
    if (backdrop) backdrop.classList.remove('is-visible');
    document.body.style.overflow = '';
  }

  if (toggleBtn) toggleBtn.addEventListener('click', openSidebar);
  if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
  if (backdrop) backdrop.addEventListener('click', closeSidebar);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar && sidebar.classList.contains('is-open')) {
      closeSidebar();
    }
  });

  // Section switcher between Dashboard and Profile
  const overviewLinks = document.querySelectorAll('[data-dash-section="overview"]');
  const profileLinks = document.querySelectorAll('[data-dash-section="profile"]');
  const overviewSection = document.getElementById('sectionOverview');
  const profileSection = document.getElementById('sectionProfile');
  const pageTitle = document.getElementById('dashPageTitle');

  function showSection(section) {
    if (section === 'profile') {
      if (overviewSection) overviewSection.style.display = 'none';
      if (profileSection) profileSection.style.display = 'block';
      if (pageTitle) pageTitle.textContent = 'Profile & Settings';
      document.querySelectorAll('.dash-nav-link').forEach((l) => l.classList.remove('active'));
      profileLinks.forEach((l) => l.classList.add('active'));
    } else {
      if (overviewSection) overviewSection.style.display = 'flex';
      if (profileSection) profileSection.style.display = 'none';
      if (pageTitle) pageTitle.textContent = 'Dashboard Overview';
      document.querySelectorAll('.dash-nav-link').forEach((l) => l.classList.remove('active'));
      overviewLinks.forEach((l) => l.classList.add('active'));
    }
    closeSidebar();
  }

  overviewLinks.forEach((l) => l.addEventListener('click', (e) => {
    e.preventDefault();
    showSection('overview');
  }));

  profileLinks.forEach((l) => l.addEventListener('click', (e) => {
    e.preventDefault();
    showSection('profile');
  }));
}

/**
 * Wires logout trigger
 */
function initDashboardLogout() {
  const logoutBtns = document.querySelectorAll('.dash-logout-btn');
  logoutBtns.forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      btn.textContent = 'Signing out...';
      btn.disabled = true;
      await window.TossArenaAuth.logout();
      window.location.href = '../index.html';
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
