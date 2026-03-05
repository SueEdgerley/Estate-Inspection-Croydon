-- Optional: link User (login) to Person (people) via users.people_id -> people.id (nullable)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'people_id'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'person_id'
    ) THEN
      ALTER TABLE "users" RENAME COLUMN "person_id" TO "people_id";
    ELSE
      ALTER TABLE "users" ADD COLUMN "people_id" VARCHAR(255) REFERENCES "people"("id") ON DELETE SET NULL;
    END IF;
  END IF;
END $$;
DROP INDEX IF EXISTS "users_person_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "users_people_id_key" ON "users"("people_id");
