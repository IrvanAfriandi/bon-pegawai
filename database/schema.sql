-- ══════════════════════════════════════════════════════════════
--  BON REQUEST SYSTEM — MySQL Database Schema
--  Untuk XAMPP / Local MySQL
-- ══════════════════════════════════════════════════════════════

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "+07:00";

-- ── Database ───────────────────────────────────────────────
CREATE DATABASE IF NOT EXISTS `bon_system` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `bon_system`;

-- ── Tabel Users ─────────────────────────────────────────────
CREATE TABLE `users` (
  `id`         INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `username`   VARCHAR(50)     NOT NULL,
  `password`   VARCHAR(255)    NOT NULL COMMENT 'bcrypt hash',
  `role`       ENUM('admin','pegawai','ppk','kalapas','bendahara') NOT NULL DEFAULT 'pegawai',
  `created_at` TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Tabel Pegawai (Daftar Nama + NIP) ─────────────────────
CREATE TABLE `pegawai` (
  `id`         INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `nama`       VARCHAR(100)    NOT NULL,
  `nip`        VARCHAR(30)     NOT NULL,
  `created_at` TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_nip` (`nip`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Tabel Bon Header ───────────────────────────────────────
CREATE TABLE `bon` (
  `id`               INT UNSIGNED       NOT NULL AUTO_INCREMENT,
  `applicant_name`   VARCHAR(100)       NOT NULL,
  `applicant_nip`    VARCHAR(30)       DEFAULT ''          COMMENT 'NIP bisa kosong',
  `total_amount`     DECIMAL(15,2)     NOT NULL DEFAULT 0,
  `status`           ENUM('submitted','approved_ppk','approved_kalapas','disbursed','completed','rejected')
                                       NOT NULL DEFAULT 'submitted',
  `rejection_reason` TEXT              DEFAULT NULL        COMMENT 'Alasan penolakan',
  `rejected_by`      ENUM('ppk','kalapas') DEFAULT NULL   COMMENT 'Penolak',
  `lpj_description`  TEXT              DEFAULT NULL,
  `lpj_file`         VARCHAR(255)      DEFAULT NULL,
  `created_at`       TIMESTAMP         DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP         DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Tabel Bon Items ─────────────────────────────────────────
CREATE TABLE `bon_items` (
  `id`         INT UNSIGNED       NOT NULL AUTO_INCREMENT,
  `bon_id`     INT UNSIGNED       NOT NULL,
  `name`       VARCHAR(200)       NOT NULL,
  `amount`     DECIMAL(15,2)      NOT NULL,
  `purpose`    TEXT               NOT NULL,
  `created_at` TIMESTAMP          DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_bon_id` (`bon_id`),
  CONSTRAINT `fk_bon_items_bon` FOREIGN KEY (`bon_id`) REFERENCES `bon`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Alter untuk menambahkan kolom rejected_by (jika sudah ada tabel) ──
ALTER TABLE `bon` ADD COLUMN IF NOT EXISTS `rejected_by` ENUM('ppk','kalapas') DEFAULT NULL AFTER `rejection_reason`;

-- ══════════════════════════════════════════════════════════
--  SEED DATA — Default Users
-- ══════════════════════════════════════════════════════════
INSERT INTO `users` (`username`, `password`, `role`) VALUES
-- Password hashes (bcrypt cost 10)
('admin',      '$2y$10$5tN5hrCJSGEhw1IXQXmqmuvK7IYX3G0mfAPDbk45.Zh6kQsfUpSWi', 'admin'),
('pegawai1',   '$2y$10$8iGUYHwwy8xmK7c9EHsf8.4caf.yVLXqsZ6W/DDmPp3TdmbtPdTlG', 'pegawai'),
('ppk1',       '$2y$10$yr4YJiDGI/3s0mH7xicIpeWX/kSmO7ZPWE3UEou4rlV0wTUWuiaAa', 'ppk'),
('kalapas1',   '$2y$10$KRjzmz2cogKFGxLNtQ3X/eg2NWk.G24GRwL0ydAlF33A5ySlZudbC', 'kalapas'),
('bendahara1', '$2y$10$fLEVPCYP83j/6KIzj4o8F.rDKmX4M7qjzGV.NCGbeN7TaNJnC4E7O', 'bendahara');

-- Password bcrypt yang benar untuk "admin123" (cost 10):
-- UPDATE users SET password = '$2y$10$8K1p/a0dL1LXMIgoEDFrwOfMQgZL5H4RBPyFDlxDkNMJL4V9W9oHy' WHERE username = 'admin';

COMMIT;
