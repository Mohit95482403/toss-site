/**
 * TossArena Admin Match Management Client (Day 11)
 * Controls administrative match scheduling, search, filtering, pagination,
 * prediction protection enforcement, lifecycle status changes, and cancellation.
 */

(function () {
  'use strict';

  // State Management
  let currentPage = 1;
  const pageLimit = 15;
  let activeMatches = [];
  let currentSummary = null;

  // DOM Elements
  const adminDashboardView = document.getElementById('adminDashboardView');
  const adminAccessDeniedBanner = document.getElementById('adminAccessDeniedBanner');
  const adminUserName = document.getElementById('adminUserName');
  const adminUserEmail = document.getElementById('adminUserEmail');
  const adminUserAvatar = document.getElementById('adminUserAvatar');
  const adminLogoutBtn = document.getElementById('adminLogoutBtn');

  // Summary Stat Elements
  const statTotalMatches = document.getElementById('statTotalMatches');
  const statOpenMatches = document.getElementById('statOpenMatches');
  const statUpcomingMatches = document.getElementById('statUpcomingMatches');
  const statLockedMatches = document.getElementById('statLockedMatches');
  const statCompletedMatches = document.getElementById('statCompletedMatches');
  const statCancelledMatches = document.getElementById('statCancelledMatches');
  const statTotalPredictions = document.getElementById('statTotalPredictions');

  // Filter & Search Elements
  const filterForm = document.getElementById('filterForm');
  const filterSearch = document.getElementById('filterSearch');
  const filterStatus = document.getElementById('filterStatus');
  const filterDatePreset = document.getElementById('filterDatePreset');
  const filterDateFrom = document.getElementById('filterDateFrom');
  const filterDateTo = document.getElementById('filterDateTo');
  const filterSort = document.getElementById('filterSort');
  const customDateRow = document.getElementById('customDateRow');
  const btnClearFilters = document.getElementById('btnClearFilters');
  const btnRefreshMatches = document.getElementById('btnRefreshMatches');
  const btnEmptyResetFilters = document.getElementById('btnEmptyResetFilters');

  // Table & State Elements
  const matchesTableWrapper = document.getElementById('matchesTableWrapper');
  const matchesTableBody = document.getElementById('matchesTableBody');
  const matchesLoadingState = document.getElementById('matchesLoadingState');
  const matchesEmptyState = document.getElementById('matchesEmptyState');

  // Pagination Elements
  const paginationSummary = document.getElementById('paginationSummary');
  const pageIndicator = document.getElementById('pageIndicator');
  const btnPrevPage = document.getElementById('btnPrevPage');
  const btnNextPage = document.getElementById('btnNextPage');

  // Modals
  const modalCreateMatch = document.getElementById('modalCreateMatch');
  const formCreateMatch = document.getElementById('formCreateMatch');
  const btnOpenCreateModal = document.getElementById('btnOpenCreateModal');
  const createMatchErrorBox = document.getElementById('createMatchErrorBox');
  const btnSubmitCreateMatch = document.getElementById('btnSubmitCreateMatch');

  const modalEditMatch = document.getElementById('modalEditMatch');
  const formEditMatch = document.getElementById('formEditMatch');
  const editMatchErrorBox = document.getElementById('editMatchErrorBox');
  const editPredictionLockedAlert = document.getElementById('editPredictionLockedAlert');
  const editPredictionCount = document.getElementById('editPredictionCount');
  const btnSubmitEditMatch = document.getElementById('btnSubmitEditMatch');

  const modalStatusTransition = document.getElementById('modalStatusTransition');
  const formStatusTransition = document.getElementById('formStatusTransition');
  const statusErrorBox = document.getElementById('statusErrorBox');
  const statusTargetSelect = document.getElementById('statusTargetSelect');
  const statusTransitionExplanation = document.getElementById('statusTransitionExplanation');
  const btnSubmitStatusChange = document.getElementById('btnSubmitStatusChange');

  const modalCancelMatch = document.getElementById('modalCancelMatch');
  const formCancelMatch = document.getElementById('formCancelMatch');
  const cancelErrorBox = document.getElementById('cancelErrorBox');
  const cancelReasonInput = document.getElementById('cancelReasonInput');
  const btnSubmitCancelMatch = document.getElementById('btnSubmitCancelMatch');

  const modalMatchDetails = document.getElementById('modalMatchDetails');
  const matchDetailsContent = document.getElementById('matchDetailsContent');

  const toastContainer = document.getElementById('toastContainer');

  // Status Lifecycle Transition Matrix
  const STATUS_TRANSITION_MAP = {
    upcoming: [
      { value: 'open', label: 'Open for Predictions', desc: 'Allows users to place toss predictions on this match.' },
      { value: 'cancelled', label: 'Cancel Match', desc: 'Safely marks match as cancelled while preserving history.' }
    ],
    open: [
      { value: 'locked', label: 'Lock Predictions', desc: 'Prevents any further predictions. Enforces cutoff.' },
      { value: 'cancelled', label: 'Cancel Match', desc: 'Safely cancels fixture and halts predictions.' }
    ],
    locked: [
      { value: 'completed', label: 'Mark as Completed', desc: 'Match has concluded. Prepares for official result verification.' },
      { value: 'open', label: 'Reopen for Predictions', desc: 'Reopens predictions only if match scheduled time has not passed.' },
      { value: 'cancelled', label: 'Cancel Match', desc: 'Safely cancels fixture.' }
    ],
    completed: [], // Terminal state
    cancelled: []  // Terminal state
  };

  /**
   * Helper to format API endpoints
   */
  function getApiUrl(endpoint) {
    if (window.TossArenaConfig && window.TossArenaConfig.getApiUrl) {
      return window.TossArenaConfig.getApiUrl(endpoint);
    }
    return `http://localhost:5000/api${endpoint}`;
  }

  /**
   * Displays floating toast notification
   */
  function showToast(message, type = 'success') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  /**
   * Format ISO date string into readable local representation
   */
  function formatDateTime(isoString) {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return isoString;
    }
  }

  /**
   * Status badge styling helper
   */
  function getStatusBadgeHtml(status) {
    const s = String(status || '').toLowerCase();
    switch (s) {
      case 'open':
        return `<span class="badge status-badge-open">● Open</span>`;
      case 'upcoming':
        return `<span class="badge status-badge-upcoming">Upcoming</span>`;
      case 'locked':
        return `<span class="badge status-badge-locked">🔒 Locked</span>`;
      case 'completed':
        return `<span class="badge status-badge-completed">✔ Completed</span>`;
      case 'cancelled':
        return `<span class="badge status-badge-cancelled">✕ Cancelled</span>`;
      default:
        return `<span class="badge">${escapeHtml(status)}</span>`;
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

  /**
   * Modal Open / Close Controller
   */
  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add('active');
    modalEl.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove('active');
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // Setup modal close listeners
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-close-modal');
      closeModal(document.getElementById(targetId));
    });
  });

  // Close modals when clicking backdrop
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(overlay);
      }
    });
  });

  // Close modals on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(closeModal);
    }
  });

  /**
   * Initializes administrator session & verifies role
   */
  async function initAdminAuth() {
    try {
      const user = await window.TossArenaAuth.getCurrentUser();

      if (!user || user.role !== 'admin') {
        adminAccessDeniedBanner.style.display = 'block';
        adminDashboardView.style.display = 'none';
        return false;
      }

      adminAccessDeniedBanner.style.display = 'none';
      adminDashboardView.style.display = 'block';

      if (adminUserName) adminUserName.textContent = user.fullName || 'Admin User';
      if (adminUserEmail) adminUserEmail.textContent = user.email || '';
      if (adminUserAvatar) adminUserAvatar.textContent = (user.fullName || 'A').charAt(0).toUpperCase();

      return true;
    } catch (err) {
      adminAccessDeniedBanner.style.display = 'block';
      adminDashboardView.style.display = 'none';
      return false;
    }
  }

  /**
   * Loads match summary counts from MySQL
   */
  async function loadSummaryStats() {
    try {
      const response = await fetch(getApiUrl('/admin/matches/summary'), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      });

      if (!response.ok) return;

      const result = await response.json();
      if (!result.success || !result.data) return;

      currentSummary = result.data;

      if (statTotalMatches) statTotalMatches.textContent = Number(currentSummary.total || 0).toLocaleString();
      if (statOpenMatches) statOpenMatches.textContent = Number(currentSummary.open || 0).toLocaleString();
      if (statUpcomingMatches) statUpcomingMatches.textContent = Number(currentSummary.upcoming || 0).toLocaleString();
      if (statLockedMatches) statLockedMatches.textContent = Number(currentSummary.locked || 0).toLocaleString();
      if (statCompletedMatches) statCompletedMatches.textContent = Number(currentSummary.completed || 0).toLocaleString();
      if (statCancelledMatches) statCancelledMatches.textContent = Number(currentSummary.cancelled || 0).toLocaleString();
      if (statTotalPredictions) statTotalPredictions.textContent = Number(currentSummary.totalPredictions || 0).toLocaleString();
    } catch (err) {
      console.warn('Failed to load summary stats:', err);
    }
  }

  /**
   * Loads paginated, filtered matches from the database
   */
  async function loadMatches(page = 1) {
    currentPage = page;
    matchesLoadingState.style.display = 'block';
    matchesEmptyState.style.display = 'none';
    matchesTableWrapper.style.display = 'none';

    try {
      const params = new URLSearchParams();
      params.set('page', currentPage);
      params.set('limit', pageLimit);

      const searchVal = filterSearch.value.trim();
      if (searchVal) params.set('search', searchVal);

      const statusVal = filterStatus.value;
      if (statusVal && statusVal !== 'all') params.set('status', statusVal);

      const datePresetVal = filterDatePreset.value;
      if (datePresetVal && datePresetVal !== 'all') {
        params.set('dateFilter', datePresetVal);
        if (datePresetVal === 'custom') {
          if (filterDateFrom.value) params.set('dateFrom', filterDateFrom.value);
          if (filterDateTo.value) params.set('dateTo', filterDateTo.value);
        }
      }

      const sortVal = filterSort.value;
      if (sortVal) params.set('sort', sortVal);

      const response = await fetch(`${getApiUrl('/admin/matches')}?${params.toString()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      });

      if (response.status === 401 || response.status === 403) {
        adminAccessDeniedBanner.style.display = 'block';
        adminDashboardView.style.display = 'none';
        return;
      }

      const result = await response.json();
      matchesLoadingState.style.display = 'none';

      if (!response.ok || !result.success) {
        showToast(result.message || 'Failed to load matches.', 'error');
        return;
      }

      activeMatches = result.data || [];
      const pagination = result.pagination || { page: 1, limit: pageLimit, total: 0, totalPages: 0 };

      renderMatchesTable(activeMatches);
      updatePaginationControls(pagination);

      // If backend returns summary payload, synchronize cards
      if (result.summary) {
        currentSummary = result.summary;
        if (statTotalMatches) statTotalMatches.textContent = Number(currentSummary.total || 0).toLocaleString();
        if (statOpenMatches) statOpenMatches.textContent = Number(currentSummary.open || 0).toLocaleString();
        if (statUpcomingMatches) statUpcomingMatches.textContent = Number(currentSummary.upcoming || 0).toLocaleString();
        if (statLockedMatches) statLockedMatches.textContent = Number(currentSummary.locked || 0).toLocaleString();
        if (statCompletedMatches) statCompletedMatches.textContent = Number(currentSummary.completed || 0).toLocaleString();
        if (statCancelledMatches) statCancelledMatches.textContent = Number(currentSummary.cancelled || 0).toLocaleString();
        if (statTotalPredictions) statTotalPredictions.textContent = Number(currentSummary.totalPredictions || 0).toLocaleString();
      }
    } catch (err) {
      matchesLoadingState.style.display = 'none';
      showToast('Error communicating with TossArena backend.', 'error');
    }
  }

  /**
   * Renders matches into the table
   */
  function renderMatchesTable(matches) {
    matchesTableBody.innerHTML = '';

    if (!matches || matches.length === 0) {
      matchesEmptyState.style.display = 'block';
      matchesTableWrapper.style.display = 'none';
      return;
    }

    matchesEmptyState.style.display = 'none';
    matchesTableWrapper.style.display = 'block';

    matches.forEach((m) => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--border-subtle)';

      const isTerminal = m.status === 'completed' || m.status === 'cancelled';
      const predCount = Number(m.predictionCount || m.prediction_count || 0);

      tr.innerHTML = `
        <td style="padding: 1rem 1.25rem; font-family: monospace; color: var(--text-muted);">
          #${m.id}
        </td>
        <td style="padding: 1rem 1.25rem;">
          <div style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">
            ${escapeHtml(m.teamA || m.team_a)} <span style="color: var(--accent-mint); font-weight: normal;">vs</span> ${escapeHtml(m.teamB || m.team_b)}
          </div>
          <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.2rem;">
            ${escapeHtml(m.title)}
          </div>
        </td>
        <td style="padding: 1rem 1.25rem;">
          <div style="color: var(--text-primary); font-size: 0.85rem;">
            🏟️ ${escapeHtml(m.venue || 'Neutral Ground')}
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.2rem;">
            🏆 ${escapeHtml(m.tournamentName || m.tournament_name || 'Cricket Series')}
          </div>
        </td>
        <td style="padding: 1rem 1.25rem;">
          <div style="color: var(--text-primary); font-size: 0.85rem; font-weight: 500;">
            📅 ${formatDateTime(m.scheduledAt || m.scheduled_at)}
          </div>
        </td>
        <td style="padding: 1rem 1.25rem;">
          <span class="badge ${predCount > 0 ? 'badge-amber' : ''}" style="font-size: 0.78rem;">
            🎯 ${predCount} ${predCount === 1 ? 'pick' : 'picks'}
          </span>
        </td>
        <td style="padding: 1rem 1.25rem;">
          ${getStatusBadgeHtml(m.status)}
        </td>
        <td style="padding: 1rem 1.25rem; text-align: right;">
          <div class="action-btn-group">
            <button type="button" class="action-btn btn-view-match" data-match-id="${m.id}" title="Inspect Match Details">
              👁️ View
            </button>
            <button type="button" class="action-btn btn-edit-match" data-match-id="${m.id}" ${isTerminal ? 'disabled title="Cannot edit terminal match"' : 'title="Edit Match Details"'}>
              ✏️ Edit
            </button>
            <button type="button" class="action-btn action-btn-primary btn-status-match" data-match-id="${m.id}" ${isTerminal ? 'disabled title="Terminal state is immutable"' : 'title="Change Lifecycle Status"'}>
              ⚡ Status
            </button>
            <button type="button" class="action-btn action-btn-danger btn-cancel-match" data-match-id="${m.id}" ${isTerminal ? 'disabled title="Already terminal"' : 'title="Cancel Match"'}>
              ✕ Cancel
            </button>
          </div>
        </td>
      `;

      matchesTableBody.appendChild(tr);
    });

    attachTableRowListeners();
  }

  /**
   * Attaches click handlers to action buttons in match rows
   */
  function attachTableRowListeners() {
    // 1. View Match
    document.querySelectorAll('.btn-view-match').forEach((btn) => {
      btn.addEventListener('click', () => {
        const matchId = btn.getAttribute('data-match-id');
        openMatchDetailsModal(matchId);
      });
    });

    // 2. Edit Match
    document.querySelectorAll('.btn-edit-match').forEach((btn) => {
      btn.addEventListener('click', () => {
        const matchId = btn.getAttribute('data-match-id');
        openEditMatchModal(matchId);
      });
    });

    // 3. Status Change
    document.querySelectorAll('.btn-status-match').forEach((btn) => {
      btn.addEventListener('click', () => {
        const matchId = btn.getAttribute('data-match-id');
        openStatusTransitionModal(matchId);
      });
    });

    // 4. Cancel Match
    document.querySelectorAll('.btn-cancel-match').forEach((btn) => {
      btn.addEventListener('click', () => {
        const matchId = btn.getAttribute('data-match-id');
        openCancelMatchModal(matchId);
      });
    });
  }

  /**
   * Updates pagination buttons and indicators
   */
  function updatePaginationControls(pagination) {
    const { page, total, totalPages } = pagination;
    const startIdx = total === 0 ? 0 : (page - 1) * pageLimit + 1;
    const endIdx = Math.min(page * pageLimit, total);

    paginationSummary.textContent = `Showing ${startIdx}-${endIdx} of ${total} matches`;
    pageIndicator.textContent = `Page ${page} of ${Math.max(1, totalPages)}`;

    btnPrevPage.disabled = page <= 1;
    btnNextPage.disabled = page >= totalPages;
  }

  // Pagination navigation listeners
  btnPrevPage.addEventListener('click', () => {
    if (currentPage > 1) {
      loadMatches(currentPage - 1);
    }
  });

  btnNextPage.addEventListener('click', () => {
    loadMatches(currentPage + 1);
  });

  // Filter form submission
  filterForm.addEventListener('submit', (e) => {
    e.preventDefault();
    loadMatches(1);
  });

  // Reset filters
  btnClearFilters.addEventListener('click', () => {
    filterForm.reset();
    customDateRow.style.display = 'none';
    loadMatches(1);
  });

  if (btnEmptyResetFilters) {
    btnEmptyResetFilters.addEventListener('click', () => {
      filterForm.reset();
      customDateRow.style.display = 'none';
      loadMatches(1);
    });
  }

  btnRefreshMatches.addEventListener('click', () => {
    loadSummaryStats();
    loadMatches(currentPage);
    showToast('Match list refreshed.', 'success');
  });

  // Toggle custom date picker visibility
  filterDatePreset.addEventListener('change', () => {
    if (filterDatePreset.value === 'custom') {
      customDateRow.style.display = 'grid';
    } else {
      customDateRow.style.display = 'none';
      filterDateFrom.value = '';
      filterDateTo.value = '';
    }
  });

  // ==========================================================================
  // CREATE MATCH WORKFLOW
  // ==========================================================================
  btnOpenCreateModal.addEventListener('click', () => {
    formCreateMatch.reset();
    createMatchErrorBox.style.display = 'none';
    createMatchErrorBox.textContent = '';

    // Set default scheduledAt to tomorrow 14:00
    const tomorrow = new Date(Date.now() + 86400000);
    tomorrow.setHours(14, 0, 0, 0);
    const localIso = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    document.getElementById('createScheduledAt').value = localIso;

    openModal(modalCreateMatch);
  });

  formCreateMatch.addEventListener('submit', async (e) => {
    e.preventDefault();
    createMatchErrorBox.style.display = 'none';
    createMatchErrorBox.textContent = '';

    const teamA = document.getElementById('createTeamA').value.trim();
    const teamB = document.getElementById('createTeamB').value.trim();
    const tournamentName = document.getElementById('createTournament').value.trim();
    const venue = document.getElementById('createVenue').value.trim();
    const scheduledAtVal = document.getElementById('createScheduledAt').value;
    const initialStatus = document.getElementById('createInitialStatus').value;

    // Client-side validations
    if (teamA.toLowerCase() === teamB.toLowerCase()) {
      createMatchErrorBox.textContent = 'Team One and Team Two must be distinct teams.';
      createMatchErrorBox.style.display = 'block';
      return;
    }

    const scheduledDate = new Date(scheduledAtVal);
    if (scheduledDate.getTime() <= Date.now()) {
      createMatchErrorBox.textContent = 'Scheduled match time must be set in the future.';
      createMatchErrorBox.style.display = 'block';
      return;
    }

    btnSubmitCreateMatch.disabled = true;
    btnSubmitCreateMatch.textContent = 'Creating...';

    try {
      const csrfToken = await window.TossArenaAuth.getCsrfToken();
      const response = await fetch(getApiUrl('/admin/matches'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({
          teamA,
          teamB,
          tournamentName,
          venue,
          scheduledAt: scheduledDate.toISOString(),
          status: initialStatus
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        createMatchErrorBox.textContent = result.message || 'Failed to create match.';
        createMatchErrorBox.style.display = 'block';
        btnSubmitCreateMatch.disabled = false;
        btnSubmitCreateMatch.textContent = 'Create Match';
        return;
      }

      closeModal(modalCreateMatch);
      showToast(`Match fixture "${result.data.title}" created successfully!`, 'success');
      loadSummaryStats();
      loadMatches(1);
    } catch (err) {
      createMatchErrorBox.textContent = 'Error connecting to server. Please try again.';
      createMatchErrorBox.style.display = 'block';
    } finally {
      btnSubmitCreateMatch.disabled = false;
      btnSubmitCreateMatch.textContent = 'Create Match';
    }
  });

  // ==========================================================================
  // EDIT MATCH WORKFLOW (WITH PREDICTION PROTECTION)
  // ==========================================================================
  async function openEditMatchModal(matchId) {
    editMatchErrorBox.style.display = 'none';
    editMatchErrorBox.textContent = '';
    formEditMatch.reset();

    try {
      const response = await fetch(getApiUrl(`/admin/matches/${matchId}`), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      });

      if (!response.ok) {
        showToast('Unable to load match details for editing.', 'error');
        return;
      }

      const result = await response.json();
      const m = result.data;

      document.getElementById('editMatchId').value = m.id;
      document.getElementById('editTeamA').value = m.teamA || m.team_a;
      document.getElementById('editTeamB').value = m.teamB || m.team_b;
      document.getElementById('editTournament').value = m.tournamentName || m.tournament_name;
      document.getElementById('editVenue').value = m.venue;

      // Format scheduled date for datetime-local input
      const schedDate = new Date(m.scheduledAt || m.scheduled_at);
      const localIso = new Date(schedDate.getTime() - schedDate.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      document.getElementById('editScheduledAt').value = localIso;

      const predCount = Number(m.predictionCount || m.prediction_count || 0);

      // PREDICTION INTEGRITY PROTECTION:
      // If match has active user predictions, lock team names to prevent corrupting historical records
      if (predCount > 0) {
        document.getElementById('editTeamA').disabled = true;
        document.getElementById('editTeamB').disabled = true;
        editPredictionCount.textContent = predCount;
        editPredictionLockedAlert.style.display = 'block';
      } else {
        document.getElementById('editTeamA').disabled = false;
        document.getElementById('editTeamB').disabled = false;
        editPredictionLockedAlert.style.display = 'none';
      }

      openModal(modalEditMatch);
    } catch (err) {
      showToast('Error loading match for edit.', 'error');
    }
  }

  formEditMatch.addEventListener('submit', async (e) => {
    e.preventDefault();
    editMatchErrorBox.style.display = 'none';
    editMatchErrorBox.textContent = '';

    const matchId = document.getElementById('editMatchId').value;
    const teamAInput = document.getElementById('editTeamA');
    const teamBInput = document.getElementById('editTeamB');
    const tournamentName = document.getElementById('editTournament').value.trim();
    const venue = document.getElementById('editVenue').value.trim();
    const scheduledAtVal = document.getElementById('editScheduledAt').value;

    const payload = {
      tournamentName,
      venue,
      scheduledAt: new Date(scheduledAtVal).toISOString()
    };

    // Include team names only if inputs were editable (no predictions)
    if (!teamAInput.disabled && !teamBInput.disabled) {
      payload.teamA = teamAInput.value.trim();
      payload.teamB = teamBInput.value.trim();

      if (payload.teamA.toLowerCase() === payload.teamB.toLowerCase()) {
        editMatchErrorBox.textContent = 'Team One and Team Two must be distinct teams.';
        editMatchErrorBox.style.display = 'block';
        return;
      }
    }

    btnSubmitEditMatch.disabled = true;
    btnSubmitEditMatch.textContent = 'Saving...';

    try {
      const csrfToken = await window.TossArenaAuth.getCsrfToken();
      const response = await fetch(getApiUrl(`/admin/matches/${matchId}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        editMatchErrorBox.textContent = result.message || 'Failed to update match.';
        editMatchErrorBox.style.display = 'block';
        btnSubmitEditMatch.disabled = false;
        btnSubmitEditMatch.textContent = 'Save Changes';
        return;
      }

      closeModal(modalEditMatch);
      showToast('Match fixture updated successfully.', 'success');
      loadMatches(currentPage);
    } catch (err) {
      editMatchErrorBox.textContent = 'Error updating match fixture.';
      editMatchErrorBox.style.display = 'block';
    } finally {
      btnSubmitEditMatch.disabled = false;
      btnSubmitEditMatch.textContent = 'Save Changes';
    }
  });

  // ==========================================================================
  // STATUS LIFECYCLE CONTROLS
  // ==========================================================================
  async function openStatusTransitionModal(matchId) {
    statusErrorBox.style.display = 'none';
    statusErrorBox.textContent = '';
    formStatusTransition.reset();

    const match = activeMatches.find(m => String(m.id) === String(matchId));
    if (!match) return;

    document.getElementById('statusMatchId').value = match.id;
    document.getElementById('statusMatchTitle').textContent = `${match.teamA || match.team_a} vs ${match.teamB || match.team_b}`;

    const currentBadge = document.getElementById('statusCurrentBadge');
    currentBadge.className = 'badge';
    currentBadge.innerHTML = getStatusBadgeHtml(match.status);

    const allowedTransitions = STATUS_TRANSITION_MAP[match.status] || [];

    statusTargetSelect.innerHTML = '';
    if (allowedTransitions.length === 0) {
      statusTargetSelect.innerHTML = `<option value="">No transitions permitted (Terminal State)</option>`;
      btnSubmitStatusChange.disabled = true;
      statusTransitionExplanation.textContent = 'This match fixture is in a terminal state and cannot transition further.';
    } else {
      btnSubmitStatusChange.disabled = false;
      allowedTransitions.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.value;
        opt.textContent = t.label;
        statusTargetSelect.appendChild(opt);
      });

      statusTransitionExplanation.textContent = allowedTransitions[0].desc;
      statusTargetSelect.addEventListener('change', () => {
        const selected = allowedTransitions.find(t => t.value === statusTargetSelect.value);
        if (selected) {
          statusTransitionExplanation.textContent = selected.desc;
        }
      });
    }

    openModal(modalStatusTransition);
  }

  formStatusTransition.addEventListener('submit', async (e) => {
    e.preventDefault();
    statusErrorBox.style.display = 'none';

    const matchId = document.getElementById('statusMatchId').value;
    const targetStatus = statusTargetSelect.value;

    if (!targetStatus) return;

    btnSubmitStatusChange.disabled = true;
    btnSubmitStatusChange.textContent = 'Updating...';

    try {
      const csrfToken = await window.TossArenaAuth.getCsrfToken();
      const response = await fetch(getApiUrl(`/admin/matches/${matchId}/status`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({ status: targetStatus })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        statusErrorBox.textContent = result.message || 'Status transition rejected.';
        statusErrorBox.style.display = 'block';
        btnSubmitStatusChange.disabled = false;
        btnSubmitStatusChange.textContent = 'Confirm Transition';
        return;
      }

      closeModal(modalStatusTransition);
      showToast(`Match status updated to "${targetStatus}".`, 'success');
      loadSummaryStats();
      loadMatches(currentPage);
    } catch (err) {
      statusErrorBox.textContent = 'Error updating status.';
      statusErrorBox.style.display = 'block';
    } finally {
      btnSubmitStatusChange.disabled = false;
      btnSubmitStatusChange.textContent = 'Confirm Transition';
    }
  });

  // ==========================================================================
  // CANCEL MATCH WORKFLOW
  // ==========================================================================
  function openCancelMatchModal(matchId) {
    cancelErrorBox.style.display = 'none';
    cancelErrorBox.textContent = '';
    formCancelMatch.reset();

    const match = activeMatches.find(m => String(m.id) === String(matchId));
    if (!match) return;

    document.getElementById('cancelMatchId').value = match.id;
    document.getElementById('cancelMatchTitle').textContent = `${match.teamA || match.team_a} vs ${match.teamB || match.team_b}`;
    document.getElementById('cancelMatchMeta').textContent = `Scheduled: ${formatDateTime(match.scheduledAt || match.scheduled_at)} • Status: ${match.status.toUpperCase()} • ${match.predictionCount || match.prediction_count || 0} user picks`;

    openModal(modalCancelMatch);
  }

  formCancelMatch.addEventListener('submit', async (e) => {
    e.preventDefault();
    cancelErrorBox.style.display = 'none';

    const matchId = document.getElementById('cancelMatchId').value;
    const reason = cancelReasonInput.value.trim();

    if (!reason) {
      cancelErrorBox.textContent = 'A valid cancellation reason is required for audit records.';
      cancelErrorBox.style.display = 'block';
      return;
    }

    btnSubmitCancelMatch.disabled = true;
    btnSubmitCancelMatch.textContent = 'Cancelling...';

    try {
      const csrfToken = await window.TossArenaAuth.getCsrfToken();
      const response = await fetch(getApiUrl(`/admin/matches/${matchId}/cancel`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({ reason })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        cancelErrorBox.textContent = result.message || 'Failed to cancel match.';
        cancelErrorBox.style.display = 'block';
        btnSubmitCancelMatch.disabled = false;
        btnSubmitCancelMatch.textContent = 'Yes, Cancel Match';
        return;
      }

      closeModal(modalCancelMatch);
      showToast('Match fixture cancelled safely. Predictions preserved.', 'success');
      loadSummaryStats();
      loadMatches(currentPage);
    } catch (err) {
      cancelErrorBox.textContent = 'Error cancelling fixture.';
      cancelErrorBox.style.display = 'block';
    } finally {
      btnSubmitCancelMatch.disabled = false;
      btnSubmitCancelMatch.textContent = 'Yes, Cancel Match';
    }
  });

  // ==========================================================================
  // VIEW MATCH DETAILS & PICK BREAKDOWN
  // ==========================================================================
  async function openMatchDetailsModal(matchId) {
    matchDetailsContent.innerHTML = `
      <div style="text-align: center; padding: 2rem;">
        <div style="display: inline-block; width: 30px; height: 30px; border: 3px solid var(--border-medium); border-top-color: var(--accent-mint); border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <p style="margin-top: 0.5rem; color: var(--text-secondary); font-size: 0.85rem;">Loading match details...</p>
      </div>
    `;
    openModal(modalMatchDetails);

    try {
      const response = await fetch(getApiUrl(`/admin/matches/${matchId}`), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      });

      if (!response.ok) {
        matchDetailsContent.innerHTML = `<div class="danger-callout">Failed to load match fixture details.</div>`;
        return;
      }

      const result = await response.json();
      const m = result.data;

      const pickBreakdown = m.pickBreakdown || [];
      const totalPicks = Number(m.predictionCount || m.prediction_count || 0);

      let breakdownHtml = `<p style="color: var(--text-muted); font-size: 0.85rem;">No user predictions have been submitted for this match yet.</p>`;

      if (totalPicks > 0 && pickBreakdown.length > 0) {
        breakdownHtml = `
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            ${pickBreakdown.map((p) => {
              const pct = totalPicks > 0 ? Math.round((p.count / totalPicks) * 100) : 0;
              return `
                <div>
                  <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.25rem;">
                    <span style="font-weight: 600; color: var(--text-primary);">${escapeHtml(p.team)}</span>
                    <span style="color: var(--accent-mint); font-weight: 600;">${p.count} picks (${pct}%)</span>
                  </div>
                  <div style="background: rgba(255, 255, 255, 0.08); border-radius: var(--radius-full); height: 8px; overflow: hidden;">
                    <div style="background: var(--accent-mint); width: ${pct}%; height: 100%;"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      matchDetailsContent.innerHTML = `
        <div style="margin-bottom: 1.5rem;">
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.25rem;">Fixture #${m.id}</div>
          <h2 style="font-size: 1.35rem; font-family: var(--font-display); margin-bottom: 0.35rem; color: var(--text-primary);">
            ${escapeHtml(m.teamA || m.team_a)} vs ${escapeHtml(m.teamB || m.team_b)}
          </h2>
          <div style="display: flex; gap: 0.5rem; align-items: center; margin-top: 0.5rem;">
            ${getStatusBadgeHtml(m.status)}
            <span style="font-size: 0.8rem; color: var(--text-secondary);">
              Scheduled: ${formatDateTime(m.scheduledAt || m.scheduled_at)}
            </span>
          </div>
        </div>

        <div style="background: rgba(0, 0, 0, 0.2); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1.5rem;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; font-size: 0.85rem;">
            <div>
              <span style="color: var(--text-muted);">Tournament:</span><br>
              <strong style="color: var(--text-primary);">${escapeHtml(m.tournamentName || m.tournament_name)}</strong>
            </div>
            <div>
              <span style="color: var(--text-muted);">Venue:</span><br>
              <strong style="color: var(--text-primary);">${escapeHtml(m.venue)}</strong>
            </div>
            <div>
              <span style="color: var(--text-muted);">Created By:</span><br>
              <span style="color: var(--text-primary);">${m.createdBy ? escapeHtml(m.createdBy.name || m.createdBy.email) : 'System'}</span>
            </div>
            <div>
              <span style="color: var(--text-muted);">Created At:</span><br>
              <span style="color: var(--text-primary);">${formatDateTime(m.createdAt || m.created_at)}</span>
            </div>
          </div>
        </div>

        <div>
          <h4 style="font-size: 0.95rem; margin-bottom: 0.75rem; color: var(--text-primary);">
            Prediction Activity Breakdown (${totalPicks} Total Picks)
          </h4>
          ${breakdownHtml}
        </div>
      `;
    } catch (err) {
      matchDetailsContent.innerHTML = `<div class="danger-callout">Error loading match details.</div>`;
    }
  }

  // Logout button
  if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener('click', async () => {
      await window.TossArenaAuth.logout();
      window.location.href = '../pages/login.html';
    });
  }

  // Initialize page on DOM load
  document.addEventListener('DOMContentLoaded', async () => {
    const isAuthorized = await initAdminAuth();
    if (isAuthorized) {
      loadSummaryStats();
      loadMatches(1);
    }
  });
})();
