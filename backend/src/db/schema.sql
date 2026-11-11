-- All timestamps are stored in UTC with millisecond precision.
-- MySQL is the SOURCE OF TRUTH. Redis holds the timing (delayed jobs),
-- Elasticsearch is a rebuildable search index.

CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  google_sub    VARCHAR(64)  NOT NULL,
  email         VARCHAR(320) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  avatar_url    VARCHAR(1024) NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_users_google_sub (google_sub)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS senders (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT UNSIGNED NOT NULL,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(320) NOT NULL,
  smtp_host     VARCHAR(255) NOT NULL,
  smtp_port     INT          NOT NULL,
  smtp_secure   TINYINT(1)   NOT NULL DEFAULT 0,
  smtp_user     VARCHAR(320) NOT NULL,
  smtp_pass_enc TEXT         NOT NULL,           -- AES-256-GCM, never plain text
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_senders_user (user_id),
  CONSTRAINT fk_senders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS campaigns (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id          BIGINT UNSIGNED NOT NULL,
  subject          VARCHAR(998) NOT NULL,          -- RFC 5322 line limit
  body             MEDIUMTEXT   NOT NULL,
  start_at         DATETIME(3)  NOT NULL,
  delay_ms         INT UNSIGNED NOT NULL,
  hourly_limit     INT UNSIGNED NOT NULL,
  total            INT UNSIGNED NOT NULL,
  idempotency_key  VARCHAR(128) NULL,              -- protects against double-click "Schedule"
  created_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_campaign_idem (user_id, idempotency_key),
  CONSTRAINT fk_campaigns_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- status lifecycle:
--   scheduled -> sending -> sent
--                        -> failed     (permanent SMTP error / retries exhausted)
--                        -> uncertain  (crash or timeout AFTER handing the message to SMTP;
--                                       we never auto-resend these = at-most-once delivery)
CREATE TABLE IF NOT EXISTS emails (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  campaign_id     BIGINT UNSIGNED NOT NULL,
  user_id         BIGINT UNSIGNED NOT NULL,
  sender_id       BIGINT UNSIGNED NOT NULL,
  seq             INT UNSIGNED NOT NULL,           -- position in the campaign, used to preserve order
  to_email        VARCHAR(320) NOT NULL,
  subject         VARCHAR(998) NOT NULL,
  status          ENUM('scheduled','sending','sent','failed','uncertain') NOT NULL DEFAULT 'scheduled',
  send_at         DATETIME(3)  NOT NULL,           -- current planned time (moves forward when deferred)
  sent_at         DATETIME(3)  NULL,
  attempts        INT UNSIGNED NOT NULL DEFAULT 0,
  deferred_count  INT UNSIGNED NOT NULL DEFAULT 0, -- times pushed to a later hour by the rate limiter
  last_error      VARCHAR(1024) NULL,
  message_id      VARCHAR(255) NULL,
  preview_url     VARCHAR(1024) NULL,              -- Ethereal preview link
  locked_at       DATETIME(3)  NULL,               -- when status became 'sending'
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_email_per_campaign (campaign_id, to_email),   -- same lead never twice in one campaign
  KEY idx_emails_user_status_send (user_id, status, send_at),
  KEY idx_emails_status_send (status, send_at),
  CONSTRAINT fk_emails_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_emails_sender   FOREIGN KEY (sender_id)   REFERENCES senders(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS slack_integrations (
  user_id       BIGINT UNSIGNED PRIMARY KEY,
  team_name     VARCHAR(255) NULL,
  channel       VARCHAR(255) NULL,
  webhook_enc   TEXT NOT NULL,                     -- encrypted incoming-webhook URL
  connected_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_slack_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
