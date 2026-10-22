-- ============================================================================
-- C-DAC Feedback Portal: PostgreSQL 16 Production Schema
-- Compatible with CERT-In 180-day logging, DPDP Act 2023, and OWASP ASVS L2
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------- Reference Data
CREATE TABLE IF NOT EXISTS public.centres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (btrim(name) <> ''),
  kind TEXT NOT NULL CHECK (kind IN ('cdac', 'atc')),
  parent_id UUID REFERENCES public.centres(id),
  CHECK (kind = 'cdac' OR parent_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (btrim(code) <> ''),
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id),
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  short_name TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (course_id, name)
);

CREATE TABLE IF NOT EXISTS public.batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL UNIQUE CHECK (btrim(label) <> ''),
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.faculty (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  centre_id UUID REFERENCES public.centres(id), -- NULL = shared across centres
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  active BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS faculty_name_ci ON public.faculty (lower(btrim(name)));

-- ---------------------------------------------------------------- Rosters
CREATE TABLE IF NOT EXISTS public.staff_roster (
  email CITEXT PRIMARY KEY CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name TEXT NOT NULL CHECK (btrim(full_name) <> ''),
  role TEXT NOT NULL CHECK (role IN ('cc', 'admin')),
  centre_id UUID REFERENCES public.centres(id),
  course_id UUID REFERENCES public.courses(id), -- NULL = all courses at centre
  CHECK (role = 'admin' OR centre_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.student_roster (
  email CITEXT PRIMARY KEY CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  prn TEXT NOT NULL UNIQUE CHECK (btrim(prn) <> ''),
  full_name TEXT NOT NULL CHECK (btrim(full_name) <> ''),
  batch_id UUID NOT NULL REFERENCES public.batches(id),
  centre_id UUID NOT NULL REFERENCES public.centres(id),
  course_id UUID NOT NULL REFERENCES public.courses(id)
);
CREATE INDEX IF NOT EXISTS student_roster_cohort_idx ON public.student_roster (batch_id, centre_id, course_id);

-- ---------------------------------------------------------------- Questions Template
CREATE TABLE IF NOT EXISTS public.questions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sort_order INT NOT NULL DEFAULT 0,
  text TEXT NOT NULL CHECK (btrim(text) <> ''),
  kind TEXT NOT NULL CHECK (kind IN ('choice', 'text')),
  options TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  CHECK (kind = 'text' OR cardinality(options) >= 2)
);

-- ---------------------------------------------------------------- Sessions & Submissions
CREATE TABLE IF NOT EXISTS public.feedback_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.batches(id),
  centre_id UUID NOT NULL REFERENCES public.centres(id),
  course_id UUID NOT NULL REFERENCES public.courses(id),
  module_id UUID NOT NULL REFERENCES public.modules(id),
  faculty TEXT[] NOT NULL DEFAULT '{}',
  questions JSONB NOT NULL DEFAULT '[]', -- Snapshot of questions at creation
  opens_at TIMESTAMPTZ NOT NULL,
  closes_at TIMESTAMPTZ NOT NULL,
  created_by CITEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (closes_at > opens_at)
);
CREATE INDEX IF NOT EXISTS feedback_sessions_cohort_idx ON public.feedback_sessions (centre_id, course_id, batch_id);

-- Tracks completion without linking to answers
CREATE TABLE IF NOT EXISTS public.submissions (
  session_id UUID NOT NULL REFERENCES public.feedback_sessions(id) ON DELETE CASCADE,
  email CITEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, email)
);

-- Completely anonymous responses. No student id, no email, no timestamp.
CREATE TABLE IF NOT EXISTS public.responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.feedback_sessions(id) ON DELETE CASCADE,
  answers JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS responses_session_idx ON public.responses (session_id);

-- ---------------------------------------------------------------- Sessions & Audit Tables
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id TEXT PRIMARY KEY,
  email CITEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'cc', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS user_sessions_expires_idx ON public.user_sessions (expires_at);

-- CERT-In 180-Day Immutable Audit Log
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id BIGSERIAL PRIMARY KEY,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_email CITEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT
);
CREATE INDEX IF NOT EXISTS audit_logs_timestamp_idx ON public.audit_logs (logged_at);

-- ---------------------------------------------------------------- Context & Identity Helper
CREATE OR REPLACE FUNCTION public.my_email() RETURNS CITEXT
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    nullif(current_setting('app.current_user_email', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'
  )::citext;
$$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM staff_roster WHERE email = my_email() AND role = 'admin')
$$;

CREATE OR REPLACE FUNCTION public.is_staff() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM staff_roster WHERE email = my_email())
$$;

CREATE OR REPLACE FUNCTION public.can_manage(p_centre UUID, p_course UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff_roster s
     WHERE s.email = my_email()
       AND (s.role = 'admin'
            OR (s.centre_id = p_centre AND (s.course_id IS NULL OR s.course_id = p_course)))
  )
$$;

CREATE OR REPLACE FUNCTION public.is_my_centre(p_centre UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM staff_roster WHERE email = my_email() AND (role = 'admin' OR centre_id = p_centre))
$$;

CREATE OR REPLACE FUNCTION public.in_my_cohort(p_batch UUID, p_centre UUID, p_course UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM student_roster
                  WHERE email = my_email() AND batch_id = p_batch AND centre_id = p_centre AND course_id = p_course)
$$;

CREATE OR REPLACE FUNCTION public.whoami() RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object('email', email, 'role', role, 'full_name', full_name,
                               'centre_id', centre_id, 'course_id', course_id)
       FROM staff_roster WHERE email = my_email()),
    (SELECT jsonb_build_object('email', email, 'role', 'student', 'full_name', full_name, 'prn', prn,
                               'batch_id', batch_id, 'centre_id', centre_id, 'course_id', course_id)
       FROM student_roster WHERE email = my_email())
  )
$$;

-- ---------------------------------------------------------------- Core Procedures
CREATE OR REPLACE FUNCTION public.submit_feedback(p_session UUID, p_answers JSONB) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_email CITEXT := my_email();
  v_session feedback_sessions%ROWTYPE;
  q JSONB;
  v TEXT;
BEGIN
  SELECT * INTO v_session FROM feedback_sessions WHERE id = p_session;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Feedback session not found';
  END IF;
  IF NOT in_my_cohort(v_session.batch_id, v_session.centre_id, v_session.course_id) THEN
    RAISE EXCEPTION 'You are not enrolled in this batch';
  END IF;
  IF now() < v_session.opens_at OR now() > v_session.closes_at THEN
    RAISE EXCEPTION 'This feedback window is closed';
  END IF;
  IF jsonb_typeof(p_answers) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid answers';
  END IF;

  FOR q IN SELECT * FROM jsonb_array_elements(v_session.questions) LOOP
    v := p_answers ->> (q ->> 'id');
    IF q ->> 'kind' = 'choice' THEN
      IF v IS NULL OR NOT (q -> 'options' ? v) THEN
        RAISE EXCEPTION 'Please answer: %', q ->> 'text';
      END IF;
    ELSIF length(v) > 2000 THEN
      RAISE EXCEPTION 'Answer is too long (max 2000 characters): %', q ->> 'text';
    END IF;
  END LOOP;

  INSERT INTO submissions (session_id, email) VALUES (p_session, v_email);
  INSERT INTO responses (session_id, answers)
  SELECT p_session, COALESCE(jsonb_object_agg(sq ->> 'id', p_answers ->> (sq ->> 'id')), '{}'::jsonb)
    FROM jsonb_array_elements(v_session.questions) sq
   WHERE p_answers ? (sq ->> 'id');
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'You have already submitted feedback for this session';
END;
$$;

CREATE OR REPLACE FUNCTION public.session_report(p_session UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  s feedback_sessions%ROWTYPE;
  n INT;
BEGIN
  SELECT * INTO s FROM feedback_sessions WHERE id = p_session;
  IF NOT FOUND OR NOT can_manage(s.centre_id, s.course_id) THEN
    RAISE EXCEPTION 'Session not found, or not in your centre';
  END IF;
  SELECT count(*) INTO n FROM responses WHERE session_id = p_session;
  IF now() <= s.closes_at THEN
    RETURN jsonb_build_object('status', 'open', 'total', n, 'answers', '[]'::jsonb);
  END IF;
  IF n < 3 THEN
    RETURN jsonb_build_object('status', 'too_few', 'total', n, 'answers', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object('status', 'ready', 'total', n, 'answers',
    (SELECT jsonb_agg(answers ORDER BY random()) FROM responses WHERE session_id = p_session));
END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_data() RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.opens_at DESC), '[]'::jsonb)
  FROM (
    SELECT s.id, s.batch_id, s.centre_id, s.course_id, s.opens_at, s.closes_at, s.faculty,
           b.label AS batch, c.name AS centre, co.code AS course, m.name AS module,
           (SELECT count(*) FROM student_roster r
             WHERE r.batch_id = s.batch_id AND r.centre_id = s.centre_id AND r.course_id = s.course_id)::int AS students,
           (SELECT count(*) FROM submissions x WHERE x.session_id = s.id)::int AS submitted,
           CASE WHEN s.closes_at < now() AND (SELECT count(*) FROM responses r WHERE r.session_id = s.id) >= 3
                THEN (
                  SELECT COALESCE(jsonb_object_agg(v, n), '{}'::jsonb)
                  FROM (
                    SELECT e.value AS v, count(*) AS n
                      FROM responses r
                      CROSS JOIN LATERAL jsonb_each_text(r.answers) e
                      JOIN LATERAL jsonb_array_elements(s.questions) q
                        ON q ->> 'id' = e.key AND q ->> 'kind' = 'choice' AND q -> 'options' ? 'Excellent'
                     WHERE r.session_id = s.id
                     GROUP BY e.value
                  ) z
                )
           END AS ratings
      FROM feedback_sessions s
      JOIN batches b ON b.id = s.batch_id
      JOIN centres c ON c.id = s.centre_id
      JOIN courses co ON co.id = s.course_id
      JOIN modules m ON m.id = s.module_id
     WHERE can_manage(s.centre_id, s.course_id)
  ) t
$$;

-- ---------------------------------------------------------------- Triggers
CREATE OR REPLACE FUNCTION public.snapshot_questions() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.questions IS NULL OR jsonb_array_length(NEW.questions) = 0 THEN
    NEW.questions := (
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'text', text, 'kind', kind, 'options', options
      ) ORDER BY sort_order)
      FROM public.questions WHERE active = true
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_snapshot_questions
  BEFORE INSERT ON public.feedback_sessions
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_questions();

CREATE OR REPLACE FUNCTION public.lock_closed_schedule() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_catalog
AS $$
BEGIN
  IF OLD.closes_at <= now() AND current_user <> 'postgres'
     AND (NEW.opens_at, NEW.closes_at) IS DISTINCT FROM (OLD.opens_at, OLD.closes_at) THEN
    RAISE EXCEPTION 'This session has closed; its schedule can no longer change';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_lock_closed_schedule
  BEFORE UPDATE ON public.feedback_sessions
  FOR EACH ROW EXECUTE FUNCTION public.lock_closed_schedule();

-- ---------------------------------------------------------------- View: Cohort Sizes
CREATE OR REPLACE VIEW public.cohort_sizes AS
SELECT batch_id, centre_id, course_id, count(*)::int AS students
  FROM public.student_roster
 GROUP BY batch_id, centre_id, course_id;
