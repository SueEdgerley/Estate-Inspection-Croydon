-- NV / issue routing: map issue_category (and optional issue_type / estate) to role or person.

CREATE TABLE issue_routing_rules (
  id VARCHAR(255) PRIMARY KEY,
  issue_category VARCHAR(100) NOT NULL,
  issue_type VARCHAR(100),
  estate_id VARCHAR(255),
  assign_to_role VARCHAR(100),
  assign_to_person_id VARCHAR(255),
  email_required BOOLEAN NOT NULL DEFAULT true,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX issue_routing_rules_category_active_idx ON issue_routing_rules (issue_category, active);

-- Default rules: assign_to_role must match people.role in your database.
INSERT INTO issue_routing_rules (id, issue_category, issue_type, assign_to_role, email_required, active) VALUES
  ('irr_cleaning', 'cleaning', NULL, 'Cleaning', true, true),
  ('irr_repairs', 'repairs', NULL, 'Repairs', true, true),
  ('irr_lighting', 'lighting', NULL, 'Repairs', true, true),
  ('irr_grounds', 'grounds_maintenance', NULL, 'Grounds Maintenance', true, true),
  ('irr_windows', 'window_cleaning', NULL, 'Cleaning', true, true),
  ('irr_tenancy', 'tenancy_management', NULL, 'Housing Officer', true, true),
  ('irr_parking_vehicle', 'parking_abandoned_vehicle', NULL, 'Housing Officer', true, true);
