/**
 * TossArena - Match Details Controller (Day 6 Implementation)
 * Validates match ID, fetches single match fixture from MySQL via GET /api/matches/:id,
 * formats dates in local timezone, displays prediction market status, and handles 404/error states safely.
 */

(function () {
  'use strict';

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

    // 2. Fetch match from API
    await loadMatchById(contentArea, breadcrumbTitle, matchId);
  }

  async function loadMatchById(container, breadcrumbTitle, matchId) {
    // Show skeleton placeholder
    container.innerHTML = `
      <div class="skeleton-card skeleton-shimmer" style="height: 280px; margin-bottom: var(--space-6);"></div>
      <div class="match-details-grid">
        <div class="skeleton-card skeleton-shimmer" style="height: 180px;"></div>
        <div class="skeleton-card skeleton-shimmer" style="height: 180px;"></div>
      </div>
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
      const match = payload.data;

      if (!match) {
        throw new Error('Malformed API response: missing match data.');
      }

      renderMatchDetails(container, breadcrumbTitle, match);
    } catch (err) {
      console.error('Match details fetch error:', err);
      renderErrorState(
        container,
        'Unable to Load Match',
        'Could not communicate with the TossArena backend service. Please verify your connection and try again.',
        true,
        () => loadMatchById(container, breadcrumbTitle, matchId)
      );
      if (breadcrumbTitle) breadcrumbTitle.textContent = 'Error';
    }
  }

  function renderMatchDetails(container, breadcrumbTitle, match) {
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

    // Status badges & styles
    let statusBadgeClass = 'badge-amber';
    let predictionCardClass = '';
    let predictionTitle = '⏳ Prediction Window Opening Soon';
    let predictionDesc = 'This fixture is scheduled in the database. The virtual toss prediction window opens closer to the official coin toss cutoff time.';

    if (statusKey === 'open') {
      statusBadgeClass = 'badge-emerald';
      predictionCardClass = 'status-open';
      predictionTitle = '🪙 Virtual Coin Toss Predictions Open';
      predictionDesc = 'The prediction window for this fixture is currently active. You can analyze venue history, pitch reports, and team toss patterns. Live prediction submission with demo credits will be supported in Day 7.';
    } else if (statusKey === 'locked') {
      statusBadgeClass = 'badge-amber';
      predictionTitle = '🔒 Predictions Locked';
      predictionDesc = 'Prediction submissions for this match are closed because the toss cutoff time has passed or the toss is actively underway.';
    } else if (statusKey === 'completed') {
      statusBadgeClass = 'badge';
      predictionTitle = '✓ Match Coin Toss Concluded';
      if (match.result_toss_winner) {
        const decisionText = match.result_decision ? ` elected to ${escapeHtml(match.result_decision.toUpperCase())}` : '';
        predictionDesc = `Official result: ${escapeHtml(match.result_toss_winner)} won the coin toss and${decisionText}. Predictions for this match are finalized.`;
      } else {
        predictionDesc = 'The official coin toss for this match has concluded and results are recorded in the system.';
      }
    } else if (statusKey === 'cancelled') {
      statusBadgeClass = 'badge-amber';
      predictionTitle = '✕ Fixture Cancelled';
      predictionDesc = 'This match fixture has been cancelled. All associated virtual demo credit predictions will be refunded.';
    }

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

      <!-- Prediction Availability Section -->
      <section class="prediction-status-card ${predictionCardClass}">
        <div class="prediction-status-header">
          <div class="prediction-status-title">
            ${predictionTitle}
          </div>
          <span class="badge" style="background: rgba(255,255,255,0.08); color: var(--text-secondary); font-size: 0.7rem;">
            Virtual Credits Only
          </span>
        </div>
        <p class="prediction-status-desc">${predictionDesc}</p>
        <div class="prediction-notice-callout">
          <strong>Virtual Demo Credits Platform:</strong> TossArena is an entertainment forecasting experience using simulated demo credits exclusively. No real money, deposits, or cash withdrawals are supported.
        </div>
      </section>

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
    `;
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
