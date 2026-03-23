-- Phase 2: Resolved routing fields on inspection_answers for reporting stability
ALTER TABLE inspection_answers ADD COLUMN IF NOT EXISTS triggers_task BOOLEAN;
ALTER TABLE inspection_answers ADD COLUMN IF NOT EXISTS triggers_email BOOLEAN;
ALTER TABLE inspection_answers ADD COLUMN IF NOT EXISTS email_route_team_id VARCHAR(255);
ALTER TABLE inspection_answers ADD COLUMN IF NOT EXISTS issue_type VARCHAR(100);
ALTER TABLE inspection_answers ADD COLUMN IF NOT EXISTS programme_tag VARCHAR(255);
