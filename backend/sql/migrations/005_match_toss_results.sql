-- ============================================================================
-- TossArena Migration 005: Match Toss Result Metadata
-- Adds audit and publication tracking fields for verified toss results
-- Forward-only, non-destructive migration.
-- ============================================================================

USE `tossarena`;

ALTER TABLE `matches`
  ADD COLUMN `result_published_at` DATETIME NULL COMMENT 'UTC timestamp when toss result was officially published by administrator',
  ADD COLUMN `result_published_by` INT UNSIGNED NULL COMMENT 'Admin user ID who published verified toss result',
  ADD COLUMN `result_source_note` VARCHAR(255) NULL COMMENT 'Administrative audit reference or official broadcast source',
  ADD CONSTRAINT `fk_matches_result_published_by`
    FOREIGN KEY (`result_published_by`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `idx_matches_result_published_at` ON `matches` (`result_published_at`);
