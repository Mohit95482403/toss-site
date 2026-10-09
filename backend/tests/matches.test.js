/**
 * TossArena Day 6 Match Browsing & Details Automated Tests
 * Tests pagination, search, status/tournament filters, sorting, ID validation, and SQL injection safety.
 */

const assert = require('assert');
const { app } = require('../server');
const { pool } = require('../config/db');

let serverInstance;
let baseUrl;

async function request(path) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  let body = null;
  try {
    body = await response.json();
  } catch (_) {}

  return {
    status: response.status,
    headers: response.headers,
    body
  };
}

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('   TossArena Day 6: Match Browsing & Details Tests');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      process.stdout.write(`• ${name} ... `);
      await fn();
      console.log('✔ PASSED');
      passed++;
    } catch (err) {
      console.log(`✖ FAILED: ${err.message}`);
      if (err.stack) {
        console.error('  ' + err.stack.split('\n').slice(1, 3).join('\n  '));
      }
      failed++;
    }
  }

  await new Promise((resolve) => {
    serverInstance = app.listen(0, () => {
      const port = serverInstance.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  try {
    // ----------------------------------------------------
    // 1. Listing Matches & Pagination Contract
    // ----------------------------------------------------
    await test('GET /api/matches returns 200 with data array and pagination metadata', async () => {
      const res = await request('/api/matches');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.pagination);
      assert.strictEqual(typeof res.body.pagination.page, 'number');
      assert.strictEqual(typeof res.body.pagination.limit, 'number');
      assert.strictEqual(typeof res.body.pagination.total, 'number');
      assert.strictEqual(typeof res.body.pagination.totalPages, 'number');
      assert.ok(res.body.data.length >= 3, 'Should return at least the 3 seeded matches');
    });

    await test('Pagination: limit parameter bounds results and calculates totalPages', async () => {
      const res = await request('/api/matches?page=1&limit=2');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.length, 2);
      assert.strictEqual(res.body.pagination.page, 1);
      assert.strictEqual(res.body.pagination.limit, 2);
      assert.ok(res.body.pagination.totalPages >= 2);
    });

    await test('Pagination: invalid/negative page falls back safely to page 1', async () => {
      const res = await request('/api/matches?page=-5&limit=10');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.pagination.page, 1);
    });

    await test('Pagination: excessive limit is capped at 50 max', async () => {
      const res = await request('/api/matches?limit=999');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.pagination.limit, 50);
    });

    // ----------------------------------------------------
    // 2. Search Parameters
    // ----------------------------------------------------
    await test('Search by team name returns matching fixtures', async () => {
      const res = await request('/api/matches?search=India');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.length >= 1);
      const match = res.body.data[0];
      assert.ok(match.team_a.includes('India') || match.team_b.includes('India'));
    });

    await test('Search by tournament name returns matching fixtures', async () => {
      const res = await request('/api/matches?search=International+Series');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.length >= 1);
      assert.ok(res.body.data[0].tournament_name.includes('International Series'));
    });


    await test('Search with no matching terms returns empty array with total = 0', async () => {
      const res = await request('/api/matches?search=NonexistentCricketTeamXYZ999');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.length, 0);
      assert.strictEqual(res.body.pagination.total, 0);
      assert.strictEqual(res.body.pagination.totalPages, 0);
    });

    await test('SQL injection in search parameter is safely parameterized and handled', async () => {
      const res = await request("/api/matches?search=' OR '1'='1");
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.length, 0, 'Must not return all rows or cause SQL syntax error');
    });

    // ----------------------------------------------------
    // 3. Status and Tournament Filters
    // ----------------------------------------------------
    await test('Filter by valid status (open) returns only open matches', async () => {
      const res = await request('/api/matches?status=open');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.length >= 1);
      res.body.data.forEach((m) => {
        assert.strictEqual(m.status, 'open');
      });
    });

    await test('Filter by valid status (upcoming) returns only upcoming matches', async () => {
      const res = await request('/api/matches?status=upcoming');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.length >= 1);
      res.body.data.forEach((m) => {
        assert.strictEqual(m.status, 'upcoming');
      });
    });

    await test('Filter by tournament name returns only matches in that tournament', async () => {
      const res = await request('/api/matches?tournament=Demo+T20+Challenge');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.length >= 1);
      res.body.data.forEach((m) => {
        assert.strictEqual(m.tournament_name, 'Demo T20 Challenge');
      });
    });

    await test('Combining search and status filters works accurately', async () => {
      const res = await request('/api/matches?search=England&status=upcoming');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.length >= 1);
      assert.strictEqual(res.body.data[0].status, 'upcoming');
      assert.ok(res.body.data[0].team_a.includes('England') || res.body.data[0].team_b.includes('England'));
    });

    // ----------------------------------------------------
    // 4. Sorting Allowlist
    // ----------------------------------------------------
    await test('Sort allowlist: invalid sort parameter safely falls back to date_asc', async () => {
      const res = await request('/api/matches?sort=malicious_col;DROP+TABLE');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.length >= 1);
    });

    await test('Sort allowlist: teams_asc sorts by team_a alphabetically', async () => {
      const res = await request('/api/matches?sort=teams_asc');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.length >= 2);
      assert.ok(res.body.data[0].team_a <= res.body.data[1].team_a);
    });

    // ----------------------------------------------------
    // 5. Distinct Tournaments Endpoint
    // ----------------------------------------------------
    await test('GET /api/matches/tournaments returns distinct tournament list', async () => {
      const res = await request('/api/matches/tournaments');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.includes('Demo International Series'));
      assert.ok(res.body.data.includes('Demo T20 Challenge'));
    });

    // ----------------------------------------------------
    // 6. Match Details Endpoint
    // ----------------------------------------------------
    await test('GET /api/matches/:id returns match details for existing match', async () => {
      const res = await request('/api/matches/1');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.id, 1);
      assert.ok(res.body.data.team_a);
      assert.ok(res.body.data.team_b);
      assert.ok(res.body.data.scheduled_at);
      assert.ok(res.body.data.status);
    });

    await test('GET /api/matches/:id returns 404 for nonexistent match ID', async () => {
      const res = await request('/api/matches/999999');
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('not found'));
    });

    await test('GET /api/matches/:id rejects non-numeric or malformed ID with 400', async () => {
      const res = await request('/api/matches/invalid_id');
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('Invalid match ID'));
    });

    await test('GET /api/matches/:id rejects negative or zero ID with 400', async () => {
      const res = await request('/api/matches/0');
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

  } finally {
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
  }

  console.log('\n======================================================');
  console.log(` Match Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
