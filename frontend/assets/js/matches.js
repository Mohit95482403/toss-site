/**
 * TossArena - Matches Feed & Filter Controller
 * Handles fixture querying, client-side search, status filtering, and state rendering.
 */

document.addEventListener('DOMContentLoaded', () => {
  initMatchesFeed();
});

let loadedMatches = [];
let activeStatusFilter = 'all';

async function initMatchesFeed() {
  const container = document.getElementById('matchesListContainer');
  const searchInput = document.getElementById('matchSearchInput');
  const filterChips = document.querySelectorAll('.filter-chip');
  const resetBtn = document.getElementById('resetFiltersBtn');

  if (!container) return;

  // Show loading skeleton
  renderSkeletons(container, 4);

  // Wire search input listener (debounced)
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        applyFilters(container, e.target.value.trim().toLowerCase());
      }, 200);
    });
  }

  // Wire status filter chips
  filterChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      filterChips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      activeStatusFilter = chip.getAttribute('data-status') || 'all';
      const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
      applyFilters(container, searchTerm);
    });
  });

  // Wire reset button
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      activeStatusFilter = 'all';
      filterChips.forEach((c) => c.classList.remove('active'));
      const defaultChip = document.querySelector('.filter-chip[data-status="all"]');
      if (defaultChip) defaultChip.classList.add('active');
      applyFilters(container, '');
    });
  }

  // Fetch from API
  const config = window.TossArenaConfig || {};
  const endpoint = config.getApiUrl ? config.getApiUrl(config.ENDPOINTS.MATCHES) : 'http://localhost:5000/api/matches';

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
      if (list.length > 0) {
        loadedMatches = list;
        applyFilters(container, '');
        return;
      }
    }

    // Gracefully handle empty or unreleased endpoint
    renderMatchesEmptyState(container, 'No cricket matches currently scheduled.');
  } catch (err) {
    renderMatchesEmptyState(container, 'Matches API service is currently preparing upcoming fixtures.');
  }
}

function renderSkeletons(container, count) {
  let skeletonsHtml = '';
  for (let i = 0; i < count; i++) {
    skeletonsHtml += '<div class="skeleton-card skeleton-shimmer"></div>';
  }
  container.innerHTML = skeletonsHtml;
}

function applyFilters(container, query) {
  if (loadedMatches.length === 0) {
    renderMatchesEmptyState(container, 'Matches feed is currently under development.');
    return;
  }

  const filtered = loadedMatches.filter((m) => {
    // Status check
    const matchesStatus = activeStatusFilter === 'all' || (m.status && m.status.toLowerCase() === activeStatusFilter);
    // Search check
    const titleMatch = (m.title || '').toLowerCase().includes(query);
    const teamAMatch = (m.team_a || '').toLowerCase().includes(query);
    const teamBMatch = (m.team_b || '').toLowerCase().includes(query);
    const tournamentMatch = (m.tournament_name || '').toLowerCase().includes(query);

    return matchesStatus && (query === '' || titleMatch || teamAMatch || teamBMatch || tournamentMatch);
  });

  if (filtered.length === 0) {
    renderMatchesEmptyState(container, 'No matches match your current search and filter criteria.');
    return;
  }

  container.innerHTML = '';
  filtered.forEach((m) => {
    const card = document.createElement('div');
    card.className = 'match-card';

    const safeTeamA = escapeHtml(m.team_a || 'Team A');
    const safeTeamB = escapeHtml(m.team_b || 'Team B');
    const teamAInitials = escapeHtml((m.team_a || 'A').substring(0, 2).toUpperCase());
    const teamBInitials = escapeHtml((m.team_b || 'B').substring(0, 2).toUpperCase());
    const scheduledDate = m.scheduled_at ? new Date(m.scheduled_at).toLocaleString() : 'TBD (UTC)';

    card.innerHTML = `
      <div class="match-header">
        <span class="match-tournament">${escapeHtml(m.tournament_name || 'Cricket League')}</span>
        <span class="badge ${m.status === 'open' ? 'badge-emerald' : 'badge-amber'}">${escapeHtml(m.status || 'Upcoming')}</span>
      </div>
      <div class="match-teams">
        <div class="match-team">
          <div class="team-badge-circle">${teamAInitials}</div>
          <div class="team-name">${safeTeamA}</div>
        </div>
        <div class="match-vs">VS</div>
        <div class="match-team">
          <div class="team-badge-circle">${teamBInitials}</div>
          <div class="team-name">${safeTeamB}</div>
        </div>
      </div>
      <div class="match-meta">
        <div>📅 <strong>Match Time:</strong> ${scheduledDate}</div>
        <div>📍 <strong>Venue:</strong> ${escapeHtml(m.venue || 'Neutral Ground')}</div>
        <div>🪙 <strong>Market:</strong> Toss Winner &amp; Decision</div>
      </div>
      <button type="button" class="btn btn-outline btn-sm" style="margin-top: auto; width: 100%;" onclick="alert('Virtual toss prediction submission is scheduled for implementation in upcoming phases!')">
        Predict Toss (Demo)
      </button>
    `;

    container.appendChild(card);
  });
}

function renderMatchesEmptyState(container, message) {
  container.innerHTML = `
    <div class="state-box" style="grid-column: 1 / -1;">
      <div class="state-icon">🏏</div>
      <h3 class="state-title">No Matches Available</h3>
      <p class="state-desc">${escapeHtml(message)}</p>
      <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
        <a href="how-to-play.html" class="btn btn-primary btn-sm">Explore How to Play</a>
        <button type="button" class="btn btn-outline btn-sm" id="retryMatchesBtn">Retry Feed</button>
      </div>
    </div>
  `;

  const retry = document.getElementById('retryMatchesBtn');
  if (retry) {
    retry.addEventListener('click', () => initMatchesFeed());
  }
}
