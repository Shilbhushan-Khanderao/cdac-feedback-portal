-- ============================================================================
-- CDAC Feedback Portal: schema, row level security, RPCs
--
-- Identity = the signed-in email (auth.jwt() ->> 'email') looked up in two
-- allowlists: staff_roster (cc/admin) and student_roster (students).
-- There is no profiles table to keep in sync.
--
-- Anonymity: `submissions` records WHO submitted (completion tracking),
-- `responses` records WHAT was answered, with no student column and no
-- timestamp. Both rows are written only by submit_feedback().
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------- tables
CREATE TABLE public.centres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (btrim(name) <> ''),
  kind TEXT NOT NULL CHECK (kind IN ('cdac', 'atc')),
  parent_id UUID REFERENCES public.centres(id),
  CHECK (kind = 'cdac' OR parent_id IS NOT NULL)
);

-- Courses are data: rename, add, deactivate from the admin screen.
-- Rows referenced by modules/batches cannot be deleted (FK NO ACTION).
CREATE TABLE public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (btrim(code) <> ''),
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE public.modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id),
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  short_name TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (course_id, name)
);

CREATE TABLE public.faculty (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (btrim(name) <> ''),
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE public.batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  centre_id UUID NOT NULL REFERENCES public.centres(id),
  course_id UUID NOT NULL REFERENCES public.courses(id),
  label TEXT NOT NULL CHECK (btrim(label) <> ''),
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (centre_id, course_id, label)
);

-- ponytail: one row per staff email, so a CC covers one centre (and one course or all).
-- Add a staff_scopes table if a CC ever needs several centres.
CREATE TABLE public.staff_roster (
  email CITEXT PRIMARY KEY CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name TEXT NOT NULL CHECK (btrim(full_name) <> ''),
  role TEXT NOT NULL CHECK (role IN ('cc', 'admin')),
  centre_id UUID REFERENCES public.centres(id),
  course_id UUID REFERENCES public.courses(id), -- NULL = every course at the centre
  CHECK (role = 'admin' OR centre_id IS NOT NULL)
);

CREATE TABLE public.student_roster (
  email CITEXT PRIMARY KEY CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  prn TEXT NOT NULL UNIQUE CHECK (btrim(prn) <> ''),
  full_name TEXT NOT NULL CHECK (btrim(full_name) <> ''),
  batch_id UUID NOT NULL REFERENCES public.batches(id)
);
CREATE INDEX student_roster_batch_idx ON public.student_roster (batch_id);

-- Default question template. Each session copies it at creation time, so
-- later edits never change old reports. Seeded ids are readable slugs.
CREATE TABLE public.questions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sort_order INT NOT NULL DEFAULT 0,
  text TEXT NOT NULL CHECK (btrim(text) <> ''),
  kind TEXT NOT NULL CHECK (kind IN ('choice', 'text')),
  options TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  CHECK (kind = 'text' OR cardinality(options) >= 2)
);

CREATE TABLE public.feedback_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.batches(id),
  module_id UUID NOT NULL REFERENCES public.modules(id),
  faculty TEXT[] NOT NULL DEFAULT '{}',
  questions JSONB NOT NULL DEFAULT '[]', -- snapshot: [{id, text, kind, options}], filled by trigger
  opens_at TIMESTAMPTZ NOT NULL,
  closes_at TIMESTAMPTZ NOT NULL,
  created_by CITEXT DEFAULT (auth.jwt() ->> 'email'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (closes_at > opens_at)
);
CREATE INDEX feedback_sessions_batch_idx ON public.feedback_sessions (batch_id);

CREATE TABLE public.submissions (
  session_id UUID NOT NULL REFERENCES public.feedback_sessions(id) ON DELETE CASCADE,
  email CITEXT NOT NULL REFERENCES public.student_roster(email) ON UPDATE CASCADE ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, email)
);

-- ponytail: a DB owner could pair rows via xmin (same transaction); app users
-- cannot (PostgREST does not expose system columns). Move inserts to a queue
-- flushed in random order if owner-level anonymity is ever required.
CREATE TABLE public.responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.feedback_sessions(id) ON DELETE CASCADE,
  answers JSONB NOT NULL
);
CREATE INDEX responses_session_idx ON public.responses (session_id);

-- ---------------------------------------------------------------- helpers
-- SECURITY DEFINER so policies can read the rosters without RLS recursion.
CREATE FUNCTION public.my_email() RETURNS CITEXT
LANGUAGE sql STABLE
AS $$ SELECT (auth.jwt() ->> 'email')::citext $$;

CREATE FUNCTION public.is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM staff_roster WHERE email = my_email() AND role = 'admin')
$$;

CREATE FUNCTION public.is_staff() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM staff_roster WHERE email = my_email())
$$;

-- Admin: everything. CC: own centre, own course (or all courses when course_id is NULL).
CREATE FUNCTION public.can_manage(p_centre UUID, p_course UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff_roster s
     WHERE s.email = my_email()
       AND (s.role = 'admin'
            OR (s.centre_id = p_centre AND (s.course_id IS NULL OR s.course_id = p_course)))
  )
$$;

CREATE FUNCTION public.can_manage_batch(p_batch UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM batches b WHERE b.id = p_batch AND can_manage(b.centre_id, b.course_id))
$$;

CREATE FUNCTION public.my_batch() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$ SELECT batch_id FROM student_roster WHERE email = my_email() $$;

-- Who am I? NULL when the signed-in email is on no roster.
CREATE FUNCTION public.whoami() RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object('email', email, 'role', role, 'full_name', full_name,
                               'centre_id', centre_id, 'course_id', course_id)
       FROM staff_roster WHERE email = my_email()),
    (SELECT jsonb_build_object('email', email, 'role', 'student', 'full_name', full_name,
                               'prn', prn, 'batch_id', batch_id)
       FROM student_roster WHERE email = my_email())
  )
$$;

-- ---------------------------------------------------------------- session snapshot
CREATE FUNCTION public.snapshot_session_questions() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.questions IS NULL OR NEW.questions = '[]'::jsonb THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'text', text, 'kind', kind,
                                                 'options', to_jsonb(options))
                              ORDER BY sort_order, text), '[]'::jsonb)
      INTO NEW.questions
      FROM questions
     WHERE active;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_snapshot_session_questions
  BEFORE INSERT ON public.feedback_sessions
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_session_questions();

-- ---------------------------------------------------------------- RLS
ALTER TABLE public.centres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;

-- Reference data: every signed-in user reads; admin writes (staff for modules/faculty).
CREATE POLICY centres_read ON public.centres FOR SELECT TO authenticated USING (true);
CREATE POLICY centres_admin ON public.centres FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY courses_read ON public.courses FOR SELECT TO authenticated USING (true);
CREATE POLICY courses_admin ON public.courses FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY questions_read ON public.questions FOR SELECT TO authenticated USING (true);
CREATE POLICY questions_admin ON public.questions FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY modules_read ON public.modules FOR SELECT TO authenticated USING (true);
CREATE POLICY modules_staff ON public.modules FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY faculty_read ON public.faculty FOR SELECT TO authenticated USING (true);
CREATE POLICY faculty_staff ON public.faculty FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY batches_read ON public.batches FOR SELECT TO authenticated USING (true);
CREATE POLICY batches_manage ON public.batches FOR ALL TO authenticated
  USING (public.can_manage(centre_id, course_id))
  WITH CHECK (public.can_manage(centre_id, course_id));

CREATE POLICY staff_roster_read ON public.staff_roster FOR SELECT TO authenticated
  USING (email = public.my_email() OR public.is_admin());
CREATE POLICY staff_roster_admin ON public.staff_roster FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY student_roster_read ON public.student_roster FOR SELECT TO authenticated
  USING (email = public.my_email() OR public.can_manage_batch(batch_id));
CREATE POLICY student_roster_manage ON public.student_roster FOR ALL TO authenticated
  USING (public.can_manage_batch(batch_id)) WITH CHECK (public.can_manage_batch(batch_id));

CREATE POLICY sessions_read ON public.feedback_sessions FOR SELECT TO authenticated
  USING (public.can_manage_batch(batch_id) OR batch_id = public.my_batch());
CREATE POLICY sessions_insert ON public.feedback_sessions FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_batch(batch_id)
    AND EXISTS (SELECT 1 FROM public.modules m JOIN public.batches b ON b.course_id = m.course_id
                 WHERE m.id = module_id AND b.id = batch_id)
  );
CREATE POLICY sessions_update ON public.feedback_sessions FOR UPDATE TO authenticated
  USING (public.can_manage_batch(batch_id)) WITH CHECK (public.can_manage_batch(batch_id));
-- Never lose collected feedback: only empty sessions can be deleted.
CREATE POLICY sessions_delete ON public.feedback_sessions FOR DELETE TO authenticated
  USING (public.can_manage_batch(batch_id)
         AND NOT EXISTS (SELECT 1 FROM public.submissions s WHERE s.session_id = feedback_sessions.id));
-- Only the schedule and faculty are editable; batch/module/questions are fixed once created.
REVOKE UPDATE ON public.feedback_sessions FROM authenticated, anon;
GRANT UPDATE (faculty, opens_at, closes_at) ON public.feedback_sessions TO authenticated;

CREATE POLICY submissions_read ON public.submissions FOR SELECT TO authenticated
  USING (email = public.my_email()
         OR EXISTS (SELECT 1 FROM public.feedback_sessions f
                     WHERE f.id = session_id AND public.can_manage_batch(f.batch_id)));

CREATE POLICY responses_read ON public.responses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.feedback_sessions f
                  WHERE f.id = session_id AND public.can_manage_batch(f.batch_id)));

-- Writes to submissions/responses go through submit_feedback() only.
REVOKE INSERT, UPDATE, DELETE ON public.submissions, public.responses FROM authenticated, anon;

-- ---------------------------------------------------------------- submit
CREATE FUNCTION public.submit_feedback(p_session UUID, p_answers JSONB) RETURNS VOID
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
  IF NOT EXISTS (SELECT 1 FROM student_roster WHERE email = v_email AND batch_id = v_session.batch_id) THEN
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
  -- Keep only answers to known questions, as plain strings.
  INSERT INTO responses (session_id, answers)
  SELECT p_session, COALESCE(jsonb_object_agg(sq ->> 'id', p_answers ->> (sq ->> 'id')), '{}'::jsonb)
    FROM jsonb_array_elements(v_session.questions) sq
   WHERE p_answers ? (sq ->> 'id');
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'You have already submitted feedback for this session';
END;
$$;

-- ---------------------------------------------------------------- signup gate
-- Wired as the "Before User Created" auth hook (config.toml locally, dashboard in prod).
CREATE FUNCTION public.hook_restrict_signup_to_roster(event JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
DECLARE
  v_email CITEXT := btrim(COALESCE(event -> 'user' ->> 'email', ''));
BEGIN
  IF EXISTS (SELECT 1 FROM staff_roster WHERE email = v_email)
     OR EXISTS (SELECT 1 FROM student_roster WHERE email = v_email) THEN
    RETURN '{}'::jsonb;
  END IF;
  RETURN jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'This account is not on the feedback roster. Ask your course coordinator to add your email.'));
END;
$$;

-- ---------------------------------------------------------------- grants
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_email(), public.is_admin(), public.is_staff(),
  public.can_manage(UUID, UUID), public.can_manage_batch(UUID), public.my_batch(),
  public.whoami(), public.submit_feedback(UUID, JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.hook_restrict_signup_to_roster(JSONB) FROM authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT EXECUTE ON FUNCTION public.hook_restrict_signup_to_roster(JSONB) TO supabase_auth_admin;
  END IF;
END;
$$;
