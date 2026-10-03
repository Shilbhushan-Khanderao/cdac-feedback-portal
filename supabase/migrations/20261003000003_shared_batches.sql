-- ============================================================================
-- Shared batches + centre-scoped feedback + centre-scoped faculty
--
-- A batch (intake, e.g. "Aug 2026") is now global: every C-DAC centre, ATC
-- and course uses the same row. A cohort = (batch, centre, course) and lives
-- as three columns on student_roster and feedback_sessions.
-- A student sees / submits only sessions of their own cohort (same centre).
-- Faculty rows belong to a centre (NULL = shared across centres).
-- ============================================================================

-- ---------------------------------------------------------------- cohort columns
ALTER TABLE public.student_roster
  ADD COLUMN centre_id UUID REFERENCES public.centres(id),
  ADD COLUMN course_id UUID REFERENCES public.courses(id);
ALTER TABLE public.feedback_sessions
  ADD COLUMN centre_id UUID REFERENCES public.centres(id),
  ADD COLUMN course_id UUID REFERENCES public.courses(id);

UPDATE public.student_roster r SET centre_id = b.centre_id, course_id = b.course_id
  FROM public.batches b WHERE b.id = r.batch_id;
UPDATE public.feedback_sessions s SET centre_id = b.centre_id, course_id = b.course_id
  FROM public.batches b WHERE b.id = s.batch_id;

-- ---------------------------------------------------------------- one batch per label
CREATE TEMP TABLE batch_keep ON COMMIT DROP AS
SELECT b.id AS old_id, k.id AS keep_id
  FROM public.batches b
  JOIN (SELECT DISTINCT ON (label) id, label FROM public.batches ORDER BY label, id) k ON k.label = b.label;

UPDATE public.student_roster r SET batch_id = m.keep_id FROM batch_keep m WHERE r.batch_id = m.old_id AND m.old_id <> m.keep_id;
UPDATE public.feedback_sessions s SET batch_id = m.keep_id FROM batch_keep m WHERE s.batch_id = m.old_id AND m.old_id <> m.keep_id;
DELETE FROM public.batches b USING batch_keep m WHERE b.id = m.old_id AND m.old_id <> m.keep_id;

-- ---------------------------------------------------------------- drop old policies + helpers
DROP POLICY batches_manage ON public.batches;
DROP POLICY student_roster_read ON public.student_roster;
DROP POLICY student_roster_manage ON public.student_roster;
DROP POLICY sessions_read ON public.feedback_sessions;
DROP POLICY sessions_insert ON public.feedback_sessions;
DROP POLICY sessions_update ON public.feedback_sessions;
DROP POLICY sessions_delete ON public.feedback_sessions;
DROP POLICY submissions_read ON public.submissions;
DROP POLICY responses_read ON public.responses;
DROP POLICY faculty_read ON public.faculty;
DROP POLICY faculty_staff ON public.faculty;
DROP FUNCTION public.can_manage_batch(UUID);
DROP FUNCTION public.my_batch();

ALTER TABLE public.batches
  DROP CONSTRAINT batches_centre_id_course_id_label_key,
  DROP COLUMN centre_id,
  DROP COLUMN course_id,
  ADD CONSTRAINT batches_label_key UNIQUE (label);

ALTER TABLE public.student_roster ALTER COLUMN centre_id SET NOT NULL, ALTER COLUMN course_id SET NOT NULL;
ALTER TABLE public.feedback_sessions ALTER COLUMN centre_id SET NOT NULL, ALTER COLUMN course_id SET NOT NULL;
DROP INDEX public.student_roster_batch_idx;
CREATE INDEX student_roster_cohort_idx ON public.student_roster (batch_id, centre_id, course_id);
DROP INDEX public.feedback_sessions_batch_idx;
CREATE INDEX feedback_sessions_cohort_idx ON public.feedback_sessions (centre_id, course_id, batch_id);

-- ---------------------------------------------------------------- helpers
CREATE FUNCTION public.in_my_cohort(p_batch UUID, p_centre UUID, p_course UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM student_roster
                  WHERE email = my_email() AND batch_id = p_batch AND centre_id = p_centre AND course_id = p_course)
$$;

-- Admin, or a CC of that centre (any course).
CREATE FUNCTION public.is_my_centre(p_centre UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM staff_roster WHERE email = my_email() AND (role = 'admin' OR centre_id = p_centre))
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

-- ---------------------------------------------------------------- policies
CREATE POLICY batches_admin ON public.batches FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY student_roster_read ON public.student_roster FOR SELECT TO authenticated
  USING (email = public.my_email() OR public.can_manage(centre_id, course_id));
CREATE POLICY student_roster_manage ON public.student_roster FOR ALL TO authenticated
  USING (public.can_manage(centre_id, course_id)) WITH CHECK (public.can_manage(centre_id, course_id));

CREATE POLICY sessions_read ON public.feedback_sessions FOR SELECT TO authenticated
  USING (public.can_manage(centre_id, course_id) OR public.in_my_cohort(batch_id, centre_id, course_id));
CREATE POLICY sessions_insert ON public.feedback_sessions FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage(centre_id, course_id)
    AND EXISTS (SELECT 1 FROM public.modules m WHERE m.id = module_id AND m.course_id = feedback_sessions.course_id)
  );
CREATE POLICY sessions_update ON public.feedback_sessions FOR UPDATE TO authenticated
  USING (public.can_manage(centre_id, course_id)) WITH CHECK (public.can_manage(centre_id, course_id));
CREATE POLICY sessions_delete ON public.feedback_sessions FOR DELETE TO authenticated
  USING (public.can_manage(centre_id, course_id)
         AND NOT EXISTS (SELECT 1 FROM public.submissions s WHERE s.session_id = feedback_sessions.id));

CREATE POLICY submissions_read ON public.submissions FOR SELECT TO authenticated
  USING (email = public.my_email()
         OR EXISTS (SELECT 1 FROM public.feedback_sessions f
                     WHERE f.id = session_id AND public.can_manage(f.centre_id, f.course_id)));
CREATE POLICY responses_read ON public.responses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.feedback_sessions f
                  WHERE f.id = session_id AND public.can_manage(f.centre_id, f.course_id)));

-- ---------------------------------------------------------------- submit: same cohort only
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

-- ---------------------------------------------------------------- centre-scoped faculty
ALTER TABLE public.faculty ADD COLUMN centre_id UUID REFERENCES public.centres(id); -- NULL = shared
UPDATE public.faculty SET centre_id = (SELECT id FROM public.centres WHERE name = 'C-DAC Mumbai')
 WHERE centre_id IS NULL;
ALTER TABLE public.faculty DROP CONSTRAINT faculty_name_key;
CREATE UNIQUE INDEX faculty_name_ci ON public.faculty (lower(btrim(name)));

CREATE POLICY faculty_read ON public.faculty FOR SELECT TO authenticated
  USING (public.is_staff() AND (centre_id IS NULL OR public.is_my_centre(centre_id)));
CREATE POLICY faculty_write ON public.faculty FOR ALL TO authenticated
  USING (public.is_admin() OR (centre_id IS NOT NULL AND public.is_my_centre(centre_id)))
  WITH CHECK (public.is_admin() OR (centre_id IS NOT NULL AND public.is_my_centre(centre_id)));

-- ---------------------------------------------------------------- grants
REVOKE EXECUTE ON FUNCTION public.in_my_cohort(UUID, UUID, UUID), public.is_my_centre(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.in_my_cohort(UUID, UUID, UUID), public.is_my_centre(UUID) TO authenticated;

-- ---------------------------------------------------------------- roster size per cohort
-- security_invoker: callers only count students they may see (RLS on student_roster).
CREATE VIEW public.cohort_sizes WITH (security_invoker = true) AS
SELECT batch_id, centre_id, course_id, count(*)::int AS students
  FROM public.student_roster
 GROUP BY batch_id, centre_id, course_id;
REVOKE ALL ON public.cohort_sizes FROM anon;
GRANT SELECT ON public.cohort_sizes TO authenticated;
