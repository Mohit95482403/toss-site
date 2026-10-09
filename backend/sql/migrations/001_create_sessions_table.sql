-- ============================================================================
-- TossArena Migration 001: Sessions Table
-- Creates the session persistence table for express-mysql-session.
-- Non-destructive idempotent table creation.
-- ============================================================================

USE `tossarena`;

CREATE TABLE IF NOT EXISTS `sessions` (
  `session_id` VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  `expires` INT(11) UNSIGNED NOT NULL,
  `data` MEDIUMTEXT COLLATE utf8mb4_bin,
  PRIMARY KEY (`session_id`),
  INDEX `idx_sessions_expires` (`expires`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
