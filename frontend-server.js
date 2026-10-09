/**
 * High-performance, concurrent static file server for TossArena frontend
 * Built with native Node.js http, fs, and path modules.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5500;
const FRONTEND_DIR = path.resolve(__dirname, 'frontend');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  try {
    const rawUrl = req.url.split('?')[0];
    let safeRel = decodeURIComponent(rawUrl).replace(/^[\\\/]+/, '');
    if (!safeRel) safeRel = 'index.html';
    safeRel = path.normalize(safeRel).replace(/^(\.\.[\/\\])+/, '');

    const normalizedRel = safeRel.replace(/\\/g, '/');

    // Route aliases for clean URLs
    if (normalizedRel === 'predictions' || normalizedRel === 'predictions.html') {
      safeRel = path.join('user', 'predictions.html');
    } else if (normalizedRel === 'dashboard' || normalizedRel === 'dashboard/statistics') {
      safeRel = path.join('user', 'dashboard.html');
    } else if (normalizedRel === 'wallet') {
      safeRel = path.join('user', 'wallet.html');
    } else if (normalizedRel === 'profile') {
      safeRel = path.join('user', 'profile.html');
    } else if (normalizedRel === 'matches') {
      safeRel = path.join('pages', 'matches.html');
    } else if (normalizedRel === 'login' || normalizedRel === 'login.html') {
      safeRel = path.join('pages', 'login.html');
    } else if (normalizedRel === 'register' || normalizedRel === 'register.html') {
      safeRel = path.join('pages', 'register.html');
    } else if (normalizedRel === 'admin/dashboard' || normalizedRel === 'admin/dashboard.html') {
      safeRel = path.join('admin', 'dashboard.html');
    } else if (normalizedRel === 'admin/matches' || normalizedRel === 'admin/matches.html') {
      safeRel = path.join('admin', 'matches.html');
    } else if (normalizedRel === 'admin/results' || normalizedRel === 'admin/results.html') {
      safeRel = path.join('admin', 'results.html');
    } else if (normalizedRel === 'admin/audit-logs' || normalizedRel === 'admin/audit-logs.html') {
      safeRel = path.join('admin', 'audit-logs.html');
    } else if (normalizedRel === 'admin/users' || normalizedRel === 'admin/users.html') {
      safeRel = path.join('admin', 'users.html');
    } else if (normalizedRel === 'admin' || normalizedRel === 'admin/login') {
      safeRel = path.join('admin', 'login.html');
    }

    const filePath = path.resolve(FRONTEND_DIR, safeRel);

    if (!filePath.startsWith(FRONTEND_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Forbidden');
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`<h1>404 Not Found</h1><p>${safeRel} not found</p>`);
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      res.end(data);
    });
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server Error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`TossArena Static Server running at http://localhost:${PORT}/`);
});
