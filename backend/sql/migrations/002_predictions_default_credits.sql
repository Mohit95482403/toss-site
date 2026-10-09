-- ============================================================================
-- TossArena Migration 002: Predictions Default Demo Credits
-- Adjusts demo_credits_used to default to 0.00 with non-negative constraint
-- Allows Day 7 prediction submission without forced debit before Day 8 wallet integration.
-- Forward-only, preserves existing structure and constraints.
-- ============================================================================

USE `tossarena`;

ALTER TABLE `predictions`
  DROP CONSTRAINT IF EXISTS `chk_credits_used_positive`;

ALTER TABLE `predictions`
  MODIFY COLUMN `demo_credits_used` DECIMAL(12, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE `predictions`
  ADD CONSTRAINT `chk_credits_used_non_negative` CHECK (`demo_credits_used` >= 0);
