-- ============================================================================
-- 002_security: least-privilege app role, RLS, anonymity and audit hardening.
-- Runs as the owner (DATABASE_ADMIN_URL). The role `feedback_app` is created by
-- the migration runner before this file. New tables later MUST add their own GRANTs.
-- ============================================================================

-- ---------------------------------------------------------------- Identity helpers
-- Only the per-transaction GUC set by withUser() counts. The old request.jwt.claims
-- fallback let any session forge an identity, so it is gone.
CREATE OR REPLACE FUNCTION public.my_email() RETURNS CITEXT
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('app.current_user_email', true), '')::citext $$;

-- Roster lookup for login and per-request role re-check (no user context needed).
CREATE OR REPLACE FUNCTION public.auth_role(p_email CITEXT) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(
    (SELECT role FROM staff_roster WHERE email = p_email),
    (SELECT 'student' FROM student_roster WHERE email = p_email))
$$;

-- Does this email exist in student_roster at all (ignoring RLS)? Lets the upload route
-- refuse to re-home a student who belongs to another centre without leaking details.
CREATE OR REPLACE FUNCTION public.roster_email_taken(p_email CITEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$ SELECT EXISTS (SELECT 1 FROM student_roster WHERE email = p_email) $$;

-- Module edit rights: admin, or a CC whose course scope is NULL (all) or this course.
CREATE OR REPLACE FUNCTION public.can_edit_course(p_course UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM staff_roster s
                  WHERE s.email = my_email()
                    AND (s.role = 'admin' OR s.course_id IS NULL OR s.course_id = p_course))
$$;

-- ---------------------------------------------------------------- Triggers
-- A closed session's schedule is final. No role exemption: reopening would let staff
-- correlate late submitters (deanonymisation).
CREATE OR REPLACE FUNCTION public.lock_closed_schedule() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_catalog
AS $$
BEGIN
  IF OLD.closes_at <= now()
     AND (NEW.opens_at, NEW.closes_at) IS DISTINCT FROM (OLD.opens_at, OLD.closes_at) THEN
    RAISE EXCEPTION 'This session has closed; its schedule can no longer change';
  END IF;
  RETURN NEW;
END;
$$;

-- Sessions holding submissions are never deleted (the FK would cascade away feedback).
CREATE OR REPLACE FUNCTION public.block_delete_with_submissions() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM submissions WHERE session_id = OLD.id) THEN
    RAISE EXCEPTION 'Cannot delete session that already has submissions';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_block_delete_with_submissions ON public.feedback_sessions;
CREATE TRIGGER trg_block_delete_with_submissions
  BEFORE DELETE ON public.feedback_sessions
  FOR EACH ROW EXECUTE FUNCTION public.block_delete_with_submissions();

-- Never let the last admin be deleted or demoted (ponytail: not race-proof under
-- two concurrent demotions; add a table lock if that ever matters).
CREATE OR REPLACE FUNCTION public.guard_last_admin() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
BEGIN
  IF OLD.role = 'admin' AND (TG_OP = 'DELETE' OR NEW.role <> 'admin')
     AND NOT EXISTS (SELECT 1 FROM staff_roster WHERE role = 'admin' AND email <> OLD.email) THEN
    RAISE EXCEPTION 'Cannot remove or demote the last admin';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_last_admin ON public.staff_roster;
CREATE TRIGGER trg_guard_last_admin
  BEFORE UPDATE OF role OR DELETE ON public.staff_roster
  FOR EACH ROW EXECUTE FUNCTION public.guard_last_admin();

-- Append-only audit log (CERT-In 180 days). Blocks even the owner; retention purges
-- must DROP the trigger in a controlled migration.
CREATE OR REPLACE FUNCTION public.audit_logs_immutable() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_logs_no_change ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_no_change
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_immutable();
DROP TRIGGER IF EXISTS trg_audit_logs_no_truncate ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_no_truncate
  BEFORE TRUNCATE ON public.audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_logs_immutable();

-- ---------------------------------------------------------------- Views
-- Run with the caller's rights so a CC only counts cohorts RLS lets them see.
CREATE OR REPLACE VIEW public.cohort_sizes WITH (security_invoker = true) AS
SELECT batch_id, centre_id, course_id, count(*)::int AS students
  FROM public.student_roster
 GROUP BY batch_id, centre_id, course_id;

-- ---------------------------------------------------------------- Row Level Security
ALTER TABLE public.centres          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_roster     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_roster   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responses        ENABLE ROW LEVEL SECURITY;

-- Owner keeps full access so SECURITY DEFINER functions (submit_feedback, session_report,
-- dashboard_data...) work under FORCE. feedback_app is never the owner.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['centres','courses','batches','questions','modules','faculty',
    'staff_roster','student_roster','feedback_sessions','submissions','responses'] LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS owner_all ON public.%I', t);
    EXECUTE format('CREATE POLICY owner_all ON public.%I FOR ALL TO %I USING (true) WITH CHECK (true)', t, current_user);
  END LOOP;
END $$;

-- Reference data: world-readable to the app, admin-only writes.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['centres','courses','batches','questions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (true)', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_ins', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (is_admin())', t || '_ins', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_upd', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (is_admin()) WITH CHECK (is_admin())', t || '_upd', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_del', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (is_admin())', t || '_del', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS modules_select ON public.modules;
CREATE POLICY modules_select ON public.modules FOR SELECT USING (true);
DROP POLICY IF EXISTS modules_ins ON public.modules;
CREATE POLICY modules_ins ON public.modules FOR INSERT WITH CHECK (can_edit_course(course_id));
DROP POLICY IF EXISTS modules_upd ON public.modules;
CREATE POLICY modules_upd ON public.modules FOR UPDATE USING (can_edit_course(course_id)) WITH CHECK (can_edit_course(course_id));
DROP POLICY IF EXISTS modules_del ON public.modules;
CREATE POLICY modules_del ON public.modules FOR DELETE USING (can_edit_course(course_id));

-- Faculty: staff read; a CC writes only their own centre's rows (admin: any, incl. shared NULL).
DROP POLICY IF EXISTS faculty_select ON public.faculty;
CREATE POLICY faculty_select ON public.faculty FOR SELECT USING (is_staff());
DROP POLICY IF EXISTS faculty_ins ON public.faculty;
CREATE POLICY faculty_ins ON public.faculty FOR INSERT WITH CHECK (is_my_centre(centre_id));
DROP POLICY IF EXISTS faculty_upd ON public.faculty;
CREATE POLICY faculty_upd ON public.faculty FOR UPDATE USING (is_my_centre(centre_id)) WITH CHECK (is_my_centre(centre_id));
DROP POLICY IF EXISTS faculty_del ON public.faculty;
CREATE POLICY faculty_del ON public.faculty FOR DELETE USING (is_my_centre(centre_id));

-- staff_roster: see yourself and your centre; only admins write.
DROP POLICY IF EXISTS staff_roster_select ON public.staff_roster;
CREATE POLICY staff_roster_select ON public.staff_roster FOR SELECT
  USING (email = my_email() OR is_my_centre(centre_id));
DROP POLICY IF EXISTS staff_roster_ins ON public.staff_roster;
CREATE POLICY staff_roster_ins ON public.staff_roster FOR INSERT WITH CHECK (is_admin());
DROP POLICY IF EXISTS staff_roster_upd ON public.staff_roster;
CREATE POLICY staff_roster_upd ON public.staff_roster FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS staff_roster_del ON public.staff_roster;
CREATE POLICY staff_roster_del ON public.staff_roster FOR DELETE USING (is_admin());

-- student_roster: a student sees only their own row; staff only cohorts they manage.
-- UPDATE USING checks the existing (source) row, WITH CHECK the new (destination) row.
DROP POLICY IF EXISTS student_roster_select ON public.student_roster;
CREATE POLICY student_roster_select ON public.student_roster FOR SELECT
  USING (email = my_email() OR can_manage(centre_id, course_id));
DROP POLICY IF EXISTS student_roster_ins ON public.student_roster;
CREATE POLICY student_roster_ins ON public.student_roster FOR INSERT WITH CHECK (can_manage(centre_id, course_id));
DROP POLICY IF EXISTS student_roster_upd ON public.student_roster;
CREATE POLICY student_roster_upd ON public.student_roster FOR UPDATE
  USING (can_manage(centre_id, course_id)) WITH CHECK (can_manage(centre_id, course_id));
DROP POLICY IF EXISTS student_roster_del ON public.student_roster;
CREATE POLICY student_roster_del ON public.student_roster FOR DELETE USING (can_manage(centre_id, course_id));

-- feedback_sessions: unchanged semantics.
DROP POLICY IF EXISTS feedback_sessions_select ON public.feedback_sessions;
CREATE POLICY feedback_sessions_select ON public.feedback_sessions FOR SELECT
  USING (in_my_cohort(batch_id, centre_id, course_id) OR can_manage(centre_id, course_id));
DROP POLICY IF EXISTS feedback_sessions_insert ON public.feedback_sessions;
CREATE POLICY feedback_sessions_insert ON public.feedback_sessions FOR INSERT WITH CHECK (can_manage(centre_id, course_id));
DROP POLICY IF EXISTS feedback_sessions_update ON public.feedback_sessions;
CREATE POLICY feedback_sessions_update ON public.feedback_sessions FOR UPDATE
  USING (can_manage(centre_id, course_id)) WITH CHECK (can_manage(centre_id, course_id));
DROP POLICY IF EXISTS feedback_sessions_delete ON public.feedback_sessions;
CREATE POLICY feedback_sessions_delete ON public.feedback_sessions FOR DELETE USING (can_manage(centre_id, course_id));

-- submissions: read-only for the app. Only submit_feedback() (definer) inserts.
DROP POLICY IF EXISTS submissions_select ON public.submissions;
CREATE POLICY submissions_select ON public.submissions FOR SELECT
  USING (email = my_email() OR EXISTS (
    SELECT 1 FROM public.feedback_sessions s
     WHERE s.id = session_id AND can_manage(s.centre_id, s.course_id)));
DROP POLICY IF EXISTS submissions_insert ON public.submissions;

-- responses: NO app policy and NO app grant. Staff read answers only via session_report().
DROP POLICY IF EXISTS responses_select ON public.responses;
DROP POLICY IF EXISTS responses_insert ON public.responses;

-- ---------------------------------------------------------------- Grants (explicit, least privilege)
GRANT USAGE ON SCHEMA public TO feedback_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM feedback_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.centres, public.courses, public.batches, public.questions, public.modules,
  public.faculty, public.staff_roster, public.student_roster TO feedback_app;

GRANT SELECT, INSERT, DELETE ON public.feedback_sessions TO feedback_app;
GRANT UPDATE (faculty, opens_at, closes_at) ON public.feedback_sessions TO feedback_app;

-- No submitted_at: CCs may see who submitted, never when.
GRANT SELECT (session_id, email) ON public.submissions TO feedback_app;

GRANT SELECT, INSERT, DELETE ON public.user_sessions TO feedback_app;
GRANT INSERT ON public.audit_logs TO feedback_app;
GRANT USAGE ON SEQUENCE public.audit_logs_id_seq TO feedback_app;
GRANT SELECT ON public.cohort_sizes TO feedback_app;
-- public.responses: intentionally nothing.

REVOKE EXECUTE ON FUNCTION
  public.submit_feedback(uuid, jsonb), public.session_report(uuid), public.dashboard_data(),
  public.whoami(), public.auth_role(citext), public.can_edit_course(uuid), public.roster_email_taken(citext)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.my_email(), public.is_admin(), public.is_staff(), public.can_manage(uuid, uuid),
  public.is_my_centre(uuid), public.in_my_cohort(uuid, uuid, uuid), public.can_edit_course(uuid),
  public.whoami(), public.submit_feedback(uuid, jsonb), public.session_report(uuid),
  public.dashboard_data(), public.auth_role(citext), public.roster_email_taken(citext)
  TO feedback_app;
