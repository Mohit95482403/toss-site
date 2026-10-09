/**
 * Automated Health & Endpoint Verification Test for TossArena Backend
 * Uses Node.js native http and assert modules without heavy testing dependencies.
 */

const assert = require('assert');
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { ALLOWED_ORIGINS } = require('../config/env');
const { closePool } = require('../config/db');
const apiRoutes = require('../routes/api.routes');
const healthController = require('../controllers/health.controller');
const notFoundHandler = require('../middleware/notFound.middleware');
const errorHandler = require('../middleware/error.middleware');

// Build an isolated test app instance
const app = express();
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get('/', healthController.getRootStatus);
app.use('/api', apiRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

const testServer = http.createServer(app);

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const port = testServer.address().port;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: port,
        path: path,
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(rawData);
          } catch (e) {
            parsed = rawData;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsed
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting TossArena Backend & Database Verification Tests ---');

  await new Promise((resolve) => {
    testServer.listen(0, '127.0.0.1', resolve);
  });

  try {
    // Test 1: GET /api/health returns 200
    console.log('Testing GET /api/health...');
    const healthRes = await makeRequest('/api/health');
    assert.strictEqual(healthRes.statusCode, 200, 'Health endpoint should return HTTP 200');
    assert.strictEqual(healthRes.body.success, true, 'Health response should indicate success: true');
    assert.strictEqual(healthRes.body.message, 'TossArena API is running', 'Health message match');
    assert(healthRes.body.timestamp, 'Health response should have timestamp');
    console.log('✔ Test 1 Passed: GET /api/health returned 200 with valid payload');

    // Test 2: GET / returns 200
    console.log('Testing GET / ...');
    const rootRes = await makeRequest('/');
    assert.strictEqual(rootRes.statusCode, 200, 'Root endpoint should return HTTP 200');
    assert.strictEqual(rootRes.body.service, 'TossArena API', 'Root service name match');
    console.log('✔ Test 2 Passed: GET / returned 200 with service info');

    // Test 3: GET unknown route returns 404
    console.log('Testing GET /api/unknown-endpoint (404 check)...');
    const notFoundRes = await makeRequest('/api/unknown-endpoint');
    assert.strictEqual(notFoundRes.statusCode, 404, 'Unknown endpoint should return HTTP 404');
    assert.strictEqual(notFoundRes.body.success, false, '404 response should indicate success: false');
    console.log('✔ Test 3 Passed: 404 handler works as expected');

    // Test 4: GET /api/health/db returns structured database status without leaking secrets
    console.log('Testing GET /api/health/db ...');
    const dbHealthRes = await makeRequest('/api/health/db');
    assert([200, 503].includes(dbHealthRes.statusCode), 'DB Health should return 200 or 503');
    assert(typeof dbHealthRes.body === 'object', 'DB Health response should be JSON');
    assert('database' in dbHealthRes.body, 'DB Health should include database status property');
    assert(!JSON.stringify(dbHealthRes.body).includes('password'), 'DB Health must never leak password');
    console.log(`✔ Test 4 Passed: GET /api/health/db returned HTTP ${dbHealthRes.statusCode} (${dbHealthRes.body.database})`);

    console.log('\nAll backend verification checks PASSED successfully!');
  } finally {
    testServer.close();
    try {
      await closePool();
    } catch (e) {
      // Ignore pool close error
    }
  }
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
