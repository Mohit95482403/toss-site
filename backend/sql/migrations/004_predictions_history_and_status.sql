-- ============================================================================
-- TossArena Migration 004: Prediction History Status & Index Optimizations
-- Extends predictions.status ENUM to include 'void'
-- Adds composite indexes for efficient user history filtering and sorting
-- Forward-only, idempotent, and preserves all existing rows and constraints.
-- ============================================================================

USE `tossarena`;

-- 1. Extend predictions.status ENUM to include 'void' alongside 'cancelled'
ALTER TABLE `predictions`
  MODIFY COLUMN `status` ENUM('pending', 'correct', 'incorrect', 'cancelled', 'void') NOT NULL DEFAULT 'pending';

-- 2. Performance indexes for user history filtering and chronological ordering
-- (Note: MySQL handles multiple indexes safely)
CREATE INDEX `idx_predictions_user_created` ON `predictions` (`user_id`, `created_at`);
CREATE INDEX `idx_predictions_user_status` ON `predictions` (`user_id`, `status`);
CREATE INDEX `idx_predictions_match_created` ON `predictions` (`match_id`, `created_at`);
