-- ============================================================================
-- TossArena Migration 003: Wallet Package Claims Table
-- Implements one-time demo-credit package claim tracking with database-enforced
-- uniqueness and idempotency protections for Day 9 funding simulation.
-- Non-destructive forward-only migration.
-- ============================================================================

USE `tossarena`;

CREATE TABLE IF NOT EXISTS `wallet_package_claims` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT UNSIGNED NOT NULL,
  `wallet_id` INT UNSIGNED NOT NULL,
  `package_id` VARCHAR(50) NOT NULL,
  `demo_credits` DECIMAL(12, 2) NOT NULL,
  `transaction_id` INT UNSIGNED NOT NULL,
  `idempotency_key` VARCHAR(128) NOT NULL,
  `claimed_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_claims_user_id` (`user_id`),
  UNIQUE KEY `uq_claims_idempotency` (`idempotency_key`),
  INDEX `idx_claims_wallet_id` (`wallet_id`),
  INDEX `idx_claims_package_id` (`package_id`),
  CONSTRAINT `fk_claims_user_id`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_claims_wallet_id`
    FOREIGN KEY (`wallet_id`) REFERENCES `wallets` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_claims_transaction_id`
    FOREIGN KEY (`transaction_id`) REFERENCES `wallet_transactions` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
