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
  initWalletControls();
  initDemoPackageControls();

  // 3. Load live backend data
  loadDashboardSummary();
  loadDashboardActivity();
  loadUpcomingMatchesPreview();
  loadDemoPackages();
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
          <a href="../pages/match-details.html?id=${encodeURIComponent(m.id)}" style="color: var(--accent-mint); font-weight: 600; text-decoration: none;">View Details →</a>
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

  // Section switcher between Dashboard Overview, My Predictions, Profile, and Wallet
  const overviewLinks = document.querySelectorAll('[data-dash-section="overview"]');
  const predictionsLinks = document.querySelectorAll('[data-dash-section="predictions"]');
  const profileLinks = document.querySelectorAll('[data-dash-section="profile"]');
  const walletLinks = document.querySelectorAll('[data-dash-section="wallet"]');
  const overviewSection = document.getElementById('sectionOverview');
  const predictionsSection = document.getElementById('sectionPredictions');
  const profileSection = document.getElementById('sectionProfile');
  const walletSection = document.getElementById('sectionWallet');
  const pageTitle = document.getElementById('dashPageTitle');

  function showSection(section) {
    // Hide all
    if (overviewSection) overviewSection.style.display = 'none';
    if (predictionsSection) predictionsSection.style.display = 'none';
    if (profileSection) profileSection.style.display = 'none';
    if (walletSection) walletSection.style.display = 'none';
    document.querySelectorAll('.dash-nav-link').forEach((l) => l.classList.remove('active'));

    if (section === 'profile') {
      if (profileSection) profileSection.style.display = 'block';
      if (pageTitle) pageTitle.textContent = 'Profile & Settings';
      profileLinks.forEach((l) => l.classList.add('active'));
    } else if (section === 'predictions') {
      if (predictionsSection) predictionsSection.style.display = 'flex';
      if (pageTitle) pageTitle.textContent = 'My Toss Predictions';
      predictionsLinks.forEach((l) => l.classList.add('active'));
      loadMyPredictionsHistory();
    } else if (section === 'wallet') {
      if (walletSection) walletSection.style.display = 'flex';
      if (pageTitle) pageTitle.textContent = 'My Wallet';
      walletLinks.forEach((l) => l.classList.add('active'));
      loadWalletBalance();
      loadWalletTransactions(1);
      loadDemoPackages();
    } else {
      if (overviewSection) overviewSection.style.display = 'flex';
      if (pageTitle) pageTitle.textContent = 'Dashboard Overview';
      overviewLinks.forEach((l) => l.classList.add('active'));
    }
    closeSidebar();
  }

  overviewLinks.forEach((l) => l.addEventListener('click', (e) => {
    e.preventDefault();
    showSection('overview');
  }));

  predictionsLinks.forEach((l) => l.addEventListener('click', (e) => {
    e.preventDefault();
    showSection('predictions');
  }));

  profileLinks.forEach((l) => l.addEventListener('click', (e) => {
    e.preventDefault();
    showSection('profile');
  }));

  walletLinks.forEach((l) => l.addEventListener('click', (e) => {
    e.preventDefault();
    showSection('wallet');
  }));

  // Auto-activate section based on page pathname or hash
  if (window.location.pathname.includes('wallet.html') || window.location.hash === '#wallet') {
    showSection('wallet');
  } else if (window.location.hash === '#predictions') {
    showSection('predictions');
  }
}

/**
 * Loads user predictions history from /api/predictions/me
 */
async function loadMyPredictionsHistory() {
  const container = document.getElementById('predictionsListContainer');
  const countIndicator = document.getElementById('predictionCountIndicator');
  if (!container) return;

  container.innerHTML = `
    <div class="skeleton-card skeleton-shimmer" style="height: 80px;"></div>
    <div class="skeleton-card skeleton-shimmer" style="height: 80px;"></div>
  `;

  try {
    const config = window.TossArenaConfig || {};
    const url = config.getApiUrl
      ? config.getApiUrl(`${config.ENDPOINTS.PREDICTIONS || '/predictions'}/me`)
      : 'http://localhost:5000/api/predictions/me';

    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });

    if (!res.ok) throw new Error('Failed to load predictions history.');

    const payload = await res.json();
    const predictions = Array.isArray(payload.data) ? payload.data : [];

    if (countIndicator) {
      countIndicator.textContent = `${predictions.length} prediction${predictions.length === 1 ? '' : 's'}`;
    }

    if (predictions.length === 0) {
      container.innerHTML = `
        <div class="state-box" style="margin: var(--space-4) 0; border-style: dashed;">
          <div class="state-icon">🎯</div>
          <h3 class="state-title">No Predictions Yet</h3>
          <p class="state-desc">You haven't predicted any coin toss outcomes yet. Browse scheduled fixtures to forecast toss winners!</p>
          <a href="../pages/matches.html" class="btn btn-primary btn-sm">Explore Open Fixtures →</a>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    predictions.forEach((p) => {
      const item = document.createElement('div');
      item.className = 'prediction-history-item';

      const safeTeamA = escapeHtml(p.teamA || 'Team A');
      const safeTeamB = escapeHtml(p.teamB || 'Team B');
      const safePicked = escapeHtml(p.predictedTeam || 'TBD');
      const safeTournament = escapeHtml(p.tournamentName || 'Cricket Match');
      const statusKey = (p.predictionStatus || 'pending').toLowerCase();

      let statusBadge = `<span class="badge badge-amber" style="font-size: 0.7rem;">PENDING</span>`;
      if (statusKey === 'correct') {
        statusBadge = `<span class="badge badge-emerald" style="font-size: 0.7rem;">✓ CORRECT</span>`;
      } else if (statusKey === 'incorrect') {
        statusBadge = `<span class="badge" style="background: rgba(239,68,68,0.15); color: #fca5a5; font-size: 0.7rem;">✕ INCORRECT</span>`;
      } else if (statusKey === 'cancelled') {
        statusBadge = `<span class="badge" style="font-size: 0.7rem;">CANCELLED</span>`;
      }

      const matchSchedule = p.scheduledAt
        ? new Date(p.scheduledAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
        : 'TBD';

      const submittedAt = p.createdAt
        ? new Date(p.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'Recorded';

      item.innerHTML = `
        <div class="pred-item-main">
          <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: 2px;">
            <span style="font-size: var(--text-xs); color: var(--accent-mint); font-weight: 600;">${safeTournament}</span>
            ${statusBadge}
          </div>
          <div class="pred-item-match">
            ${safeTeamA} <span style="color: var(--accent-gold); font-size: 0.85rem;">vs</span> ${safeTeamB}
          </div>
          <div class="pred-item-meta">
            <span>📅 Match: ${matchSchedule}</span>
            <span>📍 ${escapeHtml(p.venue || 'Neutral Ground')}</span>
            <span>⏱️ Submitted: ${submittedAt}</span>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: var(--space-4); flex-wrap: wrap;">
          <div class="pred-item-pick-badge" title="Your Toss Prediction">
            🪙 ${safePicked}
          </div>
          <a href="../pages/match-details.html?id=${encodeURIComponent(p.matchId)}" class="btn btn-outline btn-sm">
            View Match →
          </a>
        </div>
      `;

      container.appendChild(item);
    });
  } catch (err) {
    console.error('Predictions load error:', err);
    container.innerHTML = `
      <div style="padding: var(--space-4); text-align: center; color: #fca5a5; font-size: var(--text-xs);">
        Could not load predictions history. Please refresh the page.
      </div>
    `;
    if (countIndicator) countIndicator.textContent = 'Error';
  }
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

let currentWalletPage = 1;
let currentWalletType = '';
let currentWalletSort = 'newest';
let totalWalletPages = 1;

/**
 * Loads authoritative virtual demo wallet balance from /api/wallet/me
 */
async function loadWalletBalance() {
  const balanceEl = document.getElementById('walletBalanceAmount');
  const statDemoBalance = document.getElementById('statDemoBalance');
  const lastUpdatedEl = document.getElementById('walletLastUpdatedText');

  if (balanceEl) balanceEl.textContent = 'Updating...';

  try {
    const data = await window.TossArenaAuth.getWallet();
    const formatted = Number(data.balance || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    if (balanceEl) balanceEl.textContent = formatted;
    if (statDemoBalance) statDemoBalance.textContent = formatted;
    if (lastUpdatedEl) {
      const timeStr = data.updatedAt
        ? new Date(data.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'Just now';
      lastUpdatedEl.textContent = `Last updated: ${timeStr} UTC`;
    }
    return data;
  } catch (err) {
    console.error('Wallet balance fetch error:', err);
    if (balanceEl) balanceEl.textContent = 'Error';
    if (lastUpdatedEl) lastUpdatedEl.textContent = 'Failed to retrieve balance';
  }
}

/**
 * Loads paginated transaction history from /api/wallet/transactions
 */
async function loadWalletTransactions(page = 1) {
  const tableBody = document.getElementById('walletTxTableBody');
  const emptyState = document.getElementById('walletTxEmptyState');
  const errorState = document.getElementById('walletTxErrorState');
  const errorMessage = document.getElementById('walletTxErrorMessage');
  const tableWrap = document.getElementById('walletTxTableWrap');
  const pageInfo = document.getElementById('walletPageInfo');
  const prevBtn = document.getElementById('walletPrevPageBtn');
  const nextBtn = document.getElementById('walletNextPageBtn');
  const countIndicator = document.getElementById('walletTxCountIndicator');

  if (!tableBody) return;

  currentWalletPage = page;

  // Show loading in table
  if (emptyState) emptyState.style.display = 'none';
  if (errorState) errorState.style.display = 'none';
  if (tableWrap) tableWrap.style.display = 'block';

  tableBody.innerHTML = `
    <tr>
      <td colspan="6" style="text-align: center; padding: var(--space-6); color: var(--text-muted);">
        Loading ledger transactions...
      </td>
    </tr>
  `;

  try {
    const result = await window.TossArenaAuth.getWalletTransactions({
      page,
      limit: 10,
      type: currentWalletType || undefined,
      sort: currentWalletSort
    });

    const txs = result.transactions || [];
    const pagination = result.pagination || { page: 1, limit: 10, total: 0, totalPages: 0 };
    totalWalletPages = pagination.totalPages || 1;

    if (countIndicator) {
      countIndicator.textContent = `${pagination.total} Total Ledger Record${pagination.total === 1 ? '' : 's'}`;
    }

    if (pageInfo) {
      pageInfo.textContent = `Page ${pagination.page} of ${pagination.totalPages || 1} (${pagination.total} transaction${pagination.total === 1 ? '' : 's'})`;
    }

    if (prevBtn) prevBtn.disabled = pagination.page <= 1;
    if (nextBtn) nextBtn.disabled = pagination.page >= pagination.totalPages || pagination.totalPages === 0;

    if (txs.length === 0) {
      if (tableWrap) tableWrap.style.display = 'none';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    tableBody.innerHTML = '';

    txs.forEach((tx) => {
      const tr = document.createElement('tr');

      const dateFormatted = tx.createdAt
        ? new Date(tx.createdAt).toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        : 'Recorded';

      let badgeClass = 'tx-badge-grant';
      let badgeLabel = 'Credit Grant';
      let isCredit = true;

      switch (tx.transactionType) {
        case 'demo_grant':
          badgeClass = 'tx-badge-grant';
          badgeLabel = 'Credit Grant';
          isCredit = true;
          break;
        case 'prediction_debit':
          badgeClass = 'tx-badge-debit';
          badgeLabel = 'Prediction Stake';
          isCredit = false;
          break;
        case 'prediction_refund':
          badgeClass = 'tx-badge-refund';
          badgeLabel = 'Prediction Refund';
          isCredit = true;
          break;
        case 'demo_adjustment':
          badgeClass = 'tx-badge-adjustment';
          badgeLabel = 'Credit Adjustment';
          isCredit = true;
          break;
        case 'demo_result_credit':
          badgeClass = 'tx-badge-result';
          badgeLabel = 'Result Credit';
          isCredit = true;
          break;
        default:
          badgeClass = 'tx-badge-grant';
          badgeLabel = tx.transactionType;
      }

      const formattedAmount = Number(tx.amount || 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });

      const formattedBalanceAfter = Number(tx.balanceAfter || 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });

      const amountClass = isCredit ? 'tx-amount-credit' : 'tx-amount-debit';
      const amountSign = isCredit ? '+' : '-';

      let refText = '—';
      if (tx.referenceType && tx.referenceId) {
        refText = `${escapeHtml(tx.referenceType)} #${escapeHtml(String(tx.referenceId))}`;
      } else if (tx.referenceType) {
        refText = escapeHtml(tx.referenceType);
      }

      tr.innerHTML = `
        <td style="font-size: var(--text-xs); color: var(--text-muted);">${dateFormatted}</td>
        <td>
          <span class="tx-badge ${badgeClass}">${badgeLabel}</span>
        </td>
        <td style="color: var(--text-primary); font-weight: 500;">${escapeHtml(tx.description || 'Credit ledger entry')}</td>
        <td style="font-size: var(--text-xs); color: var(--text-muted);">${refText}</td>
        <td class="${amountClass}">
          ${amountSign}${formattedAmount} <span style="font-size: 0.75rem; font-weight: 600;">Credits</span>
        </td>
        <td class="tx-balance-after">
          ${formattedBalanceAfter} <span style="font-size: 0.75rem; color: var(--text-muted);">Credits</span>
        </td>
      `;

      tableBody.appendChild(tr);
    });
  } catch (err) {
    console.error('Transactions load error:', err);
    if (tableWrap) tableWrap.style.display = 'none';
    if (errorState) errorState.style.display = 'block';
    if (errorMessage) errorMessage.textContent = err.message || 'Failed to fetch transaction history.';
  }
}

/**
 * Initializes Wallet filter, pagination, and refresh buttons
 */
function initWalletControls() {
  const typeFilter = document.getElementById('walletTypeFilter');
  const sortFilter = document.getElementById('walletSortFilter');
  const refreshTxBtn = document.getElementById('walletRefreshTxBtn');
  const refreshBalanceBtn = document.getElementById('walletRefreshBalanceBtn');
  const prevBtn = document.getElementById('walletPrevPageBtn');
  const nextBtn = document.getElementById('walletNextPageBtn');
  const retryBtn = document.getElementById('walletTxRetryBtn');

  if (typeFilter) {
    typeFilter.addEventListener('change', (e) => {
      currentWalletType = e.target.value;
      currentWalletPage = 1;
      loadWalletTransactions(1);
    });
  }

  if (sortFilter) {
    sortFilter.addEventListener('change', (e) => {
      currentWalletSort = e.target.value;
      currentWalletPage = 1;
      loadWalletTransactions(1);
    });
  }

  if (refreshTxBtn) {
    refreshTxBtn.addEventListener('click', () => {
      loadWalletTransactions(currentWalletPage);
    });
  }

  if (refreshBalanceBtn) {
    refreshBalanceBtn.addEventListener('click', () => {
      loadWalletBalance();
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentWalletPage > 1) {
        currentWalletPage--;
        loadWalletTransactions(currentWalletPage);
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (currentWalletPage < totalWalletPages) {
        currentWalletPage++;
        loadWalletTransactions(currentWalletPage);
      }
    });
  }

  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      loadWalletTransactions(currentWalletPage);
    });
  }
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

/* ==========================================================================
   DAY 9: VIRTUAL DEMO CREDIT PACKAGES & FUNDING SIMULATION
   ========================================================================== */

let selectedDemoPackage = null;
let currentWalletBalanceNum = 0;

/**
 * Loads configured demo packages from /api/wallet/demo-packages
 */
async function loadDemoPackages() {
  const container = document.getElementById('packagesContainer');
  const alreadyClaimedSection = document.getElementById('sectionAlreadyClaimed');
  const claimedDetailsText = document.getElementById('claimedPackageDetailsText');
  const badgeEl = document.getElementById('packageClaimBadge');

  if (!container && !alreadyClaimedSection) return;

  try {
    const res = await window.TossArenaAuth.getDemoPackages();
    const data = res.data || {};
    const packages = data.packages || [];
    const userClaim = data.userClaim || { hasClaimed: false };

    if (userClaim.hasClaimed) {
      // User has already claimed their initial one-time grant
      if (container) container.style.display = 'none';
      if (alreadyClaimedSection) {
        alreadyClaimedSection.style.display = 'flex';
        if (claimedDetailsText) {
          const dateStr = userClaim.claimedAt
            ? new Date(userClaim.claimedAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })
            : 'earlier';
          const pkgName = userClaim.claimedPackageName || userClaim.claimedPackageId || 'Initial';
          const creditsStr = Number(userClaim.claimedCredits || 0).toLocaleString();
          claimedDetailsText.innerHTML = `You claimed the <strong>${escapeHtml(pkgName)}</strong> package (+${creditsStr} credits) on ${dateStr}. Per platform rules, credit grants are strictly one-time per user account.`;
        }
      }
      if (badgeEl) {
        badgeEl.textContent = 'Grant Claimed';
        badgeEl.className = 'badge badge-emerald';
      }
      return;
    }

    // User is eligible to claim
    if (alreadyClaimedSection) alreadyClaimedSection.style.display = 'none';
    if (container) {
      container.style.display = 'grid';
      container.innerHTML = '';

      if (badgeEl) {
        badgeEl.textContent = 'One-Time Initial Claim';
        badgeEl.className = 'badge badge-amber';
      }

      packages.forEach((pkg) => {
        const card = document.createElement('div');
        card.className = 'package-card';
        card.setAttribute('data-package-id', pkg.id);

        const creditsFormatted = Number(pkg.demoCredits || 0).toLocaleString();

        card.innerHTML = `
          <div class="package-header">
            <h4 class="package-name">${escapeHtml(pkg.name)}</h4>
            <div class="package-credits">
              ${creditsFormatted}
              <span class="package-credits-unit">Credits</span>
            </div>
            <div class="package-desc">${escapeHtml(pkg.description || 'Platform credit allocation')}</div>
          </div>
          <div class="package-features">
            <div class="package-feature-item">
              <span class="package-feature-icon">🛡️</span>
              <span>Platform Credits • No Cash Value</span>
            </div>
            <div class="package-feature-item">
              <span class="package-feature-icon">⚡</span>
              <span>Instant Allocation</span>
            </div>
            <div class="package-feature-item">
              <span class="package-feature-icon">🎯</span>
              <span>For Toss Predictions Only</span>
            </div>
          </div>
          <button type="button" class="btn btn-primary btn-sm btn-select-package" style="width: 100%; margin-top: auto;" data-package-id="${escapeHtml(pkg.id)}" data-package-name="${escapeHtml(pkg.name)}" data-package-credits="${pkg.demoCredits}">
            Select ${escapeHtml(pkg.name)} →
          </button>
        `;

        container.appendChild(card);
      });

      // Bind selection handlers
      container.querySelectorAll('.btn-select-package').forEach((btn) => {
        btn.addEventListener('click', () => {
          const pkgId = btn.getAttribute('data-package-id');
          const pkgName = btn.getAttribute('data-package-name');
          const pkgCredits = Number(btn.getAttribute('data-package-credits') || 0);
          openClaimModal({ id: pkgId, name: pkgName, demoCredits: pkgCredits });
        });
      });
    }
  } catch (err) {
    console.error('Failed to load demo packages:', err);
    if (container) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; padding: var(--space-6); text-align: center; color: #fca5a5; font-size: var(--text-xs);">
          ⚠️ Unable to load available packages. Please verify server connection and refresh.
        </div>
      `;
    }
  }
}

/**
 * Opens claim confirmation modal
 */
function openClaimModal(pkg) {
  selectedDemoPackage = pkg;

  const modal = document.getElementById('claimConfirmModal');
  const pkgNameEl = document.getElementById('modalPackageName');
  const creditsAmountEl = document.getElementById('modalCreditsAmount');
  const currentBalanceEl = document.getElementById('modalCurrentBalance');
  const expectedBalanceEl = document.getElementById('modalExpectedBalance');
  const alertEl = document.getElementById('modalClaimAlert');
  const confirmBtn = document.getElementById('btnConfirmClaim');

  if (!modal) return;

  if (alertEl) {
    alertEl.style.display = 'none';
    alertEl.textContent = '';
    alertEl.className = 'alert-banner';
  }

  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Confirm & Add Credits';
  }

  // Read current balance
  const balanceText = document.getElementById('walletBalanceAmount')?.textContent || '0';
  const cleanBalance = parseFloat(balanceText.replace(/,/g, '')) || 0;
  currentWalletBalanceNum = cleanBalance;
  const expected = cleanBalance + (pkg.demoCredits || 0);

  if (pkgNameEl) pkgNameEl.textContent = `${pkg.name} Package`;
  if (creditsAmountEl) creditsAmountEl.textContent = `+${Number(pkg.demoCredits || 0).toLocaleString()} Credits`;
  if (currentBalanceEl) currentBalanceEl.textContent = `${cleanBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Credits`;
  if (expectedBalanceEl) expectedBalanceEl.textContent = `${expected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Credits`;

  modal.classList.add('is-open');
}

/**
 * Closes claim confirmation modal
 */
function closeClaimModal() {
  const modal = document.getElementById('claimConfirmModal');
  if (modal) modal.classList.remove('is-open');
  selectedDemoPackage = null;
}

/**
 * Initializes Demo Package controls, modal listeners, and claim submission
 */
function initDemoPackageControls() {
  const modal = document.getElementById('claimConfirmModal');
  const cancelBtn = document.getElementById('btnCancelClaim');
  const cancelXBtn = document.getElementById('btnCancelClaimX');
  const confirmBtn = document.getElementById('btnConfirmClaim');
  const alertEl = document.getElementById('modalClaimAlert');

  if (cancelBtn) cancelBtn.addEventListener('click', closeClaimModal);
  if (cancelXBtn) cancelXBtn.addEventListener('click', closeClaimModal);

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeClaimModal();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('is-open')) {
      closeClaimModal();
    }
  });

  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      if (!selectedDemoPackage) return;

      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span>⏳ Processing Allocation...</span>';

      if (alertEl) {
        alertEl.style.display = 'none';
        alertEl.textContent = '';
      }

      // Generate client-side idempotency key
      const idempotencyKey = `claim_${currentDashboardUser ? currentDashboardUser.id : 'usr'}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      try {
        const result = await window.TossArenaAuth.claimDemoCredits(selectedDemoPackage.id, idempotencyKey);

        // Success!
        closeClaimModal();

        // Refresh all relevant states
        await loadWalletBalance();
        loadDashboardSummary();
        loadWalletTransactions(1);
        await loadDemoPackages();

        // Show feedback alert/notification
        alert(`✅ Success: ${result.message || 'Credits have been successfully allocated to your wallet!'}`);
      } catch (err) {
        console.error('Claim credits error:', err);
        if (alertEl) {
          alertEl.textContent = err.message || 'Failed to claim credits.';
          alertEl.className = 'alert-banner alert-banner-error';
          alertEl.style.display = 'block';
        }
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirm & Add Credits';
      }
    });
  }
}

