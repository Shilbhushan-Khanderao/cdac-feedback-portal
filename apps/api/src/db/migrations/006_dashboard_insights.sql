-- Dashboard insights: per-question answer counts and free-text comments across the sessions a
-- caller manages. Same gate as session_report(): only sessions that are closed, in the caller's
-- scope (can_manage), and have at least 3 responses. Never returns anything per student or per
-- response: choice answers come back as counts per option, comments as plain strings in random
-- order, so nothing links an answer to a submission, a student or a time.
CREATE OR REPLACE FUNCTION public.dashboard_insights() RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'session_id', s.id,
           'questions', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', q ->> 'id', 'text', q ->> 'text', 'kind', q ->> 'kind', 'options', q -> 'options')), '[]'::jsonb)
                           FROM jsonb_array_elements(s.questions) q),
           'counts', (SELECT COALESCE(jsonb_object_agg(e.qid, e.opts), '{}'::jsonb) FROM (
                        SELECT c.key AS qid, jsonb_object_agg(c.value, c.n) AS opts FROM (
                          SELECT a.key, a.value, count(*) AS n
                            FROM responses r CROSS JOIN LATERAL jsonb_each_text(r.answers) a
                            JOIN LATERAL jsonb_array_elements(s.questions) q ON q ->> 'id' = a.key AND q ->> 'kind' = 'choice'
                           WHERE r.session_id = s.id
                           GROUP BY a.key, a.value) c
                        GROUP BY c.key) e),
           'comments', (SELECT COALESCE(jsonb_object_agg(t.qid, t.texts), '{}'::jsonb) FROM (
                          SELECT a.key AS qid, jsonb_agg(a.value ORDER BY random()) AS texts
                            FROM responses r CROSS JOIN LATERAL jsonb_each_text(r.answers) a
                            JOIN LATERAL jsonb_array_elements(s.questions) q ON q ->> 'id' = a.key AND q ->> 'kind' = 'text'
                           WHERE r.session_id = s.id AND btrim(a.value) <> ''
                           GROUP BY a.key) t)
         )), '[]'::jsonb)
    FROM feedback_sessions s
   WHERE s.closes_at < now()
     AND can_manage(s.centre_id, s.course_id)
     AND (SELECT count(*) FROM responses r WHERE r.session_id = s.id) >= 3
$$;

REVOKE ALL ON FUNCTION public.dashboard_insights() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_insights() TO feedback_app;
