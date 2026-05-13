-- Repair drift where outbound_emails was missing despite being present in older schema history.
-- Keep this idempotent so it is safe for databases that already have the Phase 1 table.
CREATE TABLE IF NOT EXISTS outbound_emails (
  id VARCHAR(255) PRIMARY KEY,
  inspection_id VARCHAR(255) NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  action_id VARCHAR(255) REFERENCES actions(id) ON DELETE SET NULL,
  question_id VARCHAR(255),
  email_to VARCHAR(500) NOT NULL,
  recipient_email VARCHAR(500),
  subject TEXT,
  provider VARCHAR(100),
  provider_message_id VARCHAR(255),
  email_routing VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE outbound_emails ADD COLUMN IF NOT EXISTS action_id VARCHAR(255);
ALTER TABLE outbound_emails ADD COLUMN IF NOT EXISTS question_id VARCHAR(255);
ALTER TABLE outbound_emails ADD COLUMN IF NOT EXISTS email_to VARCHAR(500);
ALTER TABLE outbound_emails ADD COLUMN IF NOT EXISTS recipient_email VARCHAR(500);
ALTER TABLE outbound_emails ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE outbound_emails ADD COLUMN IF NOT EXISTS provider VARCHAR(100);
ALTER TABLE outbound_emails ADD COLUMN IF NOT EXISTS provider_message_id VARCHAR(255);
ALTER TABLE outbound_emails ADD COLUMN IF NOT EXISTS email_routing VARCHAR(255);
ALTER TABLE outbound_emails ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE outbound_emails ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE outbound_emails ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE outbound_emails ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

UPDATE outbound_emails
SET recipient_email = COALESCE(recipient_email, email_to)
WHERE recipient_email IS NULL;

UPDATE outbound_emails
SET status = 'pending'
WHERE status IS NULL;

ALTER TABLE outbound_emails ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE outbound_emails ALTER COLUMN status SET NOT NULL;

CREATE INDEX IF NOT EXISTS outbound_emails_inspection_id_idx ON outbound_emails(inspection_id);
CREATE INDEX IF NOT EXISTS outbound_emails_status_idx ON outbound_emails(status);
CREATE INDEX IF NOT EXISTS outbound_emails_created_at_idx ON outbound_emails(created_at);
