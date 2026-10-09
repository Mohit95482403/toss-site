/**
 * TossArena - Match Details & Toss Prediction Controller (Day 7 Implementation)
 * Validates match ID, fetches single match fixture from MySQL via GET /api/matches/:id,
 * checks user session and existing predictions via GET /api/predictions/me/match/:id,
 * provides interactive team choice cards, confirmation modal, CSRF-protected submission,
 * and handles locked/eligibility states cleanly.
 */

(function () {
  'use strict';

  // Component State
  let currentMatch = null;
  let currentUser = null;
  let userPrediction = null;
  let selectedTeam = null;
  let isSubmitting = false;

  document.addEventListener('DOMContentLoaded', () => {
    initMatchDetails();
  });

  async function initMatchDetails() {
    const contentArea = document.getElementById('matchDetailsContentArea');
    const breadcrumbTitle = document.getElementById('breadcrumbMatchTitle');
    if (!contentArea) return;

    // 1. Extract and validate Match ID query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const rawId = urlParams.get('id');

    if (!rawId || !/^[1-9]\d*$/.test(rawId.trim())) {
      renderErrorState(
        contentArea,
        'Invalid Match ID',
        'The match identifier provided is missing or malformed. Please select a valid fixture from the Match Explorer.',
        false
      );
      if (breadcrumbTitle) breadcrumbTitle.textContent = 'Invalid ID';
      return;
    }

    const matchId = rawId.trim();

    // 2. Fetch match and user session data in parallel
    await loadMatchAndUserState(contentArea, breadcrumbTitle, matchId);
  }

  async function loadMatchAndUserState(container, breadcrumbTitle, matchId) {
    // Show skeleton placeholder
    container.innerHTML = `
      <div class="skeleton-card skeleton-shimmer" style="height: 280px; margin-bottom: var(--space-6);"></div>
      <div class="match-details-grid">
        <div class="skeleton-card skeleton-shimmer" style="height: 180px;"></div>
        <div class="skeleton-card skeleton-shimmer" style="height: 180px;"></div>
      </div>
      <div class="skeleton-card skeleton-shimmer" style="height: 200px;"></div>
    `;

    try {
      const config = window.TossArenaConfig || {};
      const baseUrl = config.getApiUrl ? config.getApiUrl(config.ENDPOINTS.MATCHES || '/matches') : 'http://localhost:5000/api/matches';
      const endpoint = `${baseUrl}/${encodeURIComponent(matchId)}`;

      const res = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (res.status === 404) {
        renderErrorState(
          container,
          'Match Not Found',
          `Match fixture #${escapeHtml(matchId)} could not be located in our platform database. It may have been removed or rescheduled.`,
          false
        );
        if (breadcrumbTitle) breadcrumbTitle.textContent = 'Not Found';
        return;
      }

      if (!res.ok) {
        throw new Error(`Server returned status HTTP ${res.status}`);
      }

      const payload = await res.json();
      currentMatch = payload.data;

      if (!currentMatch) {
        throw new Error('Malformed API response: missing match data.');
      }

      // Check current user session
      try {
        if (window.TossArenaAuth && window.TossArenaAuth.getCurrentUser) {
          currentUser = await window.TossArenaAuth.getCurrentUser();
        }
      } catch (_) {
        currentUser = null;
      }

      // If user is authenticated, check if they already submitted a prediction for this match
      if (currentUser && currentUser.id) {
        await checkUserPrediction(matchId);
      }

      renderPage(container, breadcrumbTitle);
    } catch (err) {
      console.error('Match details fetch error:', err);
      renderErrorState(
        container,
        'Unable to Load Match',
        'Could not communicate with the TossArena backend service. Please verify your connection and try again.',
        true,
        () => loadMatchAndUserState(container, breadcrumbTitle, matchId)
      );
      if (breadcrumbTitle) breadcrumbTitle.textContent = 'Error';
    }
  }

  async function checkUserPrediction(matchId) {
    try {
      const config = window.TossArenaConfig || {};
      const predEndpoint = config.getApiUrl
        ? config.getApiUrl(`${config.ENDPOINTS.PREDICTIONS || '/predictions'}/me/match/${encodeURIComponent(matchId)}`)
        : `http://localhost:5000/api/predictions/me/match/${encodeURIComponent(matchId)}`;

      const res = await fetch(predEndpoint, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      });

      if (res.ok) {
        const body = await res.json();
        if (body.hasPredicted && body.data) {
          userPrediction = body.data;
        } else {
          userPrediction = null;
        }
      }
    } catch (err) {
      console.warn('Could not check user prediction status:', err);
      userPrediction = null;
    }
  }

  function renderPage(container, breadcrumbTitle) {
    const match = currentMatch;
    const safeTeamA = escapeHtml(match.team_a || 'Team A');
    const safeTeamB = escapeHtml(match.team_b || 'Team B');
    const safeTournament = escapeHtml(match.tournament_name || 'Cricket Fixture');
    const safeVenue = escapeHtml(match.venue || 'Neutral Ground');
    const safeTitle = escapeHtml(match.title || `${safeTeamA} vs ${safeTeamB}`);
    const statusKey = (match.status || 'upcoming').toLowerCase();
    const teamAInitials = escapeHtml((match.team_a || 'A').substring(0, 2).toUpperCase());
    const teamBInitials = escapeHtml((match.team_b || 'B').substring(0, 2).toUpperCase());

    // Update page title & breadcrumb
    document.title = `${safeTeamA} vs ${safeTeamB} — TossArena`;
    if (breadcrumbTitle) {
      breadcrumbTitle.textContent = `${safeTeamA} vs ${safeTeamB}`;
    }

    // Format dates (Local and UTC)
    let localDateStr = 'TBD';
    let utcDateStr = 'TBD (UTC)';
    if (match.scheduled_at) {
      try {
        const d = new Date(match.scheduled_at);
        localDateStr = d.toLocaleString(undefined, {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short'
        });
        utcDateStr = d.toUTCString();
      } catch (e) {
        localDateStr = match.scheduled_at;
        utcDateStr = match.scheduled_at;
      }
    }

    // Status badge style
    let statusBadgeClass = 'badge-amber';
    if (statusKey === 'open') statusBadgeClass = 'badge-emerald';
    else if (statusKey === 'completed') statusBadgeClass = 'badge';

    // Build prediction section HTML
    const predictionSectionHtml = buildPredictionSectionHtml(match, statusKey);

    container.innerHTML = `
      <!-- Hero Card -->
      <section class="match-details-hero">
        <div class="match-details-header">
          <div style="display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;">
            <span class="badge badge-emerald" style="font-size: var(--text-xs);">${safeTournament}</span>
            <span class="badge" style="background: rgba(255,255,255,0.06); border: 1px solid var(--border-subtle); color: var(--text-muted); font-size: var(--text-xs);">
              Fixture #${escapeHtml(match.id)}
            </span>
          </div>
          <span class="badge ${statusBadgeClass}" style="font-size: var(--text-xs); letter-spacing: 0.05em;">
            ${escapeHtml(statusKey.toUpperCase())}
          </span>
        </div>

        <div class="match-teams-clash">
          <div class="clash-team">
            <div class="clash-badge">${teamAInitials}</div>
            <div class="clash-team-name">${safeTeamA}</div>
          </div>
          <div class="clash-vs-badge">VS</div>
          <div class="clash-team">
            <div class="clash-badge">${teamBInitials}</div>
            <div class="clash-team-name">${safeTeamB}</div>
          </div>
        </div>

        <div style="text-align: center; color: var(--text-muted); font-size: var(--text-xs); margin-top: var(--space-4);">
          ${safeTitle}
        </div>
      </section>

      <!-- Match Details Grid -->
      <section class="match-details-grid">
        <div class="detail-card">
          <h2 class="detail-card-title">
            <span>📅</span> Schedule &amp; Timing
          </h2>
          <div class="detail-row">
            <span class="detail-label">Local Time:</span>
            <span class="detail-value">${escapeHtml(localDateStr)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">UTC Standard:</span>
            <span class="detail-value">${escapeHtml(utcDateStr)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Match Status:</span>
            <span class="detail-value" style="text-transform: capitalize;">${escapeHtml(statusKey)}</span>
          </div>
        </div>

        <div class="detail-card">
          <h2 class="detail-card-title">
            <span>📍</span> Venue &amp; Competition
          </h2>
          <div class="detail-row">
            <span class="detail-label">Stadium / Ground:</span>
            <span class="detail-value">${safeVenue}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Tournament:</span>
            <span class="detail-value">${safeTournament}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Prediction Market:</span>
            <span class="detail-value">Toss Winner &amp; Decision</span>
          </div>
        </div>
      </section>

      <!-- Day 7 Prediction Panel -->
      ${predictionSectionHtml}

      <!-- Navigation & Action Buttons Row -->
      <div class="match-action-row" style="margin-top: var(--space-8);">
        <a href="matches.html" class="btn btn-secondary">
          ← Back to Match Explorer
        </a>
        <a href="../user/dashboard.html" class="btn btn-outline">
          User Dashboard
        </a>
        <a href="how-to-play.html" class="btn btn-outline">
          How Predictions Work
        </a>
      </div>

      <!-- Confirmation Modal Container -->
      <div class="prediction-modal-backdrop" id="predictionConfirmModal" aria-hidden="true" role="dialog" aria-modal="true">
        <div class="prediction-modal-box">
          <div class="modal-header">
            <h3>Confirm Coin Toss Prediction</h3>
            <button type="button" class="modal-close-btn" id="modalCloseBtn" aria-label="Close dialog">&times;</button>
          </div>
          <div class="modal-body">
            <p style="font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: var(--space-4);">
              Please review your coin toss forecast before submitting. In accordance with platform fair-play rules, you may submit only one prediction per fixture.
            </p>
            <div class="confirm-details-box">
              <div class="confirm-row">
                <span style="color: var(--text-muted);">Fixture:</span>
                <span style="font-weight: 700; color: var(--text-primary);">${safeTeamA} vs ${safeTeamB}</span>
              </div>
              <div class="confirm-row">
                <span style="color: var(--text-muted);">Predicted Toss Winner:</span>
                <span style="font-weight: 800; color: var(--accent-mint);" id="modalSelectedTeamName">—</span>
              </div>
              <div class="confirm-row">
                <span style="color: var(--text-muted);">Platform Stake:</span>
                <span style="font-weight: 600; color: var(--text-secondary);">Standard Entry</span>
              </div>
            </div>
            <div class="prediction-notice-callout">
              🪙 <strong>Platform Credits Only:</strong> No real currency or monetary payout.
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary btn-sm" id="modalCancelBtn">Cancel</button>
            <button type="button" class="btn btn-primary btn-sm" id="modalConfirmSubmitBtn">Confirm &amp; Submit Prediction</button>
          </div>
        </div>
      </div>
    `;

    bindPredictionEvents();
  }

  function buildPredictionSectionHtml(match, statusKey) {
    const safeTeamA = escapeHtml(match.team_a || 'Team A');
    const safeTeamB = escapeHtml(match.team_b || 'Team B');
    const teamAInitials = escapeHtml((match.team_a || 'A').substring(0, 2).toUpperCase());
    const teamBInitials = escapeHtml((match.team_b || 'B').substring(0, 2).toUpperCase());

    // Case 1: User has already submitted a prediction for this match
    if (userPrediction) {
      const safePickedTeam = escapeHtml(userPrediction.predictedTeam || 'Selected Team');
      const pickInitials = escapeHtml(safePickedTeam.substring(0, 2).toUpperCase());
      const predDate = userPrediction.createdAt
        ? new Date(userPrediction.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
        : 'Recorded';

      return `
        <section class="saved-prediction-card" aria-label="Your Submitted Prediction">
          <div class="saved-prediction-header">
            <div style="display: flex; align-items: center; gap: var(--space-2);">
              <span style="font-size: 1.25rem;">🎯</span>
              <h2 style="font-size: var(--text-base); margin: 0; font-weight: 700; color: var(--text-primary);">
                Your Toss Prediction is Recorded
              </h2>
            </div>
            <span class="badge badge-emerald" style="font-size: 0.75rem;">
              ✓ SUBMITTED (${escapeHtml((userPrediction.status || 'pending').toUpperCase())})
            </span>
          </div>

          <div class="saved-prediction-pick">
            <div class="saved-pick-badge">${pickInitials}</div>
            <div class="saved-pick-details">
              <span class="saved-pick-label">You Predicted Toss Winner</span>
              <span class="saved-pick-team">${safePickedTeam}</span>
              <span style="font-size: var(--text-xs); color: var(--text-muted); margin-top: 2px;">
                Submitted: ${escapeHtml(predDate)}
              </span>
            </div>
          </div>

          <div class="prediction-notice-callout">
            <strong>Prediction Locked:</strong> Your prediction has been secured on the platform. Under TossArena fair-play rules, each member may submit one prediction per match. Results will be evaluated upon official toss declaration.
          </div>
        </section>
      `;
    }

    // Case 2: User is NOT logged in and match is OPEN
    if (!currentUser && statusKey === 'open') {
      const currentUrl = encodeURIComponent(`pages/match-details.html?id=${match.id}`);
      return `
        <section class="prediction-status-card status-open" aria-label="Sign In to Predict">
          <div class="prediction-status-header">
            <div class="prediction-status-title">
              🪙 Toss Prediction Market Open
            </div>
            <span class="badge badge-emerald">Open for Predictions</span>
          </div>
          <p class="prediction-status-desc">
            This match is open for coin toss forecasting. Sign in to your TossArena account to select your predicted toss winner using platform credits.
          </p>
          <div style="display: flex; gap: var(--space-3); flex-wrap: wrap; margin-top: var(--space-4);">
            <a href="login.html?redirect=${currentUrl}" class="btn btn-primary btn-sm">
              Sign In to Predict
            </a>
            <a href="register.html" class="btn btn-outline btn-sm">
              Create Free Account (1,000 Credits)
            </a>
          </div>
        </section>
      `;
    }

    // Case 3: User IS logged in and match is OPEN -> Interactive Prediction Form
    if (currentUser && statusKey === 'open') {
      return `
        <section class="prediction-status-card status-open" id="predictionFormSection" aria-label="Toss Prediction Selection">
          <div class="prediction-status-header">
            <div class="prediction-status-title">
              🪙 Forecast the Coin Toss Winner
            </div>
            <span class="badge badge-emerald">Open Market</span>
          </div>
          <p class="prediction-status-desc">
            Analyze pitch history, venue trends, and team toss preferences. Choose which team will win the official coin toss for this fixture.
          </p>

          <!-- Alert message box for errors or notices -->
          <div id="predictionAlertBox" style="display: none; margin-bottom: var(--space-4); padding: var(--space-3) var(--space-4); border-radius: var(--radius-sm); font-size: var(--text-xs);"></div>

          <!-- Team Selection Cards -->
          <div class="team-selection-grid" role="radiogroup" aria-label="Select predicted toss winner">
            <!-- Team A Option -->
            <div
              class="team-choice-card"
              id="teamChoiceA"
              data-team="${safeTeamA}"
              role="radio"
              aria-checked="false"
              tabindex="0"
            >
              <div class="choice-card-left">
                <div class="choice-card-badge">${teamAInitials}</div>
                <div class="choice-card-name">${safeTeamA}</div>
              </div>
              <div class="choice-card-indicator" aria-hidden="true"></div>
            </div>

            <!-- Team B Option -->
            <div
              class="team-choice-card"
              id="teamChoiceB"
              data-team="${safeTeamB}"
              role="radio"
              aria-checked="false"
              tabindex="0"
            >
              <div class="choice-card-left">
                <div class="choice-card-badge">${teamBInitials}</div>
                <div class="choice-card-name">${safeTeamB}</div>
              </div>
              <div class="choice-card-indicator" aria-hidden="true"></div>
            </div>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-4); margin-top: var(--space-4);">
            <div style="font-size: var(--text-xs); color: var(--text-muted);">
              Selected: <strong id="selectedTeamText" style="color: var(--accent-mint);">None (Click a team above)</strong>
            </div>
            <button
              type="button"
              class="btn btn-primary"
              id="openConfirmModalBtn"
              disabled
            >
              Review &amp; Submit Prediction →
            </button>
          </div>

          <div class="prediction-notice-callout" style="margin-top: var(--space-5);">
            <strong>Platform Rule:</strong> One submission per member per match. Submissions cannot be modified once confirmed.
          </div>
        </section>
      `;
    }

    // Case 4: Match is NOT open (upcoming, locked, completed, cancelled)
    let desc = 'Prediction submissions are closed for this match.';
    let title = 'Market Unavailable';
    let badge = statusKey.toUpperCase();

    if (statusKey === 'upcoming') {
      title = '⏳ Prediction Window Opening Soon';
      desc = 'This fixture is scheduled on the platform. The prediction window will open closer to the scheduled coin toss time.';
    } else if (statusKey === 'locked') {
      title = '🔒 Predictions Locked';
      desc = 'Predictions for this fixture are locked as the official cutoff time has been reached or the coin toss is underway.';
    } else if (statusKey === 'completed') {
      title = '✓ Match Coin Toss Concluded';
      if (match.result_toss_winner) {
        const dec = match.result_decision ? ` elected to ${escapeHtml(match.result_decision.toUpperCase())}` : '';
        desc = `Official result: ${escapeHtml(match.result_toss_winner)} won the coin toss and${dec}. Predictions are finalized.`;
      } else {
        desc = 'The coin toss has finalized for this fixture.';
      }
    } else if (statusKey === 'cancelled') {
      title = '✕ Fixture Cancelled';
      desc = 'This fixture was cancelled. Predictions are not accepted.';
    }

    return `
      <section class="prediction-status-card" aria-label="Prediction Status">
        <div class="prediction-status-header">
          <div class="prediction-status-title">${title}</div>
          <span class="badge ${statusKey === 'completed' ? 'badge' : 'badge-amber'}">${badge}</span>
        </div>
        <p class="prediction-status-desc">${desc}</p>
        <div class="prediction-notice-callout">
          <strong>Platform Credits Only:</strong> No real money or monetary payouts.
        </div>
      </section>
    `;
  }

  function bindPredictionEvents() {
    const cardA = document.getElementById('teamChoiceA');
    const cardB = document.getElementById('teamChoiceB');
    const selectedTeamText = document.getElementById('selectedTeamText');
    const openModalBtn = document.getElementById('openConfirmModalBtn');
    const modal = document.getElementById('predictionConfirmModal');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalCancelBtn = document.getElementById('modalCancelBtn');
    const modalConfirmBtn = document.getElementById('modalConfirmSubmitBtn');
    const modalTeamName = document.getElementById('modalSelectedTeamName');

    if (!cardA || !cardB) return;

    function selectTeam(teamName, activeCard, inactiveCard) {
      selectedTeam = teamName;
      activeCard.classList.add('is-selected');
      activeCard.setAttribute('aria-checked', 'true');
      inactiveCard.classList.remove('is-selected');
      inactiveCard.setAttribute('aria-checked', 'false');

      if (selectedTeamText) {
        selectedTeamText.textContent = teamName;
      }
      if (openModalBtn) {
        openModalBtn.disabled = false;
      }
    }

    cardA.addEventListener('click', () => {
      selectTeam(cardA.getAttribute('data-team'), cardA, cardB);
    });
    cardA.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectTeam(cardA.getAttribute('data-team'), cardA, cardB);
      }
    });

    cardB.addEventListener('click', () => {
      selectTeam(cardB.getAttribute('data-team'), cardB, cardA);
    });
    cardB.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectTeam(cardB.getAttribute('data-team'), cardB, cardA);
      }
    });

    // Open confirmation modal
    if (openModalBtn && modal) {
      openModalBtn.addEventListener('click', () => {
        if (!selectedTeam) return;
        if (modalTeamName) modalTeamName.textContent = selectedTeam;
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
      });
    }

    // Close modal actions
    function closeModal() {
      if (modal) {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
      }
    }

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
    if (modalCancelBtn) modalCancelBtn.addEventListener('click', closeModal);

    // Close on backdrop click
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
    }

    // Confirm submission
    if (modalConfirmBtn) {
      modalConfirmBtn.addEventListener('click', () => {
        handlePredictionSubmit(closeModal);
      });
    }
  }

  async function handlePredictionSubmit(closeModalCallback) {
    if (!selectedTeam || !currentMatch || isSubmitting) return;

    const modalConfirmBtn = document.getElementById('modalConfirmSubmitBtn');
    const alertBox = document.getElementById('predictionAlertBox');

    isSubmitting = true;
    if (modalConfirmBtn) {
      modalConfirmBtn.disabled = true;
      modalConfirmBtn.textContent = 'Submitting Prediction...';
    }

    try {
      // 1. Get CSRF token
      let csrfToken = null;
      if (window.TossArenaAuth && window.TossArenaAuth.getCsrfToken) {
        csrfToken = await window.TossArenaAuth.getCsrfToken();
      }

      // 2. Resolve API endpoint
      const config = window.TossArenaConfig || {};
      const endpoint = config.getApiUrl
        ? config.getApiUrl(config.ENDPOINTS.PREDICTIONS || '/predictions')
        : 'http://localhost:5000/api/predictions';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-Token': csrfToken || ''
        },
        credentials: 'include',
        body: JSON.stringify({
          matchId: currentMatch.id,
          predictedTeam: selectedTeam
        })
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.message || `Submission failed with HTTP ${res.status}`);
      }

      // Prediction saved successfully!
      closeModalCallback();
      userPrediction = body.data;

      // Re-render page to show saved state
      const contentArea = document.getElementById('matchDetailsContentArea');
      const breadcrumbTitle = document.getElementById('breadcrumbMatchTitle');
      if (contentArea) {
        renderPage(contentArea, breadcrumbTitle);
      }
    } catch (err) {
      console.error('Prediction submission failed:', err);
      closeModalCallback();

      if (alertBox) {
        alertBox.style.display = 'block';
        alertBox.style.background = 'rgba(239, 68, 68, 0.12)';
        alertBox.style.border = '1px solid var(--accent-red)';
        alertBox.style.color = '#fca5a5';
        alertBox.textContent = `Submission Error: ${err.message}`;
      } else {
        alert(`Prediction Error: ${err.message}`);
      }
    } finally {
      isSubmitting = false;
      if (modalConfirmBtn) {
        modalConfirmBtn.disabled = false;
        modalConfirmBtn.textContent = 'Confirm & Submit Prediction';
      }
    }
  }

  function renderErrorState(container, title, message, isRetryable, retryCallback) {
    container.innerHTML = `
      <div class="state-box" style="margin: var(--space-8) auto;">
        <div class="state-icon">${isRetryable ? '⚠️' : '🔍'}</div>
        <h2 class="state-title">${escapeHtml(title)}</h2>
        <p class="state-desc">${escapeHtml(message)}</p>
        <div style="display: flex; gap: var(--space-3); justify-content: center; flex-wrap: wrap;">
          <a href="matches.html" class="btn btn-primary btn-sm">
            ← Back to Matches
          </a>
          ${isRetryable ? '<button type="button" class="btn btn-outline btn-sm" id="retryMatchBtn">Retry</button>' : ''}
        </div>
      </div>
    `;

    if (isRetryable && retryCallback) {
      const btn = document.getElementById('retryMatchBtn');
      if (btn) {
        btn.addEventListener('click', retryCallback);
      }
    }
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str || '');
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
