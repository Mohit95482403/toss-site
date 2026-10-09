-- ============================================================================
-- TossArena Development Seed Data (Safe Demo Records)
-- Environment: Development Testing ONLY
-- Note: Clearly labeled demo matches for schema and query verification.
--       Does NOT contain real live matches, default admin accounts, or passwords.
-- ============================================================================

USE `tossarena`;

-- Insert sample cricket matches explicitly labeled as [DEMO]
-- Safe idempotent insertion using INSERT IGNORE or checking duplicates
INSERT INTO `matches` (
  `id`,
  `title`,
  `team_a`,
  `team_b`,
  `tournament_name`,
  `venue`,
  `scheduled_at`,
  `status`,
  `result_toss_winner`,
  `result_decision`,
  `created_by`
)
SELECT * FROM (
  SELECT
    1 AS `id`,
    '[DEMO] India vs Australia - Champions Trophy Simulation' AS `title`,
    'India' AS `team_a`,
    'Australia' AS `team_b`,
    'Demo International Series' AS `tournament_name`,
    'Melbourne Cricket Ground (Demo)' AS `venue`,
    DATE_ADD(UTC_TIMESTAMP(), INTERVAL 2 DAY) AS `scheduled_at`,
    'open' AS `status`,
    NULL AS `result_toss_winner`,
    NULL AS `result_decision`,
    NULL AS `created_by`
  UNION ALL
  SELECT
    2 AS `id`,
    '[DEMO] England vs South Africa - T20 Exhibition' AS `title`,
    'England' AS `team_a`,
    'South Africa' AS `team_b`,
    'Demo T20 Challenge' AS `tournament_name`,
    'Lord\'s Cricket Ground (Demo)' AS `venue`,
    DATE_ADD(UTC_TIMESTAMP(), INTERVAL 3 DAY) AS `scheduled_at`,
    'upcoming' AS `status`,
    NULL AS `result_toss_winner`,
    NULL AS `result_decision`,
    NULL AS `created_by`
  UNION ALL
  SELECT
    3 AS `id`,
    '[DEMO] Mumbai Warriors vs Chennai Super Kings - League Preview' AS `title`,
    'Mumbai Warriors' AS `team_a`,
    'Chennai Super Kings' AS `team_b`,
    'Demo Premier League' AS `tournament_name`,
    'Wankhede Stadium (Demo)' AS `venue`,
    DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 DAY) AS `scheduled_at`,
    'upcoming' AS `status`,
    NULL AS `result_toss_winner`,
    NULL AS `result_decision`,
    NULL AS `created_by`
) AS tmp
WHERE NOT EXISTS (
  SELECT 1 FROM `matches` WHERE `matches`.`id` = tmp.`id`
);
