-- Sequential user-facing issue numbers (ISS-000123). Nullable so voided
-- [FALSE_AUTO_ACTION] rows can remain unnumbered. Default is applied after
-- historical backfill so genuine existing rows receive 1..N in created_at order.

CREATE SEQUENCE IF NOT EXISTS actions_issue_number_seq;

ALTER TABLE actions ADD COLUMN IF NOT EXISTS issue_number INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS actions_issue_number_key ON actions (issue_number);
