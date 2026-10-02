-- Security + anonymity checks. Relies on supabase/seed.sql.
-- Run: npx supabase test db
BEGIN;
SELECT plan(19);

-- Valid answers for the default template.
CREATE TEMP TABLE t_answers AS SELECT '{"explanation":"Good","pace":"Normal","interaction":"Excellent",
  "practical":"Very Good","overall":"Good","theory_comments":"Clear teaching","lab_comments":""}'::jsonb AS a;
GRANT SELECT ON t_answers TO authenticated;

-- ---------------------------------------------------------------- schema
SELECT hasnt_column('public', 'responses', 'email', 'responses has no student email');
SELECT hasnt_column('public', 'responses', 'submitted_at', 'responses has no timestamp');
SELECT is(jsonb_array_length(questions), 7, 'session snapshots the 7 default questions')
  FROM feedback_sessions WHERE id = '00000000-0000-0000-0000-0000000000c1';

-- ---------------------------------------------------------------- signup hook
SELECT is(hook_restrict_signup_to_roster('{"user":{"email":"Student1@Test.local"}}'), '{}'::jsonb,
  'hook allows a roster email (case-insensitive)');
SELECT is((hook_restrict_signup_to_roster('{"user":{"email":"stranger@gmail.com"}}') -> 'error' ->> 'http_code'),
  '403', 'hook rejects an email on no roster');

-- ---------------------------------------------------------------- student
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"email":"student2@test.local"}', true);

SELECT throws_like(
  $$ SELECT submit_feedback('00000000-0000-0000-0000-0000000000c1', '{"explanation":"Good"}') $$,
  'Please answer:%', 'missing choice answer is rejected');
SELECT throws_like(
  $$ SELECT submit_feedback('00000000-0000-0000-0000-0000000000c1', (SELECT a || '{"overall":"Superb"}' FROM t_answers)) $$,
  'Please answer:%', 'answer outside the options is rejected');
SELECT lives_ok(
  $$ SELECT submit_feedback('00000000-0000-0000-0000-0000000000c1', (SELECT a FROM t_answers)) $$,
  'student submits to an open session of their batch');
SELECT throws_ok(
  $$ SELECT submit_feedback('00000000-0000-0000-0000-0000000000c1', (SELECT a FROM t_answers)) $$,
  'You have already submitted feedback for this session', 'second submit is rejected');
SELECT throws_ok(
  $$ SELECT submit_feedback('00000000-0000-0000-0000-0000000000c2', (SELECT a FROM t_answers)) $$,
  'This feedback window is closed', 'closed session is rejected');
SELECT is((SELECT count(*) FROM responses), 0::bigint, 'student cannot read any responses');
SELECT is((SELECT count(*) FROM submissions), 1::bigint, 'student sees only their own submission');
SELECT throws_ok($$ INSERT INTO responses (session_id, answers) VALUES ('00000000-0000-0000-0000-0000000000c1', '{}') $$,
  '42501', NULL, 'student cannot insert responses directly');

SELECT set_config('request.jwt.claims', '{"email":"student3@test.local"}', true);
SELECT throws_ok(
  $$ SELECT submit_feedback('00000000-0000-0000-0000-0000000000c1', (SELECT a FROM t_answers)) $$,
  'You are not enrolled in this batch', 'student of another batch is rejected');

-- ---------------------------------------------------------------- CC scope
SELECT set_config('request.jwt.claims', '{"email":"cc@test.local"}', true);
SELECT is((SELECT count(*) FROM responses), 1::bigint, 'Mumbai CC reads responses of own batch');

-- Session with feedback cannot be deleted (RLS filters it out, nothing deleted).
DELETE FROM feedback_sessions WHERE id = '00000000-0000-0000-0000-0000000000c1';
SELECT is((SELECT count(*) FROM feedback_sessions WHERE id = '00000000-0000-0000-0000-0000000000c1'),
  1::bigint, 'session with submissions survives delete');
SELECT throws_ok($$ UPDATE feedback_sessions SET questions = '[]' WHERE id = '00000000-0000-0000-0000-0000000000c1' $$,
  '42501', NULL, 'CC cannot rewrite the question snapshot');

SELECT set_config('request.jwt.claims', '{"email":"cc.atc@test.local"}', true);
SELECT is((SELECT count(*) FROM responses) + (SELECT count(*) FROM feedback_sessions), 0::bigint,
  'ATC CC sees nothing of the Mumbai batch');
SELECT throws_ok(
  $$ INSERT INTO student_roster (email, prn, full_name, batch_id)
     VALUES ('x@test.local', 'PRNX', 'X', '00000000-0000-0000-0000-0000000000b1') $$,
  '42501', NULL, 'ATC CC cannot add students to the Mumbai batch');

SELECT * FROM finish();
ROLLBACK;
