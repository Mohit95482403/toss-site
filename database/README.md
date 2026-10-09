# Database Architecture & Migration Directory (`database/`)

## Overview
This directory stores database documentation, data dictionary specifications, ER diagrams, and migration instructions for the **TossArena** virtual-credit toss prediction platform.

## Target Database Management System
- **Engine**: MySQL 8.0+
- **Driver**: `mysql2` / `mysql2/promise` (to be installed and configured on Day 2)
- **Charset**: `utf8mb4`
- **Collation**: `utf8mb4_unicode_ci`

## Planned Schema Entities (Day 2 Implementation)
1. **`users`**:
   - `id`: INT AUTO_INCREMENT PRIMARY KEY
   - `username`: VARCHAR(50) UNIQUE NOT NULL
   - `email`: VARCHAR(100) UNIQUE NOT NULL
   - `password_hash`: VARCHAR(255) NOT NULL
   - `role`: ENUM('user', 'admin') DEFAULT 'user'
   - `created_at`, `updated_at`: TIMESTAMP
2. **`wallets`**:
   - `id`: INT AUTO_INCREMENT PRIMARY KEY
   - `user_id`: INT UNIQUE NOT NULL (FK -> users.id)
   - `balance`: DECIMAL(12, 2) DEFAULT 1000.00 (Demo virtual credits granted upon signup)
   - `total_wagered`: DECIMAL(12, 2) DEFAULT 0.00
   - `total_won`: DECIMAL(12, 2) DEFAULT 0.00
   - `updated_at`: TIMESTAMP
3. **`matches`**:
   - `id`: INT AUTO_INCREMENT PRIMARY KEY
   - `team_a`: VARCHAR(100) NOT NULL
   - `team_b`: VARCHAR(100) NOT NULL
   - `tournament`: VARCHAR(100) NOT NULL
   - `match_date`: DATETIME NOT NULL
   - `toss_lock_time`: DATETIME NOT NULL (Cutoff after which no predictions can be submitted)
   - `toss_winner`: VARCHAR(100) NULL (Recorded by admin post-toss)
   - `toss_decision`: ENUM('bat', 'bowl') NULL
   - `status`: ENUM('upcoming', 'locked', 'settled', 'cancelled') DEFAULT 'upcoming'
4. **`predictions`**:
   - `id`: INT AUTO_INCREMENT PRIMARY KEY
   - `user_id`: INT NOT NULL (FK -> users.id)
   - `match_id`: INT NOT NULL (FK -> matches.id)
   - `predicted_team`: VARCHAR(100) NOT NULL
   - `predicted_decision`: ENUM('bat', 'bowl') NULL
   - `credits_staked`: DECIMAL(10, 2) NOT NULL
   - `odds_multiplier`: DECIMAL(4, 2) DEFAULT 1.95
   - `potential_payout`: DECIMAL(10, 2) NOT NULL
   - `status`: ENUM('pending', 'won', 'lost', 'refunded') DEFAULT 'pending'
   - `created_at`: TIMESTAMP
5. **`transactions` (Virtual Credit Ledger)**:
   - `id`: INT AUTO_INCREMENT PRIMARY KEY
   - `user_id`: INT NOT NULL (FK -> users.id)
   - `type`: ENUM('signup_bonus', 'simulated_deposit', 'simulated_withdrawal', 'prediction_stake', 'prediction_win', 'admin_adjustment')
   - `amount`: DECIMAL(12, 2) NOT NULL
   - `balance_after`: DECIMAL(12, 2) NOT NULL
   - `description`: VARCHAR(255) NOT NULL
   - `reference_id`: INT NULL (e.g., prediction_id)
   - `created_at`: TIMESTAMP

## Scope Notice
TossArena is exclusively a demonstration platform using virtual demo credits. Real currency transactions, payment gateway connections, and cashouts are strictly out of scope.
