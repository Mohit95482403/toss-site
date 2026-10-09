/**
 * TossArena Match Routes
 * Public read-only endpoints for fixtures and schedule.
 */

const express = require('express');
const router = express.Router();
const matchController = require('../controllers/matchController');
const adminResultController = require('../controllers/adminResultController');

router.get('/', matchController.getMatches);
router.get('/tournaments', matchController.getTournaments);
router.get('/:id', matchController.getMatchById);

// Public query for published match toss results (Day 12)
router.get('/:id/result', adminResultController.getPublicMatchResult);

module.exports = router;


