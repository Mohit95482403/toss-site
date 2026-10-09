/**
 * TossArena Admin Dashboard Controller
 * Request handlers for executive dashboard metrics, audit log monitoring, and administrative user controls.
 */

const adminDashboardService = require('../services/adminDashboardService');

/**
 * GET /api/admin/dashboard/overview
 * Returns executive overview statistics for admin dashboard cards and charts
 */
async function getDashboardOverview(req, res, next) {
  try {
    const overview = await adminDashboardService.getAdminDashboardOverview();
    return res.status(200).json({
      success: true,
      data: overview
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/admin/audit-logs
 * Returns paginated, filtered audit logs
 */
async function getAuditLogs(req, res, next) {
  try {
    const { page, limit, action, entityType } = req.query;
    const result = await adminDashboardService.getAuditLogs({ page, limit, action, entityType });
    return res.status(200).json({
      success: true,
      data: result.logs,
      pagination: result.pagination
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/admin/users
 * Returns paginated user listing for administrative inspection
 */
async function getAdminUsers(req, res, next) {
  try {
    const { page, limit, search, role, status } = req.query;
    const result = await adminDashboardService.getAdminUsers({ page, limit, search, role, status });
    return res.status(200).json({
      success: true,
      data: result.users,
      pagination: result.pagination
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getDashboardOverview,
  getAuditLogs,
  getAdminUsers
};
