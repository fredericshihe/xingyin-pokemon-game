-- Minimal dependencies for running the bank migration in an isolated database.
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF; END $$;
CREATE TABLE users (
  id UUID PRIMARY KEY,
  role TEXT NOT NULL,
  gold INT NOT NULL,
  plain_password TEXT
);
CREATE TABLE gold_logs (
  student_id UUID NOT NULL REFERENCES users(id),
  amount INT NOT NULL,
  reason TEXT,
  balance_after INT NOT NULL
);
CREATE FUNCTION settle_student_playtime_session(p_student_id UUID, p_session_id TEXT, p_action TEXT)
RETURNS TABLE(remaining_seconds INT) LANGUAGE sql AS $$ SELECT 3600 $$;
CREATE FUNCTION student_playtime_lease_is_valid(p_student_id UUID, p_session_id TEXT, p_allow_recent_end BOOLEAN)
RETURNS BOOLEAN LANGUAGE sql AS $$ SELECT p_session_id = 'test-session-123456' $$;
