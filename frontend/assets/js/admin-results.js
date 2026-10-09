/**
 * TossArena Admin Toss Result Management Client (Day 12)
 * Handles review of matches awaiting toss results, winner validation,
 * safe dry-run impact preview, transactional publishing, and explicit correction workflows.
 */

(function () {
  'use strict';

  // State Management
  let currentPage = 1;
  const pageLimit = 15;
  let currentResults = [];
  let currentOverview = null;
  let activeSelectedMatch = null;
  let activeCorrectionMatch = null;

  // DOM Elements - User & Session
  const adminUserName = document.getElementById('adminUserName');
  const adminUserEmail = document.getElementById('adminUserEmail');
  const adminUserAvatar = document.getElementById('adminUserAvatar');
  const adminLogoutBtn = document.getElementById('adminLogoutBtn');

  // DOM Elements - Sidebar & Layout
  const dashSidebar = document.getElementById('dashSidebar');
  const dashSidebarOpen = document.getElementById('dashSidebarOpen');
  const dashSidebarClose = document.getElementById('dashSidebarClose');
  const dashNavBackdrop = document.getElementById('dashNavBackdrop');

  // Overview Stats
  const statTotalMatches = document.getElementById('statTotalMatches');
  const statAwaitingResults = document.getElementById('statAwaitingResults');
  const statResultsPublished = document.getElementById('statResultsPublished');
  const statCancelledMatches = document.getElementById('statCancelledMatches');
  const statTotalPredictions = document.getElementById('statTotalPredictions');

  // Filter Controls
  const filterSearch = document.getElementById('filterSearch');
  const filterResultStatus = document.getElementById('filterResultStatus');
  const filterMatchStatus = document.getElementById('filterMatchStatus');
  const filterDate = document.getElementById('filterDate');
  const btnResetFilters = document.getElementById('btnResetFilters');
  const btnRefreshResults = document.getElementById('btnRefreshResults');

  // Table & Pagination
  const resultsTableBody = document.getElementById('resultsTableBody');
  const tableCountLabel = document.getElementById('tableCountLabel');
  const paginationInfo = document.getElementById('paginationInfo');
  const btnPrevPage = document.getElementById('btnPrevPage');
  const btnNextPage = document.getElementById('btnNextPage');

  // Record Result Modal Elements
  const recordResultModal = document.getElementById('recordResultModal');
  const closeRecordResultModal = document.getElementById('closeRecordResultModal');
  const btnCancelRecordResult = document.getElementById('btnCancelRecordResult');
  const recordMatchTournament = document.getElementById('recordMatchTournament');
  const recordMatchTitle = document.getElementById('recordMatchTitle');
  const recordMatchVenue = document.getElementById('recordMatchVenue');
  const recordMatchDate = document.getElementById('recordMatchDate');
  const recordMatchId = document.getElementById('recordMatchId');

  const teamCardA = document.getElementById('teamCardA');
  const teamCardB = document.getElementById('teamCardB');
  const teamNameA = document.getElementById('teamNameA');
  const teamNameB = document.getElementById('teamNameB');
  const selectedTossWinner = document.getElementById('selectedTossWinner');
  const recordWinnerError = document.getElementById('recordWinnerError');

  const decisionBat = document.getElementById('decisionBat');
  const decisionBowl = document.getElementById('decisionBowl');
  const selectedTossDecision = document.getElementById('selectedTossDecision');
  const recordDecisionError = document.getElementById('recordDecisionError');

  const recordSourceNote = document.getElementById('recordSourceNote');
  const recordPreviewBox = document.getElementById('recordPreviewBox');
  const prevTotalPreds = document.getElementById('prevTotalPreds');
  const prevWillBeCorrect = document.getElementById('prevWillBeCorrect');
  const prevWillBeIncorrect = document.getElementById('prevWillBeIncorrect');
  const previewWarnings = document.getElementById('previewWarnings');

  const btnPreviewResult = document.getElementById('btnPreviewResult');
  const btnConfirmPublishResult = document.getElementById('btnConfirmPublishResult');

  // Correction Modal Elements
  const correctionModal = document.getElementById('correctionModal');
  const closeCorrectionModal = document.getElementById('closeCorrectionModal');
  const btnCancelCorrection = document.getElementById('btnCancelCorrection');
  const currPublishedSummary = document.getElementById('currPublishedSummary');
  const correctMatchId = document.getElementById('correctMatchId');

  const corrTeamCardA = document.getElementById('corrTeamCardA');
  const corrTeamCardB = document.getElementById('corrTeamCardB');
  const corrTeamNameA = document.getElementById('corrTeamNameA');
  const corrTeamNameB = document.getElementById('corrTeamNameB');
  const corrSelectedWinner = document.getElementById('corrSelectedWinner');
  const corrWinnerError = document.getElementById('corrWinnerError');

  const corrDecisionBat = document.getElementById('corrDecisionBat');
  const corrDecisionBowl = document.getElementById('corrDecisionBowl');
  const corrSelectedDecision = document.getElementById('corrSelectedDecision');
  const corrDecisionError = document.getElementById('corrDecisionError');

  const corrReason = document.getElementById('corrReason');
  const corrReasonError = document.getElementById('corrReasonError');
  const btnSubmitCorrection = document.getElementById('btnSubmitCorrection');

  const toastContainer = document.getElementById('toastContainer');

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
   * Toast notification helper
   */
  function showToast(message, type = 'success') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
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

  // Sidebar toggle for mobile
  function setupSidebar() {
    if (dashSidebarOpen && dashSidebar && dashNavBackdrop) {
      dashSidebarOpen.addEventListener('click', () => {
        dashSidebar.classList.add('open');
        dashNavBackdrop.classList.add('active');
      });
    }
    const closeSidebar = () => {
      if (dashSidebar) dashSidebar.classList.remove('open');
      if (dashNavBackdrop) dashNavBackdrop.classList.remove('active');
    };
    if (dashSidebarClose) dashSidebarClose.addEventListener('click', closeSidebar);
    if (dashNavBackdrop) dashNavBackdrop.addEventListener('click', closeSidebar);
  }

  /**
   * Initializes administrator session & verifies role
   */
  async function initAdminAuth() {
    try {
      const user = await window.TossArenaAuth.getCurrentUser();

      if (!user || user.role !== 'admin') {
        window.location.href = '../admin/login.html';
        return false;
      }

      if (adminUserName) adminUserName.textContent = user.fullName || 'Admin User';
      if (adminUserEmail) adminUserEmail.textContent = user.email || '';
      if (adminUserAvatar) adminUserAvatar.textContent = (user.fullName || 'A').charAt(0).toUpperCase();

      return true;
    } catch (err) {
      window.location.href = '../admin/login.html';
      return false;
    }
  }

  /**
   * Loads overview statistics for result management
   */
  async function loadOverviewStats() {
    try {
      const response = await fetch(getApiUrl('/admin/results/overview'), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      });

      if (!response.ok) return;

      const result = await response.json();
      if (!result.success || !result.data) return;

      currentOverview = result.data;

      if (statTotalMatches) statTotalMatches.textContent = Number(currentOverview.totalMatches || 0).toLocaleString();
      if (statAwaitingResults) statAwaitingResults.textContent = Number(currentOverview.awaitingResults || 0).toLocaleString();
      if (statResultsPublished) statResultsPublished.textContent = Number(currentOverview.resultsPublished || 0).toLocaleString();
      if (statCancelledMatches) statCancelledMatches.textContent = Number(currentOverview.cancelledMatches || 0).toLocaleString();
      if (statTotalPredictions) statTotalPredictions.textContent = Number(currentOverview.totalPredictions || 0).toLocaleString();
    } catch (err) {
      console.warn('Failed to load result overview stats:', err);
    }
  }

  /**
   * Loads paginated, filtered matches from the database
   */
  async function loadResults(page = 1) {
    currentPage = page;
    resultsTableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
          Loading verified match results...
        </td>
      </tr>
    `;

    try {
      const params = new URLSearchParams();
      params.set('page', currentPage);
      params.set('limit', pageLimit);

      const searchVal = (filterSearch?.value || '').trim();
      if (searchVal) params.set('search', searchVal);

      const resStatusVal = filterResultStatus?.value || 'all';
      if (resStatusVal !== 'all') params.set('resultStatus', resStatusVal);

      const matchStatusVal = filterMatchStatus?.value || 'all';
      if (matchStatusVal !== 'all') params.set('matchStatus', matchStatusVal);

      const dateVal = filterDate?.value || 'all';
      if (dateVal !== 'all') params.set('dateFilter', dateVal);

      const response = await fetch(`${getApiUrl('/admin/results')}?${params.toString()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      });

      if (response.status === 401 || response.status === 403) {
        window.location.href = '../admin/login.html';
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to load results (HTTP ${response.status})`);
      }

      const resJson = await response.json();
      const matches = resJson.data?.matches || resJson.matches || [];
      const pagination = resJson.pagination || resJson.data?.pagination || { page: 1, totalPages: 1, totalItems: 0 };

      currentResults = matches;
      renderResultsTable(matches);
      renderPagination(pagination);
    } catch (err) {
      console.error('Results load error:', err);
      resultsTableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 2.5rem; color: #f87171;">
            Failed to load toss results: ${escapeHtml(err.message)}
          </td>
        </tr>
      `;
    }
  }

  /**
   * Renders results into the table
   */
  function renderResultsTable(matches) {
    if (!matches || matches.length === 0) {
      resultsTableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 3rem; color: var(--text-muted);">
            No fixtures matching the selected filters were found.
          </td>
        </tr>
      `;
      if (tableCountLabel) tableCountLabel.textContent = 'Showing 0 matches';
      return;
    }

    if (tableCountLabel) tableCountLabel.textContent = `Showing ${matches.length} matches`;

    const rowsHtml = matches.map((m) => {
      // Status badges
      let statusBadge = `<span class="badge status-badge-${m.status}">● ${m.status.toUpperCase()}</span>`;
      let resultBadge = '';

      if (m.status === 'cancelled') {
        resultBadge = `<span class="badge status-badge-cancelled">✕ Cancelled</span>`;
      } else if (m.isPublished) {
        resultBadge = `<span class="badge status-badge-published">✔ Published</span>`;
      } else {
        resultBadge = `<span class="badge status-badge-awaiting">⏳ Awaiting</span>`;
      }

      // Outcome display
      let outcomeDisplay = '<span style="color: var(--text-muted); font-size: 0.82rem;">Pending Declaration</span>';
      if (m.resultTossWinner) {
        const decLabel = m.resultDecision === 'bat' ? 'Bat First' : 'Bowl First';
        outcomeDisplay = `
          <div style="font-weight: 700; color: var(--text-primary); font-size: 0.88rem;">
            🏆 ${escapeHtml(m.resultTossWinner)}
          </div>
          <div style="font-size: 0.75rem; color: #38bdf8; margin-top: 0.15rem;">
            Elected to ${decLabel}
          </div>
        `;
      }

      // Prediction stats
      const totalPreds = m.predictionCount || 0;
      let predSummary = `<span style="font-size: 0.82rem; color: var(--text-muted);">0 predictions</span>`;
      if (totalPreds > 0) {
        if (m.isPublished) {
          predSummary = `
            <div style="font-size: 0.82rem; font-weight: 600;">${totalPreds} total</div>
            <div style="font-size: 0.72rem; display: flex; gap: 0.4rem; margin-top: 0.15rem;">
              <span style="color: var(--accent-mint);">✔ ${m.correctPredictionsCount || 0}</span>
              <span style="color: #f87171;">✕ ${m.incorrectPredictionsCount || 0}</span>
            </div>
          `;
        } else {
          predSummary = `
            <div style="font-size: 0.82rem; font-weight: 600;">${totalPreds} submitted</div>
            <div style="font-size: 0.72rem; color: #fbbf24; margin-top: 0.15rem;">${m.pendingPredictionsCount || totalPreds} pending</div>
          `;
        }
      }

      // Action Button
      let actionBtn = '';
      if (m.canPublish) {
        actionBtn = `
          <button type="button" class="action-btn action-btn-primary btn-record-result" data-id="${m.id}">
            ⚡ Record Result
          </button>
        `;
      } else if (m.canCorrect) {
        actionBtn = `
          <button type="button" class="action-btn action-btn-warning btn-correct-result" data-id="${m.id}">
            ⚠️ Correct
          </button>
        `;
      } else if (m.status === 'cancelled') {
        actionBtn = `<span style="font-size: 0.75rem; color: var(--text-muted);">Cancelled</span>`;
      }

      return `
        <tr>
          <td style="font-weight: 700; color: var(--text-muted); font-size: 0.8rem;">#${m.id}</td>
          <td>
            <div style="font-weight: 700; color: var(--text-primary); font-size: 0.92rem;">
              ${escapeHtml(m.teamA)} <span style="color: var(--text-muted); font-weight: 400;">vs</span> ${escapeHtml(m.teamB)}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">
              ${escapeHtml(m.tournamentName)} • 📍 ${escapeHtml(m.venue)}
            </div>
          </td>
          <td style="font-size: 0.82rem; color: var(--text-secondary); white-space: nowrap;">
            ${formatDateTime(m.scheduledAt)}
          </td>
          <td>${statusBadge}</td>
          <td>${resultBadge}</td>
          <td>${outcomeDisplay}</td>
          <td>${predSummary}</td>
          <td style="text-align: right; white-space: nowrap;">${actionBtn}</td>
        </tr>
      `;
    }).join('');

    resultsTableBody.innerHTML = rowsHtml;

    // Attach row action listeners
    document.querySelectorAll('.btn-record-result').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        openRecordResultModal(id);
      });
    });

    document.querySelectorAll('.btn-correct-result').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        openCorrectionModal(id);
      });
    });
  }

  /**
   * Updates pagination buttons and label
   */
  function renderPagination(pagination) {
    if (!pagination) return;
    const { page, totalPages, totalItems } = pagination;
    if (paginationInfo) {
      paginationInfo.textContent = `Page ${page} of ${totalPages || 1} (${totalItems || 0} total fixtures)`;
    }
    if (btnPrevPage) btnPrevPage.disabled = page <= 1;
    if (btnNextPage) btnNextPage.disabled = page >= totalPages;
  }

  // =========================================================================
  // RECORD RESULT MODAL CONTROLLER
  // =========================================================================

  function openRecordResultModal(matchId) {
    const match = currentResults.find(m => m.id === matchId);
    if (!match) return;

    activeSelectedMatch = match;
    recordMatchId.value = match.id;
    recordMatchTournament.textContent = match.tournamentName || 'Cricket Match';
    recordMatchTitle.textContent = `${match.teamA} vs ${match.teamB}`;
    recordMatchVenue.textContent = `📍 ${match.venue || 'Neutral'}`;
    recordMatchDate.textContent = `🕒 ${formatDateTime(match.scheduledAt)}`;

    teamNameA.textContent = match.teamA;
    teamNameB.textContent = match.teamB;

    // Reset form fields
    selectedTossWinner.value = '';
    selectedTossDecision.value = '';
    recordSourceNote.value = '';
    recordWinnerError.style.display = 'none';
    recordDecisionError.style.display = 'none';
    recordPreviewBox.style.display = 'none';

    teamCardA.classList.remove('selected');
    teamCardB.classList.remove('selected');
    decisionBat.classList.remove('selected');
    decisionBowl.classList.remove('selected');

    btnConfirmPublishResult.disabled = false;
    btnConfirmPublishResult.textContent = '🏆 Publish Verified Result';

    openModal(recordResultModal);
  }

  // Team choice selection
  if (teamCardA && teamCardB) {
    teamCardA.addEventListener('click', () => {
      if (!activeSelectedMatch) return;
      selectedTossWinner.value = activeSelectedMatch.teamA;
      teamCardA.classList.add('selected');
      teamCardB.classList.remove('selected');
      recordWinnerError.style.display = 'none';
      triggerAutoPreview();
    });

    teamCardB.addEventListener('click', () => {
      if (!activeSelectedMatch) return;
      selectedTossWinner.value = activeSelectedMatch.teamB;
      teamCardB.classList.add('selected');
      teamCardA.classList.remove('selected');
      recordWinnerError.style.display = 'none';
      triggerAutoPreview();
    });
  }

  // Decision choice selection
  if (decisionBat && decisionBowl) {
    decisionBat.addEventListener('click', () => {
      selectedTossDecision.value = 'bat';
      decisionBat.classList.add('selected');
      decisionBowl.classList.remove('selected');
      recordDecisionError.style.display = 'none';
      triggerAutoPreview();
    });

    decisionBowl.addEventListener('click', () => {
      selectedTossDecision.value = 'bowl';
      decisionBowl.classList.add('selected');
      decisionBat.classList.remove('selected');
      recordDecisionError.style.display = 'none';
      triggerAutoPreview();
    });
  }

  // Safe dry-run preview trigger
  async function triggerAutoPreview() {
    const winner = selectedTossWinner.value;
    const decision = selectedTossDecision.value;
    if (!winner || !decision || !activeSelectedMatch) return;

    try {
      const csrfToken = await window.TossArenaAuth.getCsrfToken();
      const response = await fetch(getApiUrl(`/admin/results/${activeSelectedMatch.id}/preview`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({
          tossWinner: winner,
          tossDecision: decision
        })
      });

      if (!response.ok) return;

      const resJson = await response.json();
      const preview = resJson.data || {};
      const evalCounts = preview.evaluationPreview || preview.hypotheticalOutcome || {};

      recordPreviewBox.style.display = 'block';
      if (prevTotalPreds) prevTotalPreds.textContent = evalCounts.totalPredictions || 0;
      if (prevWillBeCorrect) prevWillBeCorrect.textContent = evalCounts.willMarkCorrect || 0;
      if (prevWillBeIncorrect) prevWillBeIncorrect.textContent = evalCounts.willMarkIncorrect || 0;

      if (previewWarnings) {
        if (preview.warnings && preview.warnings.length > 0) {
          previewWarnings.textContent = preview.warnings.join(' ');
          previewWarnings.style.display = 'block';
        } else {
          previewWarnings.style.display = 'none';
        }
      }
    } catch (err) {
      console.warn('Dry-run preview failed:', err);
    }
  }

  if (btnPreviewResult) {
    btnPreviewResult.addEventListener('click', () => {
      const winner = selectedTossWinner.value;
      const decision = selectedTossDecision.value;
      let hasError = false;

      if (!winner) {
        recordWinnerError.textContent = 'Please choose the winning team.';
        recordWinnerError.style.display = 'block';
        hasError = true;
      }
      if (!decision) {
        recordDecisionError.textContent = 'Please choose bat or bowl first.';
        recordDecisionError.style.display = 'block';
        hasError = true;
      }
      if (hasError) return;

      triggerAutoPreview();
    });
  }

  // Publish submission
  if (btnConfirmPublishResult) {
    btnConfirmPublishResult.addEventListener('click', async () => {
      const winner = selectedTossWinner.value;
      const decision = selectedTossDecision.value;
      let hasError = false;

      if (!winner) {
        recordWinnerError.textContent = 'Toss winner team selection is required.';
        recordWinnerError.style.display = 'block';
        hasError = true;
      }
      if (!decision) {
        recordDecisionError.textContent = 'Toss decision selection is required (bat or bowl).';
        recordDecisionError.style.display = 'block';
        hasError = true;
      }
      if (hasError || !activeSelectedMatch) return;

      // Double-submission lock
      btnConfirmPublishResult.disabled = true;
      btnConfirmPublishResult.textContent = 'Publishing...';

      try {
        const csrfToken = await window.TossArenaAuth.getCsrfToken();
        const response = await fetch(getApiUrl(`/admin/results/${activeSelectedMatch.id}/publish`), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-CSRF-Token': csrfToken
          },
          credentials: 'include',
          body: JSON.stringify({
            tossWinner: winner,
            tossDecision: decision,
            sourceNote: (recordSourceNote.value || '').trim()
          })
        });

        const resJson = await response.json();

        if (!response.ok) {
          throw new Error(resJson.message || `Publication failed (HTTP ${response.status})`);
        }

        showToast(resJson.message || 'Toss result verified and published successfully!', 'success');
        closeModal(recordResultModal);

        // Refresh overview and results
        await loadOverviewStats();
        await loadResults(currentPage);
      } catch (err) {
        console.error('Publish error:', err);
        showToast(err.message, 'error');
        btnConfirmPublishResult.disabled = false;
        btnConfirmPublishResult.textContent = '🏆 Publish Verified Result';
      }
    });
  }

  // =========================================================================
  // CORRECTION MODAL CONTROLLER
  // =========================================================================

  function openCorrectionModal(matchId) {
    const match = currentResults.find(m => m.id === matchId);
    if (!match) return;

    activeCorrectionMatch = match;
    correctMatchId.value = match.id;

    const currWinner = match.resultTossWinner || 'Not Set';
    const currDecision = match.resultDecision === 'bat' ? 'Bat First' : 'Bowl First';
    currPublishedSummary.textContent = `Toss Winner: ${currWinner} | Elected to: ${currDecision}`;

    corrTeamNameA.textContent = match.teamA;
    corrTeamNameB.textContent = match.teamB;

    corrSelectedWinner.value = '';
    corrSelectedDecision.value = '';
    corrReason.value = '';
    corrWinnerError.style.display = 'none';
    corrDecisionError.style.display = 'none';
    corrReasonError.style.display = 'none';

    corrTeamCardA.classList.remove('selected');
    corrTeamCardB.classList.remove('selected');
    corrDecisionBat.classList.remove('selected');
    corrDecisionBowl.classList.remove('selected');

    btnSubmitCorrection.disabled = false;
    btnSubmitCorrection.textContent = '⚠️ Confirm & Re-evaluate Predictions';

    openModal(correctionModal);
  }

  if (corrTeamCardA && corrTeamCardB) {
    corrTeamCardA.addEventListener('click', () => {
      if (!activeCorrectionMatch) return;
      corrSelectedWinner.value = activeCorrectionMatch.teamA;
      corrTeamCardA.classList.add('selected');
      corrTeamCardB.classList.remove('selected');
      corrWinnerError.style.display = 'none';
    });

    corrTeamCardB.addEventListener('click', () => {
      if (!activeCorrectionMatch) return;
      corrSelectedWinner.value = activeCorrectionMatch.teamB;
      corrTeamCardB.classList.add('selected');
      corrTeamCardA.classList.remove('selected');
      corrWinnerError.style.display = 'none';
    });
  }

  if (corrDecisionBat && corrDecisionBowl) {
    corrDecisionBat.addEventListener('click', () => {
      corrSelectedDecision.value = 'bat';
      corrDecisionBat.classList.add('selected');
      corrDecisionBowl.classList.remove('selected');
      corrDecisionError.style.display = 'none';
    });

    corrDecisionBowl.addEventListener('click', () => {
      corrSelectedDecision.value = 'bowl';
      corrDecisionBowl.classList.add('selected');
      corrDecisionBat.classList.remove('selected');
      corrDecisionError.style.display = 'none';
    });
  }

  if (btnSubmitCorrection) {
    btnSubmitCorrection.addEventListener('click', async () => {
      const winner = corrSelectedWinner.value;
      const decision = corrSelectedDecision.value;
      const reason = (corrReason.value || '').trim();
      let hasError = false;

      if (!winner) {
        corrWinnerError.textContent = 'Please choose corrected toss winner.';
        corrWinnerError.style.display = 'block';
        hasError = true;
      }
      if (!decision) {
        corrDecisionError.textContent = 'Please choose corrected toss decision.';
        corrDecisionError.style.display = 'block';
        hasError = true;
      }
      if (!reason || reason.length < 5) {
        corrReasonError.textContent = 'Mandatory correction reason must be at least 5 characters.';
        corrReasonError.style.display = 'block';
        hasError = true;
      }
      if (hasError || !activeCorrectionMatch) return;

      btnSubmitCorrection.disabled = true;
      btnSubmitCorrection.textContent = 'Processing correction...';

      try {
        const csrfToken = await window.TossArenaAuth.getCsrfToken();
        const response = await fetch(getApiUrl(`/admin/results/${activeCorrectionMatch.id}/correct`), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-CSRF-Token': csrfToken
          },
          credentials: 'include',
          body: JSON.stringify({
            tossWinner: winner,
            tossDecision: decision,
            reason: reason
          })
        });

        const resJson = await response.json();

        if (!response.ok) {
          throw new Error(resJson.message || `Correction failed (HTTP ${response.status})`);
        }

        showToast(resJson.message || 'Toss result corrected and predictions re-evaluated successfully!', 'success');
        closeModal(correctionModal);

        await loadOverviewStats();
        await loadResults(currentPage);
      } catch (err) {
        console.error('Correction error:', err);
        showToast(err.message, 'error');
        btnSubmitCorrection.disabled = false;
        btnSubmitCorrection.textContent = '⚠️ Confirm & Re-evaluate Predictions';
      }
    });
  }

  // Modal close handlers
  if (closeRecordResultModal) closeRecordResultModal.addEventListener('click', () => closeModal(recordResultModal));
  if (btnCancelRecordResult) btnCancelRecordResult.addEventListener('click', () => closeModal(recordResultModal));
  if (closeCorrectionModal) closeCorrectionModal.addEventListener('click', () => closeModal(correctionModal));
  if (btnCancelCorrection) btnCancelCorrection.addEventListener('click', () => closeModal(correctionModal));

  // Filter Event Listeners
  if (filterSearch) {
    let searchDebounce;
    filterSearch.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => loadResults(1), 350);
    });
  }

  if (filterResultStatus) filterResultStatus.addEventListener('change', () => loadResults(1));
  if (filterMatchStatus) filterMatchStatus.addEventListener('change', () => loadResults(1));
  if (filterDate) filterDate.addEventListener('change', () => loadResults(1));

  if (btnResetFilters) {
    btnResetFilters.addEventListener('click', () => {
      if (filterSearch) filterSearch.value = '';
      if (filterResultStatus) filterResultStatus.value = 'all';
      if (filterMatchStatus) filterMatchStatus.value = 'all';
      if (filterDate) filterDate.value = 'all';
      loadResults(1);
    });
  }

  if (btnRefreshResults) {
    btnRefreshResults.addEventListener('click', () => {
      loadOverviewStats();
      loadResults(currentPage);
      showToast('Results refreshed from database.', 'info');
    });
  }

  if (btnPrevPage) {
    btnPrevPage.addEventListener('click', () => {
      if (currentPage > 1) loadResults(currentPage - 1);
    });
  }

  if (btnNextPage) {
    btnNextPage.addEventListener('click', () => {
      loadResults(currentPage + 1);
    });
  }

  // Logout Handler
  if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener('click', async () => {
      try {
        await window.TossArenaAuth.logout();
      } catch (_) {}
      window.location.href = '../admin/login.html';
    });
  }

  // Initialization
  document.addEventListener('DOMContentLoaded', async () => {
    setupSidebar();
    const authorized = await initAdminAuth();
    if (authorized) {
      await loadOverviewStats();
      await loadResults(1);
    }
  });

})();
