-- ============================================================================
-- TossArena Database Schema
-- Version: Day 2 Foundation
-- Storage Engine: InnoDB | Charset: utf8mb4 | Collation: utf8mb4_unicode_ci
-- Timezone Policy: All timestamps stored in UTC
-- Note: Strictly virtual demo credits. No real money or payment integrations.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `tossarena`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `tossarena`;

-- ----------------------------------------------------------------------------
-- 1. USERS TABLE
-- Stores participant, player, and administrator credentials and statuses.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `full_name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  `status` ENUM('active', 'suspended', 'banned') NOT NULL DEFAULT 'active',
  `avatar_url` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_login_at` TIMESTAMP NULL DEFAULT NULL,
  UNIQUE KEY `uq_users_email` (`email`),
  INDEX `idx_users_role` (`role`),
  INDEX `idx_users_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. MATCHES TABLE
-- Stores cricket fixtures, schedules, and official toss results.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `matches` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(200) NOT NULL,
  `team_a` VARCHAR(100) NOT NULL,
  `team_b` VARCHAR(100) NOT NULL,
  `tournament_name` VARCHAR(150) NULL,
  `venue` VARCHAR(150) NULL,
  `scheduled_at` DATETIME NOT NULL COMMENT 'UTC scheduled match date and time',
  `status` ENUM('upcoming', 'open', 'locked', 'completed', 'cancelled') NOT NULL DEFAULT 'upcoming',
  `result_toss_winner` VARCHAR(100) NULL,
  `result_decision` ENUM('bat', 'bowl') NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_matches_status` (`status`),
  INDEX `idx_matches_scheduled_at` (`scheduled_at`),
  INDEX `idx_matches_tournament` (`tournament_name`),
  CONSTRAINT `fk_matches_created_by`
    FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. WALLETS TABLE
-- Maintains each user's virtual demo-credit balance (starts with 1,000 credits).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `wallets` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT UNSIGNED NOT NULL,
  `balance` DECIMAL(12, 2) NOT NULL DEFAULT 1000.00,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_wallets_user_id` (`user_id`),
  CONSTRAINT `chk_wallets_balance_non_negative` CHECK (`balance` >= 0),
  CONSTRAINT `fk_wallets_user_id`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. PREDICTIONS TABLE
-- Stores user predictions on coin toss results using virtual demo credits.
-- Unique constraint enforces one prediction per user per match.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `predictions` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT UNSIGNED NOT NULL,
  `match_id` INT UNSIGNED NOT NULL,
  `predicted_toss_winner` VARCHAR(100) NOT NULL,
  `demo_credits_used` DECIMAL(12, 2) NOT NULL,
  `status` ENUM('pending', 'correct', 'incorrect', 'cancelled') NOT NULL DEFAULT 'pending',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_user_match_prediction` (`user_id`, `match_id`),
  INDEX `idx_predictions_user_id` (`user_id`),
  INDEX `idx_predictions_match_id` (`match_id`),
  INDEX `idx_predictions_status` (`status`),
  CONSTRAINT `chk_credits_used_positive` CHECK (`demo_credits_used` > 0),
  CONSTRAINT `fk_predictions_user_id`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_predictions_match_id`
    FOREIGN KEY (`match_id`) REFERENCES `matches` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. WALLET TRANSACTIONS TABLE
-- Complete auditable double-entry ledger for virtual credit changes.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `wallet_transactions` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `wallet_id` INT UNSIGNED NOT NULL,
  `transaction_type` ENUM(
    'demo_grant',
    'prediction_debit',
    'prediction_refund',
    'demo_adjustment',
    'demo_result_credit'
  ) NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL COMMENT 'Positive magnitude of virtual credits transferred',
  `balance_before` DECIMAL(12, 2) NOT NULL,
  `balance_after` DECIMAL(12, 2) NOT NULL,
  `reference_type` VARCHAR(50) NULL COMMENT 'Source entity (e.g., predictions, admin_action)',
  `reference_id` INT UNSIGNED NULL COMMENT 'Source entity identifier',
  `description` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_transactions_wallet_id` (`wallet_id`),
  INDEX `idx_transactions_type` (`transaction_type`),
  INDEX `idx_transactions_created_at` (`created_at`),
  CONSTRAINT `chk_transaction_amount_positive` CHECK (`amount` > 0),
  CONSTRAINT `fk_transactions_wallet_id`
    FOREIGN KEY (`wallet_id`) REFERENCES `wallets` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. NOTIFICATIONS TABLE
-- Stores in-app alerts and notifications for users.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT UNSIGNED NOT NULL,
  `title` VARCHAR(150) NOT NULL,
  `message` TEXT NOT NULL,
  `type` VARCHAR(50) NOT NULL DEFAULT 'system' COMMENT 'e.g., toss_result, wallet_grant, match_reminder',
  `is_read` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `read_at` TIMESTAMP NULL DEFAULT NULL,
  INDEX `idx_notifications_user_lookup` (`user_id`, `is_read`, `created_at`),
  CONSTRAINT `fk_notifications_user_id`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 7. AUDIT LOGS TABLE
-- Retains administrative and security events. Never stores passwords or tokens.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `actor_user_id` INT UNSIGNED NULL,
  `action` VARCHAR(100) NOT NULL,
  `entity_type` VARCHAR(50) NULL,
  `entity_id` INT UNSIGNED NULL,
  `details_json` JSON NULL COMMENT 'Sanitized event metadata, credentials strictly excluded',
  `ip_address` VARCHAR(45) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_audit_actor` (`actor_user_id`),
  INDEX `idx_audit_action` (`action`),
  INDEX `idx_audit_created_at` (`created_at`),
  CONSTRAINT `fk_audit_actor`
    FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
