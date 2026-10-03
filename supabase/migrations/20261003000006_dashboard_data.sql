-- ============================================================================
-- Dashboard data: one row per session the caller may manage, with counts only.
--
-- Same privacy rule as session_report(): rating counts are filled in only after
-- the session has closed AND at least 3 students responded. Open or small
-- sessions return `ratings = null`, so a CC can never watch answers arrive.
-- Admin sees every session; a CC sees only their centre/course (can_manage).
-- ============================================================================

CREATE FUNCTION public.dashboard_data() RETURNS JSONB
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
                  -- Counts of each rating word across all quality-scale questions (options include 'Excellent').
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
REVOKE EXECUTE ON FUNCTION public.dashboard_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_data() TO authenticated;
