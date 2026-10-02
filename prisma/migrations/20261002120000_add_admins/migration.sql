-- CreateTable: 관리자 계정 (가입 API 없음, CLI로 생성)
CREATE TABLE `admins` (
  `id`                 VARCHAR(255) NOT NULL,
  `email`              VARCHAR(255) NOT NULL,
  `password_hash`      VARCHAR(255) NOT NULL,
  `name`               VARCHAR(100) NULL,
  `is_active`          TINYINT(1)   NOT NULL DEFAULT 1,
  `login_count`        INT          NOT NULL DEFAULT 0,
  `login_locked_until` DATETIME     NULL,
  `last_login_at`      DATETIME     NULL,
  `created_at`         TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_admin_email` (`email`)
);

-- CreateTable: 관리자 refresh 토큰 (customer_refresh_tokens와 같은 구조)
CREATE TABLE `admin_refresh_tokens` (
  `id`         INT          NOT NULL AUTO_INCREMENT,
  `admin_id`   VARCHAR(255) NOT NULL,
  `token`      VARCHAR(500) NOT NULL,
  `expires_at` TIMESTAMP    NOT NULL,
  `created_at` TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_admin` (`admin_id`),
  KEY `idx_expires_at` (`expires_at`),
  KEY `idx_token` (`token`(255)),
  CONSTRAINT `admin_refresh_tokens_ibfk_1` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`) ON DELETE CASCADE
);
