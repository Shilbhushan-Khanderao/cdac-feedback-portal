-- Security + anonymity checks. Relies on supabase/seed.sql (fresh: npm run test:db resets first).
-- c1 = Mumbai/AC open, c2 = Mumbai/AC closed, c3 = Test ATC/AC open; all in shared batch b1.
BEGIN;
SELECT plan(35);

-- Valid answers for the default template.
CREATE TEMP TABLE t_answers AS SELECT '{"explanation":"Good","pace":"Normal","interaction":"Excellent",
  "practical":"Very Good","overall":"Good","theory_comments":"Clear teaching","lab_comments":""}'::jsonb AS a;
GRANT SELECT ON t_answers TO authenticated;

-- ---------------------------------------------------------------- schema
SELECT hasnt_column('public', 'responses', 'email', 'responses has no student email');
SELECT hasnt_column('public', 'responses', 'submitted_at', 'responses has no timestamp');
SELECT hasnt_column('public', 'batches', 'centre_id', 'batches are shared across centres');
SELECT is(jsonb_array_length(questions), 7, 'session snapshots the 7 default questions')
  FROM feedback_sessions WHERE id = '00000000-0000-0000-0000-0000000000c1';
SELECT throws_ok($$ INSERT INTO batches (label) VALUES ('Aug 2026') $$, '23505', NULL, 'batch labels are unique');
SELECT is((SELECT count(*) FROM modules m JOIN courses c ON c.id = m.course_id WHERE c.code = 'PGCP-BDA'),
  10::bigint, 'PGCP-BDA has 10 modules');

-- ---------------------------------------------------------------- signup hook
SELECT is(hook_restrict_signup_to_roster('{"user":{"email":"Student1@Test.local"}}'), '{}'::jsonb,
  'hook allows a roster email (case-insensitive)');
SELECT is((hook_restrict_signup_to_roster('{"user":{"email":"stranger@gmail.com"}}') -> 'error' ->> 'http_code'),
  '403', 'hook rejects an email on no roster');

-- ---------------------------------------------------------------- student, Mumbai AC
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"email":"student2@test.local"}', true);

SELECT is((SELECT count(*) FROM feedback_sessions), 2::bigint, 'Mumbai AC student sees only the 2 Mumbai AC sessions');
SELECT throws_like(
  $$ SELECT submit_feedback('00000000-0000-0000-0000-0000000000c1', '{"explanation":"Good"}') $$,
  'Please answer:%', 'missing choice answer is rejected');
SELECT throws_like(
  $$ SELECT submit_feedback('00000000-0000-0000-0000-0000000000c1', (SELECT a || '{"overall":"Superb"}' FROM t_answers)) $$,
  'Please answer:%', 'answer outside the options is rejected');
SELECT lives_ok(
  $$ SELECT submit_feedback('00000000-0000-0000-0000-0000000000c1', (SELECT a FROM t_answers)) $$,
  'student submits to an open session of their own centre');
SELECT throws_ok(
  $$ SELECT submit_feedback('00000000-0000-0000-0000-0000000000c1', (SELECT a FROM t_answers)) $$,
  'You have already submitted feedback for this session', 'second submit is rejected');
SELECT throws_ok(
  $$ SELECT submit_feedback('00000000-0000-0000-0000-0000000000c2', (SELECT a FROM t_answers)) $$,
  'This feedback window is closed', 'closed session is rejected');
SELECT throws_ok(
  $$ SELECT submit_feedback('00000000-0000-0000-0000-0000000000c3', (SELECT a FROM t_answers)) $$,
  'You are not enrolled in this batch', 'Mumbai student cannot submit to the ATC session (same batch + course)');
SELECT is((SELECT count(*) FROM responses), 0::bigint, 'student cannot read any responses');
SELECT is((SELECT count(*) FROM submissions), 1::bigint, 'student sees only their own submission');
SELECT is((SELECT count(*) FROM faculty), 0::bigint, 'students cannot list faculty');
SELECT throws_ok($$ INSERT INTO responses (session_id, answers) VALUES ('00000000-0000-0000-0000-0000000000c1', '{}') $$,
  '42501', NULL, 'student cannot insert responses directly');

-- ---------------------------------------------------------------- other centre / other course students
SELECT set_config('request.jwt.claims', '{"email":"student3@test.local"}', true);
SELECT is((SELECT array_agg(id::text) FROM feedback_sessions), ARRAY['00000000-0000-0000-0000-0000000000c3'],
  'ATC student sees only the ATC session');
SELECT throws_ok(
  $$ SELECT submit_feedback('00000000-0000-0000-0000-0000000000c1', (SELECT a FROM t_answers)) $$,
  'You are not enrolled in this batch', 'ATC student cannot submit to the Mumbai session');
SELECT lives_ok(
  $$ SELECT submit_feedback('00000000-0000-0000-0000-0000000000c3', (SELECT a FROM t_answers)) $$,
  'ATC student submits to their own centre session');

SELECT set_config('request.jwt.claims', '{"email":"student4@test.local"}', true);
SELECT is((SELECT count(*) FROM feedback_sessions), 0::bigint, 'Mumbai AI student sees no AC sessions');
SELECT throws_ok(
  $$ SELECT submit_feedback('00000000-0000-0000-0000-0000000000c1', (SELECT a FROM t_answers)) $$,
  'You are not enrolled in this batch', 'Mumbai AI student cannot submit to the Mumbai AC session');

-- ---------------------------------------------------------------- Mumbai AC CC
SELECT set_config('request.jwt.claims', '{"email":"cc@test.local"}', true);
SELECT is((SELECT count(*) FROM responses), 1::bigint, 'Mumbai CC reads only Mumbai responses (ATC one hidden)');
DELETE FROM feedback_sessions WHERE id = '00000000-0000-0000-0000-0000000000c1';
SELECT is((SELECT count(*) FROM feedback_sessions WHERE id = '00000000-0000-0000-0000-0000000000c1'),
  1::bigint, 'session with submissions survives delete');
SELECT throws_ok($$ UPDATE feedback_sessions SET questions = '[]' WHERE id = '00000000-0000-0000-0000-0000000000c1' $$,
  '42501', NULL, 'CC cannot rewrite the question snapshot');
SELECT throws_ok($$ INSERT INTO batches (label) VALUES ('Feb 2027') $$, '42501', NULL, 'CC cannot create batches');
SELECT throws_ok(
  $$ INSERT INTO feedback_sessions (batch_id, centre_id, course_id, module_id, opens_at, closes_at)
     SELECT '00000000-0000-0000-0000-0000000000b1', centre_id, course_id,
            (SELECT m.id FROM modules m JOIN courses c ON c.id = m.course_id WHERE c.code = 'PGCP-AI' LIMIT 1),
            now(), now() + interval '1 day'
       FROM staff_roster WHERE email = 'cc@test.local' $$,
  '42501', NULL, 'session with a module from another course is rejected');
SELECT is((SELECT array_agg(name) FROM faculty), ARRAY['Test Faculty Mumbai', 'Test Faculty Shared'],
  'Mumbai CC sees Mumbai + shared faculty only');

-- ---------------------------------------------------------------- ATC CC
SELECT set_config('request.jwt.claims', '{"email":"cc.atc@test.local"}', true);
SELECT is((SELECT count(*) FROM feedback_sessions WHERE centre_id <> '00000000-0000-0000-0000-0000000000a1'), 0::bigint,
  'ATC CC sees no Mumbai sessions');
SELECT throws_ok(
  $$ INSERT INTO student_roster (email, prn, full_name, batch_id, centre_id, course_id)
     SELECT 'x@test.local', 'PRNX', 'X', '00000000-0000-0000-0000-0000000000b1'::uuid, c.id, co.id
       FROM centres c, courses co WHERE c.name = 'C-DAC Mumbai' AND co.code = 'PGCP-AC' $$,
  '42501', NULL, 'ATC CC cannot add students to Mumbai');
SELECT lives_ok($$ INSERT INTO faculty (name, centre_id) VALUES ('New ATC Faculty', '00000000-0000-0000-0000-0000000000a1') $$,
  'ATC CC adds faculty for their own centre');
SELECT throws_ok($$ INSERT INTO faculty (name, centre_id) VALUES ('Sneaky Shared', NULL) $$,
  '42501', NULL, 'CC cannot add shared faculty');
SELECT throws_ok($$ INSERT INTO faculty (name, centre_id) VALUES ('test faculty atc ', '00000000-0000-0000-0000-0000000000a1') $$,
  '23505', NULL, 'faculty names are unique ignoring case/spaces');

SELECT * FROM finish();
ROLLBACK;
