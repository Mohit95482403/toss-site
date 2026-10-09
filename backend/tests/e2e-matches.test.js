/**
 * TossArena Day 6: End-to-End Match Explorer & Details Verification Test
 * Tests API responses and static frontend file serving across port 5000 and 5500.
 */

const http = require('http');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    }).on('error', reject);
  });
}

async function runE2eChecks() {
  console.log('\n======================================================');
  console.log('   TossArena Day 6: E2E Match & Details Verification');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(desc, condition) {
    if (condition) {
      console.log(`• ${desc} ... ✔ PASSED`);
      passed++;
    } else {
      console.error(`• ${desc} ... ❌ FAILED`);
      failed++;
    }
  }

  try {
    // 1. Verify frontend matches.html served
    const matchesPage = await get('http://localhost:5500/pages/matches.html');
    assert('Frontend matches.html is served (200 OK)', matchesPage.status === 200);
    assert('matches.html contains Explore Cricket Matches heading', matchesPage.body.includes('Explore Cricket Matches'));
    assert('matches.html contains searchClearBtn', matchesPage.body.includes('id="clearSearchBtn"'));
    assert('matches.html contains tournamentFilterSelect', matchesPage.body.includes('id="tournamentFilterSelect"'));
    assert('matches.html contains pagination controls', matchesPage.body.includes('id="paginationContainer"'));

    // 2. Verify frontend match-details.html served
    const detailsPage = await get('http://localhost:5500/pages/match-details.html?id=1');
    assert('Frontend match-details.html is served (200 OK)', detailsPage.status === 200);
    assert('match-details.html contains Breadcrumbs', detailsPage.body.includes('breadcrumbMatchTitle'));
    assert('match-details.html loads match-details.js', detailsPage.body.includes('match-details.js'));

    // 3. Verify backend matches API
    const apiRes = await get('http://localhost:5000/api/matches');
    assert('Backend GET /api/matches returns 200 OK', apiRes.status === 200);
    const apiJson = JSON.parse(apiRes.body);
    assert('API response has success: true', apiJson.success === true);
    assert('API response returns matches array', Array.isArray(apiJson.data));
    assert('API response includes pagination metadata', apiJson.pagination && typeof apiJson.pagination.total === 'number');

    // 4. Verify backend tournaments API
    const tourRes = await get('http://localhost:5000/api/matches/tournaments');
    assert('Backend GET /api/matches/tournaments returns 200 OK', tourRes.status === 200);
    const tourJson = JSON.parse(tourRes.body);
    assert('Tournaments endpoint returns array', Array.isArray(tourJson.data) && tourJson.data.length > 0);

    // 5. Verify single match detail API
    const matchId = apiJson.data[0].id;
    const singleRes = await get(`http://localhost:5000/api/matches/${matchId}`);
    assert(`Backend GET /api/matches/${matchId} returns 200 OK`, singleRes.status === 200);
    const singleJson = JSON.parse(singleRes.body);
    assert('Single match data contains teams and venue', singleJson.data.team_a && singleJson.data.team_b && singleJson.data.venue);

    // 6. Verify 404 for nonexistent ID
    const notFoundRes = await get('http://localhost:5000/api/matches/999999');
    assert('Backend GET /api/matches/999999 returns 404', notFoundRes.status === 404);

    // 7. Verify 400 for malformed ID
    const badIdRes = await get('http://localhost:5000/api/matches/invalid-id');
    assert('Backend GET /api/matches/invalid-id returns 400 Bad Request', badIdRes.status === 400);

    // 8. Verify homepage and dashboard files contain match-details links
    const homeRes = await get('http://localhost:5500/index.html');
    assert('Homepage index.html is served (200 OK)', homeRes.status === 200);

    const mainJsRes = await get('http://localhost:5500/assets/js/main.js');
    assert('main.js links to match-details.html?id=', mainJsRes.body.includes('pages/match-details.html?id='));

    const dashJsRes = await get('http://localhost:5500/assets/js/dashboard.js');
    assert('dashboard.js links to match-details.html?id=', dashJsRes.body.includes('pages/match-details.html?id='));

  } catch (err) {
    console.error('E2E Verification Error:', err);
    failed++;
  }

  console.log('\n======================================================');
  console.log(` E2E Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) process.exit(1);
}

runE2eChecks();
