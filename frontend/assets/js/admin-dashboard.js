/**
 * TossArena Admin Dashboard Client
 * Loads authoritative executive overview statistics, fixture activity, and audit logs.
 * Strictly enforces administrator session access control.
 */

(function () {
  'use strict';

  // DOM Elements - User Card
  const adminUserName = document.getElementById('adminUserName');
  const adminUserEmail = document.getElementById('adminUserEmail');
  const adminUserAvatar = document.getElementById('adminUserAvatar');
  const adminLogoutBtn = document.getElementById('adminLogoutBtn');

  // DOM Elements - Sidebar
  const dashSidebar = document.getElementById('dashSidebar');
  const dashSidebarOpen = document.getElementById('dashSidebarOpen');
  const dashSidebarClose = document.getElementById('dashSidebarClose');
  const dashNavBackdrop = document.getElementById('dashNavBackdrop');

  // Topbar Controls
  const btnRefreshOverview = document.getElementById('btnRefreshOverview');

  // Stat Elements
  const statTotalUsers = document.getElementById('statTotalUsers');
  const statUsersBreakdown = document.getElementById('statUsersBreakdown');
  const statTotalMatches = document.getElementById('statTotalMatches');
  const statMatchesBreakdown = document.getElementById('statMatchesBreakdown');
  const statAwaitingResults = document.getElementById('statAwaitingResults');
  const statResultsPublished = document.getElementById('statResultsPublished');
  const statTotalPreds = document.getElementById('statTotalPreds');
  const statPredsBreakdown = document.getElementById('statPredsBreakdown');

  // Tables
  const urgentMatchesTableBody = document.getElementById('urgentMatchesTableBody');
  const recentAuditsTableBody = document.getElementById('recentAuditsTableBody');
  const toastContainer = document.getElementById('toastContainer');

  function getApiUrl(endpoint) {
    if (window.TossArenaConfig && window.TossArenaConfig.getApiUrl) {
      return window.TossArenaConfig.getApiUrl(endpoint);
    }
    return `http://localhost:5000/api${endpoint}`;
  }

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

  function setupSidebar() {
    if (dashSidebarOpen && dashSidebar && dashNavBackdrop) {
      dashSidebarOpen.addEventListener('click', () => {
        dashSidebar.classList.add('open');
        dashSidebar.classList.add('is-open');
        dashNavBackdrop.classList.add('active');
        dashNavBackdrop.classList.add('is-active');
      });
    }
    const closeSidebar = () => {
      if (dashSidebar) {
        dashSidebar.classList.remove('open');
        dashSidebar.classList.remove('is-open');
      }
      if (dashNavBackdrop) {
        dashNavBackdrop.classList.remove('active');
        dashNavBackdrop.classList.remove('is-active');
      }
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
   * Loads executive dashboard statistics
   */
  async function loadDashboardOverview() {
    try {
      const response = await fetch(getApiUrl('/admin/dashboard/overview'), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      });

      if (response.status === 401 || response.status === 403) {
        window.location.href = '../admin/login.html';
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to load executive overview (HTTP ${response.status})`);
      }

      const resJson = await response.json();
      const data = resJson.data || {};

      renderStatCards(data);
      renderUrgentMatches(data.urgentMatches || []);
      renderRecentAudits(data.recentAuditLogs || []);
    } catch (err) {
      console.error('Admin dashboard load error:', err);
      showToast(err.message, 'error');
    }
  }

  function renderStatCards(data) {
    const u = data.users || {};
    const m = data.matches || {};
    const p = data.predictions || {};

    if (statTotalUsers) statTotalUsers.textContent = Number(u.total || 0).toLocaleString();
    if (statUsersBreakdown) {
      statUsersBreakdown.textContent = `${Number(u.active || 0).toLocaleString()} Active • ${Number(u.suspended || 0).toLocaleString()} Suspended`;
    }

    if (statTotalMatches) statTotalMatches.textContent = Number(m.total || 0).toLocaleString();
    if (statMatchesBreakdown) {
      statMatchesBreakdown.textContent = `${Number(m.open || 0).toLocaleString()} Open • ${Number(m.completed || 0).toLocaleString()} Completed`;
    }

    if (statAwaitingResults) statAwaitingResults.textContent = Number(m.awaitingResults || 0).toLocaleString();
    if (statResultsPublished) statResultsPublished.textContent = Number(m.resultsPublished || 0).toLocaleString();

    if (statTotalPreds) statTotalPreds.textContent = Number(p.total || 0).toLocaleString();
    if (statPredsBreakdown) {
      statPredsBreakdown.textContent = `${p.accuracyRate || 0}% Accuracy • ${Number(p.pending || 0).toLocaleString()} Pending`;
    }
  }

  function renderUrgentMatches(matches) {
    if (!urgentMatchesTableBody) return;

    if (!matches || matches.length === 0) {
      urgentMatchesTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            All scheduled fixtures have been resolved or locked. No immediate action required.
          </td>
        </tr>
      `;
      return;
    }

    const rowsHtml = matches.map(m => {
      let statusBadge = `<span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; font-size: 0.72rem; padding: 0.2rem 0.5rem;">● ${m.status.toUpperCase()}</span>`;
      if (m.status === 'locked') {
        statusBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; font-size: 0.72rem; padding: 0.2rem 0.5rem;">🔒 LOCKED</span>`;
      }

      let actionLink = `
        <a href="results.html" class="btn btn-primary btn-sm" style="font-size: 0.75rem; padding: 0.3rem 0.65rem; background: linear-gradient(135deg, #10b981, #059669); border: none;">
          Declare Toss →
        </a>
      `;
      if (m.status === 'open') {
        actionLink = `
          <a href="matches.html" class="btn btn-outline btn-sm" style="font-size: 0.75rem; padding: 0.3rem 0.65rem;">
            Review Fixture →
          </a>
        `;
      }

      const defaultMatchTitle = `${m.teamA} vs ${m.teamB}`;
      const hasDistinctTitle = m.title && m.title.trim().toLowerCase() !== defaultMatchTitle.toLowerCase();
      const subtitle = hasDistinctTitle
        ? `<div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 3px;">${escapeHtml(m.title)}</div>`
        : `<div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 3px;">Match #${m.id}</div>`;

      return `
        <tr>
          <td style="font-weight: 700; color: var(--text-muted); font-size: 0.8rem; white-space: nowrap;">#${m.id}</td>
          <td>
            <div style="font-weight: 700; color: var(--text-primary); font-size: 0.92rem;">
              ${escapeHtml(m.teamA)} <span style="color: var(--text-muted); font-weight: 400; font-size: 0.82rem;">vs</span> ${escapeHtml(m.teamB)}
            </div>
            ${subtitle}
          </td>
          <td>
            <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-primary);">${escapeHtml(m.tournamentName)}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">📍 ${escapeHtml(m.venue)}</div>
          </td>
          <td style="white-space: nowrap;">
            <div style="font-size: 0.82rem; color: var(--text-secondary);">📅 ${formatDateTime(m.scheduledAt)}</div>
          </td>
          <td>${statusBadge}</td>
          <td>
            <span style="font-size: 0.82rem; font-weight: 600; color: var(--accent-mint); white-space: nowrap;">🎯 ${m.predictionCount || 0} picks</span>
          </td>
          <td style="text-align: right; white-space: nowrap;">${actionLink}</td>
        </tr>
      `;
    }).join('');

    urgentMatchesTableBody.innerHTML = rowsHtml;
  }

  function renderRecentAudits(audits) {
    if (!recentAuditsTableBody) return;

    if (!audits || audits.length === 0) {
      recentAuditsTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            No administrative audit log entries recorded yet.
          </td>
        </tr>
      `;
      return;
    }

    const rowsHtml = audits.map(a => {
      const actionClass = `audit-action-${(a.action || '').toLowerCase()}`;
      const actionLabel = (a.action || 'EVENT').replace(/_/g, ' ');

      let detailsSummary = '—';
      if (a.details) {
        if (a.details.matchTitle) {
          detailsSummary = `${escapeHtml(a.details.matchTitle)}`;
        } else if (a.details.cancellationReason) {
          detailsSummary = `Reason: ${escapeHtml(a.details.cancellationReason)}`;
        } else if (a.details.resultTossWinner) {
          detailsSummary = `Winner: ${escapeHtml(a.details.resultTossWinner)} (${escapeHtml(a.details.resultDecision || '')})`;
        } else {
          detailsSummary = JSON.stringify(a.details).slice(0, 45);
        }
      }

      const operatorName = a.actor ? escapeHtml(a.actor.name) : 'System';

      return `
        <tr>
          <td style="font-weight: 700; color: var(--text-muted); font-size: 0.8rem;">#${a.id}</td>
          <td>
            <span class="audit-action-badge ${actionClass}">${actionLabel}</span>
          </td>
          <td>
            <div style="font-weight: 600; color: var(--text-primary); font-size: 0.85rem;">${operatorName}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(a.actor?.email || '')}</div>
          </td>
          <td style="font-size: 0.82rem; color: var(--text-secondary);">
            ${escapeHtml(a.entityType || '—')} ${a.entityId ? `#${a.entityId}` : ''}
          </td>
          <td style="font-size: 0.82rem; color: var(--text-secondary); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${detailsSummary}
          </td>
          <td style="text-align: right; font-size: 0.8rem; color: var(--text-muted); white-space: nowrap;">
            ${formatDateTime(a.createdAt)}
          </td>
        </tr>
      `;
    }).join('');

    recentAuditsTableBody.innerHTML = rowsHtml;
  }

  // Event Listeners
  if (btnRefreshOverview) {
    btnRefreshOverview.addEventListener('click', () => {
      loadDashboardOverview();
      showToast('Dashboard metrics refreshed from database.', 'info');
    });
  }

  if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener('click', async () => {
      try {
        await window.TossArenaAuth.logout();
      } catch (_) {}
      window.location.href = '../admin/login.html';
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    setupSidebar();
    const authorized = await initAdminAuth();
    if (authorized) {
      await loadDashboardOverview();
    }
  });

})();
