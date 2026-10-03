-- ============================================================================
-- Keep answers anonymous from CCs too.
--
-- Before: CCs could read raw `responses` rows at any time. Rows come back in
-- insertion order (= submission order) and appear live while a session is
-- open, so a CC could pair each response with a `submissions` row.
-- (The comment in 20261002000001 that only the DB owner could pair them was wrong.)
--
-- Now:
--   * No direct SELECT on `responses`; staff read it only through session_report():
--     after the session closes, with at least 3 responses, in random order.
--   * CCs see who submitted (session_id, email) but not when.
--   * Once a session has closed its schedule is final, so a CC cannot
--     close, read, reopen and compare.
-- ============================================================================

DROP POLICY responses_read ON public.responses;
REVOKE SELECT ON public.responses FROM authenticated, anon;

REVOKE SELECT ON public.submissions FROM authenticated, anon;
GRANT SELECT (session_id, email) ON public.submissions TO authenticated;

-- ponytail: fixed k = 3; make it a column on courses/centres if a cohort is ever that small on purpose.
CREATE FUNCTION public.session_report(p_session UUID) RETURNS JSONB
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
REVOKE EXECUTE ON FUNCTION public.session_report(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.session_report(UUID) TO authenticated;

-- Schedule is final once closed. Faculty stays editable (no effect on anonymity).
-- The SQL editor (postgres) can still reopen in an emergency.
CREATE FUNCTION public.lock_closed_schedule() RETURNS TRIGGER
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
CREATE TRIGGER trg_lock_closed_schedule
  BEFORE UPDATE ON public.feedback_sessions
  FOR EACH ROW EXECUTE FUNCTION public.lock_closed_schedule();
REVOKE EXECUTE ON FUNCTION public.lock_closed_schedule() FROM PUBLIC, anon, authenticated;
