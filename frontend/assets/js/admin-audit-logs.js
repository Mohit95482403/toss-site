/**
 * TossArena Admin Audit Logs Client
 * Renders compliance audit trail with filtering, pagination, and payload inspection.
 * Enforces administrator session access control.
 */

(function () {
  'use strict';

  let currentPage = 1;
  const pageLimit = 20;
  let activeLogs = [];

  const adminUserName = document.getElementById('adminUserName');
  const adminUserEmail = document.getElementById('adminUserEmail');
  const adminUserAvatar = document.getElementById('adminUserAvatar');
  const adminLogoutBtn = document.getElementById('adminLogoutBtn');

  const dashSidebar = document.getElementById('dashSidebar');
  const dashSidebarOpen = document.getElementById('dashSidebarOpen');
  const dashSidebarClose = document.getElementById('dashSidebarClose');
  const dashNavBackdrop = document.getElementById('dashNavBackdrop');

  const filterAction = document.getElementById('filterAction');
  const filterEntityType = document.getElementById('filterEntityType');
  const btnResetAuditFilters = document.getElementById('btnResetAuditFilters');
  const btnRefreshAudits = document.getElementById('btnRefreshAudits');

  const auditTableBody = document.getElementById('auditTableBody');
  const auditCountLabel = document.getElementById('auditCountLabel');
  const paginationInfo = document.getElementById('paginationInfo');
  const btnPrevPage = document.getElementById('btnPrevPage');
  const btnNextPage = document.getElementById('btnNextPage');

  const auditDetailModal = document.getElementById('auditDetailModal');
  const auditDetailJson = document.getElementById('auditDetailJson');
  const closeAuditDetailModal = document.getElementById('closeAuditDetailModal');
  const btnDismissAuditDetail = document.getElementById('btnDismissAuditDetail');
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
    setTimeout(() => toast.remove(), 4000);
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
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (_) {
      return isoString;
    }
  }

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
    } catch (_) {
      window.location.href = '../admin/login.html';
      return false;
    }
  }

  async function loadAuditLogs(page = 1) {
    currentPage = page;
    auditTableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
          Loading system audit logs...
        </td>
      </tr>
    `;

    try {
      const params = new URLSearchParams();
      params.set('page', currentPage);
      params.set('limit', pageLimit);

      if (filterAction && filterAction.value) params.set('action', filterAction.value);
      if (filterEntityType && filterEntityType.value) params.set('entityType', filterEntityType.value);

      const response = await fetch(`${getApiUrl('/admin/audit-logs')}?${params.toString()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      });

      if (response.status === 401 || response.status === 403) {
        window.location.href = '../admin/login.html';
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to load audit logs (HTTP ${response.status})`);
      }

      const resJson = await response.json();
      const logs = resJson.data || [];
      const pagination = resJson.pagination || { page: 1, totalPages: 1, total: 0 };

      activeLogs = logs;
      renderAuditTable(logs);
      renderPagination(pagination);
    } catch (err) {
      console.error('Audit log fetch error:', err);
      auditTableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 2.5rem; color: #f87171;">
            Failed to load audit records: ${escapeHtml(err.message)}
          </td>
        </tr>
      `;
    }
  }

  function renderAuditTable(logs) {
    if (!logs || logs.length === 0) {
      auditTableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 3rem; color: var(--text-muted);">
            No audit log entries matching the selected criteria.
          </td>
        </tr>
      `;
      if (auditCountLabel) auditCountLabel.textContent = 'Showing 0 records';
      return;
    }

    if (auditCountLabel) auditCountLabel.textContent = `Showing ${logs.length} records`;

    const rowsHtml = logs.map(a => {
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
          <td style="font-size: 0.78rem; color: var(--text-muted); font-family: monospace;">
            ${escapeHtml(a.ipAddress || '—')}
          </td>
          <td style="text-align: right; font-size: 0.8rem; color: var(--text-muted); white-space: nowrap;">
            ${formatDateTime(a.createdAt)}
          </td>
          <td style="text-align: right; white-space: nowrap;">
            <button type="button" class="btn btn-outline btn-sm btn-inspect-audit" data-id="${a.id}" style="padding: 0.25rem 0.55rem; font-size: 0.75rem;">
              Inspect 🔍
            </button>
          </td>
        </tr>
      `;
    }).join('');

    auditTableBody.innerHTML = rowsHtml;

    document.querySelectorAll('.btn-inspect-audit').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        const log = activeLogs.find(l => l.id === id);
        if (log) {
          auditDetailJson.textContent = JSON.stringify(log, null, 2);
          auditDetailModal.classList.add('active');
          auditDetailModal.setAttribute('aria-hidden', 'false');
        }
      });
    });
  }

  function renderPagination(pagination) {
    if (!pagination) return;
    const { page, totalPages, total } = pagination;
    if (paginationInfo) {
      paginationInfo.textContent = `Page ${page} of ${totalPages || 1} (${total || 0} total records)`;
    }
    if (btnPrevPage) btnPrevPage.disabled = page <= 1;
    if (btnNextPage) btnNextPage.disabled = page >= totalPages;
  }

  function closeModal() {
    if (auditDetailModal) {
      auditDetailModal.classList.remove('active');
      auditDetailModal.setAttribute('aria-hidden', 'true');
    }
  }

  if (closeAuditDetailModal) closeAuditDetailModal.addEventListener('click', closeModal);
  if (btnDismissAuditDetail) btnDismissAuditDetail.addEventListener('click', closeModal);
  if (auditDetailModal) {
    auditDetailModal.addEventListener('click', (e) => {
      if (e.target === auditDetailModal) closeModal();
    });
  }

  if (filterAction) filterAction.addEventListener('change', () => loadAuditLogs(1));
  if (filterEntityType) filterEntityType.addEventListener('change', () => loadAuditLogs(1));

  if (btnResetAuditFilters) {
    btnResetAuditFilters.addEventListener('click', () => {
      if (filterAction) filterAction.value = '';
      if (filterEntityType) filterEntityType.value = '';
      loadAuditLogs(1);
    });
  }

  if (btnRefreshAudits) {
    btnRefreshAudits.addEventListener('click', () => {
      loadAuditLogs(currentPage);
      showToast('Audit records refreshed.');
    });
  }

  if (btnPrevPage) btnPrevPage.addEventListener('click', () => { if (currentPage > 1) loadAuditLogs(currentPage - 1); });
  if (btnNextPage) btnNextPage.addEventListener('click', () => { loadAuditLogs(currentPage + 1); });

  if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener('click', async () => {
      try { await window.TossArenaAuth.logout(); } catch (_) {}
      window.location.href = '../admin/login.html';
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    setupSidebar();
    const authorized = await initAdminAuth();
    if (authorized) {
      await loadAuditLogs(1);
    }
  });

})();
