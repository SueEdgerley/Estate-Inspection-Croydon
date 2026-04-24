-- Block locations: optional outward/inward postcode (UK-style), used for import and display.
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS postcode VARCHAR(20);
