/**
 * TossArena - Matches Explorer Controller (Day 6 Implementation)
 * Handles server-side paginated queries, debounced search, status and tournament filtering,
 * allowlisted sorting, request cancellation via AbortController, and navigation to Match Details.
 */

(function () {
  'use strict';

  // State
  let currentPage = 1;
  const pageLimit = 12;
  let activeSearch = '';
  let activeStatus = 'all';
  let activeTournament = '';
  let activeSort = 'date_asc';
  let activeAbortController = null;

  // DOM Elements
  let containerEl = null;
  let searchInputEl = null;
  let clearSearchBtnEl = null;
  let filterChipsEl = [];
  let tournamentSelectEl = null;
  let sortSelectEl = null;
  let resetBtnEl = null;
  let matchCountBadgeEl = null;
  let matchCountIndicatorEl = null;
  let paginationContainerEl = null;
  let paginationInfoEl = null;
  let prevPageBtnEl = null;
  let nextPageBtnEl = null;
  let pageNumbersContainerEl = null;

  document.addEventListener('DOMContentLoaded', async () => {
    // Session authorization check: Matches is the primary page for authenticated users
    if (window.TossArenaAuth && window.TossArenaAuth.getCurrentUser) {
      try {
        const user = await window.TossArenaAuth.getCurrentUser(true);
        if (!user) {
          const isPagesDir = window.location.pathname.includes('/pages/');
          const loginUrl = isPagesDir 
            ? 'login.html?returnUrl=matches.html' 
            : 'pages/login.html?returnUrl=/matches';
          window.location.replace(loginUrl);
          return;
        }
      } catch (err) {
        const isPagesDir = window.location.pathname.includes('/pages/');
        const loginUrl = isPagesDir 
          ? 'login.html?returnUrl=matches.html' 
          : 'pages/login.html?returnUrl=/matches';
        window.location.replace(loginUrl);
        return;
      }
    }

    initElements();
    loadTournaments();
    bindEvents();
    fetchMatches(1);
  });

  function initElements() {
    containerEl = document.getElementById('matchesListContainer');
    searchInputEl = document.getElementById('matchSearchInput');
    clearSearchBtnEl = document.getElementById('clearSearchBtn');
    filterChipsEl = Array.from(document.querySelectorAll('.filter-chip'));
    tournamentSelectEl = document.getElementById('tournamentFilterSelect');
    sortSelectEl = document.getElementById('matchSortSelect');
    resetBtnEl = document.getElementById('resetFiltersBtn');
    matchCountBadgeEl = document.getElementById('matchCountBadge');
    matchCountIndicatorEl = document.getElementById('matchCountIndicator');
    paginationContainerEl = document.getElementById('paginationContainer');
    paginationInfoEl = document.getElementById('paginationInfo');
    prevPageBtnEl = document.getElementById('prevPageBtn');
    nextPageBtnEl = document.getElementById('nextPageBtn');
    pageNumbersContainerEl = document.getElementById('pageNumbersContainer');
  }

  function bindEvents() {
    // Search input with debounce
    if (searchInputEl) {
      let debounceTimer = null;
      searchInputEl.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (clearSearchBtnEl) {
          if (val.length > 0) {
            clearSearchBtnEl.classList.remove('is-hidden');
          } else {
            clearSearchBtnEl.classList.add('is-hidden');
          }
        }

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          activeSearch = val;
          currentPage = 1;
          fetchMatches(1);
        }, 300);
      });
    }

    // Clear search button
    if (clearSearchBtnEl) {
      clearSearchBtnEl.addEventListener('click', () => {
        if (searchInputEl) {
          searchInputEl.value = '';
          searchInputEl.focus();
        }
        clearSearchBtnEl.classList.add('is-hidden');
        if (activeSearch !== '') {
          activeSearch = '';
          currentPage = 1;
          fetchMatches(1);
        }
      });
    }

    // Status filter chips
    filterChipsEl.forEach((chip) => {
      chip.addEventListener('click', () => {
        filterChipsEl.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        activeStatus = chip.getAttribute('data-status') || 'all';
        currentPage = 1;
        fetchMatches(1);
      });
    });

    // Tournament dropdown
    if (tournamentSelectEl) {
      tournamentSelectEl.addEventListener('change', (e) => {
        activeTournament = e.target.value;
        currentPage = 1;
        fetchMatches(1);
      });
    }

    // Sort dropdown
    if (sortSelectEl) {
      sortSelectEl.addEventListener('change', (e) => {
        activeSort = e.target.value;
        currentPage = 1;
        fetchMatches(1);
      });
    }

    // Reset filters button
    if (resetBtnEl) {
      resetBtnEl.addEventListener('click', resetAllFilters);
    }

    // Pagination Previous & Next
    if (prevPageBtnEl) {
      prevPageBtnEl.addEventListener('click', () => {
        if (currentPage > 1) {
          fetchMatches(currentPage - 1);
          scrollGridIntoView();
        }
      });
    }

    if (nextPageBtnEl) {
      nextPageBtnEl.addEventListener('click', () => {
        fetchMatches(currentPage + 1);
        scrollGridIntoView();
      });
    }
  }

  function resetAllFilters() {
    if (searchInputEl) searchInputEl.value = '';
    if (clearSearchBtnEl) clearSearchBtnEl.classList.add('is-hidden');
    activeSearch = '';

    filterChipsEl.forEach((c) => c.classList.remove('active'));
    const defaultChip = document.querySelector('.filter-chip[data-status="all"]');
    if (defaultChip) defaultChip.classList.add('active');
    activeStatus = 'all';

    if (tournamentSelectEl) tournamentSelectEl.value = '';
    activeTournament = '';

    if (sortSelectEl) sortSelectEl.value = 'date_asc';
    activeSort = 'date_asc';

    currentPage = 1;
    fetchMatches(1);
  }

  /**
   * Load tournaments for the filter dropdown
   */
  async function loadTournaments() {
    if (!tournamentSelectEl) return;

    try {
      const config = window.TossArenaConfig || {};
      const baseUrl = config.getApiUrl ? config.getApiUrl(config.ENDPOINTS.MATCHES || '/matches') : 'http://localhost:5000/api/matches';
      const tournamentsUrl = `${baseUrl}/tournaments`;

      const res = await fetch(tournamentsUrl, {
        headers: { 'Accept': 'application/json' }
      });

      if (!res.ok) return;

      const body = await res.json();
      const tournaments = Array.isArray(body.data) ? body.data : [];

      // Preserve first option
      tournamentSelectEl.innerHTML = '<option value="">All Tournaments</option>';
      tournaments.forEach((tourn) => {
        const opt = document.createElement('option');
        opt.value = tourn;
        opt.textContent = tourn;
        tournamentSelectEl.appendChild(opt);
      });
    } catch (err) {
      console.warn('Could not load tournament filters:', err);
    }
  }

  /**
   * Server-side paginated match query
   */
  async function fetchMatches(page = 1) {
    if (!containerEl) return;

    // Cancel in-flight request if user triggered another action
    if (activeAbortController) {
      activeAbortController.abort();
    }
    activeAbortController = new AbortController();

    renderSkeletons(containerEl, 4);

    try {
      const config = window.TossArenaConfig || {};
      const baseUrl = config.getApiUrl ? config.getApiUrl(config.ENDPOINTS.MATCHES || '/matches') : 'http://localhost:5000/api/matches';

      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', pageLimit.toString());

      if (activeSearch) params.set('search', activeSearch);
      if (activeStatus && activeStatus !== 'all') params.set('status', activeStatus);
      if (activeTournament) params.set('tournament', activeTournament);
      if (activeSort) params.set('sort', activeSort);

      const requestUrl = `${baseUrl}?${params.toString()}`;

      const res = await fetch(requestUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: activeAbortController.signal
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const payload = await res.json();
      const matches = Array.isArray(payload.data) ? payload.data : [];
      const pagination = payload.pagination || { page: 1, limit: pageLimit, total: matches.length, totalPages: 1 };

      currentPage = pagination.page;

      // Update match count badge
      if (matchCountBadgeEl) {
        matchCountBadgeEl.textContent = pagination.total.toString();
      }

      if (matches.length === 0) {
        renderEmptyState(containerEl);
        if (paginationContainerEl) paginationContainerEl.style.display = 'none';
        return;
      }

      renderMatches(containerEl, matches);
      renderPagination(pagination);
    } catch (err) {
      if (err.name === 'AbortError') {
        // Request intentionally aborted by a subsequent filter change
        return;
      }
      console.error('Matches fetch error:', err);
      renderErrorState(containerEl, 'Unable to load cricket fixtures at this moment. Please check your backend connection.');
      if (paginationContainerEl) paginationContainerEl.style.display = 'none';
      if (matchCountBadgeEl) matchCountBadgeEl.textContent = '0';
    } finally {
      activeAbortController = null;
    }
  }

  function renderMatches(container, matches) {
    container.innerHTML = '';

    matches.forEach((m) => {
      const card = document.createElement('div');
      card.className = 'match-card';

      const safeTeamA = escapeHtml(m.team_a || 'Team A');
      const safeTeamB = escapeHtml(m.team_b || 'Team B');
      const teamAInitials = escapeHtml((m.team_a || 'A').substring(0, 2).toUpperCase());
      const teamBInitials = escapeHtml((m.team_b || 'B').substring(0, 2).toUpperCase());
      const safeTournament = escapeHtml(m.tournament_name || 'Cricket Fixture');
      const safeVenue = escapeHtml(m.venue || 'Neutral Ground');
      const statusKey = (m.status || 'upcoming').toLowerCase();

      // Format scheduled date in local timezone
      let formattedDate = 'TBD (UTC)';
      if (m.scheduled_at) {
        try {
          const d = new Date(m.scheduled_at);
          formattedDate = d.toLocaleString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
        } catch (e) {
          formattedDate = m.scheduled_at;
        }
      }

      // Status badge and prediction eligibility badge
      let statusBadgeClass = 'badge-amber';
      let predBadgeClass = 'prediction-badge-upcoming';
      let predBadgeText = '⏳ Opens Soon';

      if (statusKey === 'open') {
        statusBadgeClass = 'badge-emerald';
        predBadgeClass = 'prediction-badge-open';
        predBadgeText = '🪙 Open for Predictions';
      } else if (statusKey === 'locked') {
        statusBadgeClass = 'badge-amber';
        predBadgeClass = 'prediction-badge-locked';
        predBadgeText = '🔒 Cutoff Reached';
      } else if (statusKey === 'completed') {
        statusBadgeClass = 'badge';
        predBadgeClass = 'prediction-badge-completed';
        predBadgeText = '✓ Toss Concluded';
      } else if (statusKey === 'cancelled') {
        statusBadgeClass = 'badge-amber';
        predBadgeClass = 'prediction-badge-completed';
        predBadgeText = '✕ Match Cancelled';
      }

      card.innerHTML = `
        <div class="match-header">
          <span class="match-tournament">${safeTournament}</span>
          <span class="badge ${statusBadgeClass}">${escapeHtml(statusKey.toUpperCase())}</span>
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
          <div>📅 <strong>Schedule:</strong> ${escapeHtml(formattedDate)}</div>
          <div>📍 <strong>Venue:</strong> ${safeVenue}</div>
          <div>
            <strong>Status:</strong>
            <span class="prediction-badge ${predBadgeClass}">${predBadgeText}</span>
          </div>
        </div>
        <div style="margin-top: auto; padding-top: var(--space-4); display: flex; gap: var(--space-2);">
          <a href="match-details.html?id=${encodeURIComponent(m.id)}" class="btn btn-primary btn-sm" style="width: 100%; text-align: center;">
            Match Details →
          </a>
        </div>
      `;

      container.appendChild(card);
    });
  }

  function renderPagination(pagination) {
    if (!paginationContainerEl) return;

    const { page, limit, total, totalPages } = pagination;

    if (total === 0 || totalPages <= 1) {
      paginationContainerEl.style.display = 'none';
      return;
    }

    paginationContainerEl.style.display = 'flex';

    // Start & End counts
    const startItem = (page - 1) * limit + 1;
    const endItem = Math.min(page * limit, total);

    if (paginationInfoEl) {
      paginationInfoEl.textContent = `Showing ${startItem}–${endItem} of ${total} matches (Page ${page} of ${totalPages})`;
    }

    // Previous button
    if (prevPageBtnEl) {
      prevPageBtnEl.disabled = (page <= 1);
    }

    // Next button
    if (nextPageBtnEl) {
      nextPageBtnEl.disabled = (page >= totalPages);
    }

    // Numeric page buttons
    if (pageNumbersContainerEl) {
      pageNumbersContainerEl.innerHTML = '';

      // Show limited window of page numbers
      const maxButtons = 5;
      let startPage = Math.max(1, page - 2);
      let endPage = Math.min(totalPages, startPage + maxButtons - 1);

      if (endPage - startPage + 1 < maxButtons) {
        startPage = Math.max(1, endPage - maxButtons + 1);
      }

      for (let p = startPage; p <= endPage; p++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `pagination-btn ${p === page ? 'active' : ''}`;
        btn.textContent = p.toString();
        btn.setAttribute('aria-label', `Go to page ${p}`);
        if (p === page) {
          btn.setAttribute('aria-current', 'page');
        } else {
          btn.addEventListener('click', () => {
            fetchMatches(p);
            scrollGridIntoView();
          });
        }
        pageNumbersContainerEl.appendChild(btn);
      }
    }
  }

  function renderSkeletons(container, count) {
    let skeletonsHtml = '';
    for (let i = 0; i < count; i++) {
      skeletonsHtml += '<div class="skeleton-card skeleton-shimmer"></div>';
    }
    container.innerHTML = skeletonsHtml;
  }

  function renderEmptyState(container) {
    container.innerHTML = `
      <div class="state-box" style="grid-column: 1 / -1;">
        <div class="state-icon">🏏</div>
        <h3 class="state-title">No Matches Found</h3>
        <p class="state-desc">
          Try changing your search or filters. Scheduled matches will appear here when they match your selected criteria.
        </p>
        <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
          <button type="button" class="btn btn-primary btn-sm" id="emptyClearFiltersBtn">
            Clear Filters
          </button>
        </div>
      </div>
    `;

    const clearBtn = document.getElementById('emptyClearFiltersBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', resetAllFilters);
    }
  }

  function renderErrorState(container, message) {
    container.innerHTML = `
      <div class="state-box" style="grid-column: 1 / -1; border-color: var(--accent-red);">
        <div class="state-icon">⚠️</div>
        <h3 class="state-title">Connection Error</h3>
        <p class="state-desc">${escapeHtml(message)}</p>
        <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
          <button type="button" class="btn btn-primary btn-sm" id="retryMatchesBtn">
            Retry Connection
          </button>
        </div>
      </div>
    `;

    const retryBtn = document.getElementById('retryMatchesBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => fetchMatches(currentPage));
    }
  }

  function scrollGridIntoView() {
    if (containerEl) {
      containerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
