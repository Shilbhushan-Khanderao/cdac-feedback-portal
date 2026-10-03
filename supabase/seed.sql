-- ============================================================================
-- LOCAL DEV / TEST DATA ONLY. Never applied to production (`db push` skips seed).
-- Every test user signs in with password: password
-- pgTAP tests in supabase/tests rely on the fixed ids below.
--
-- One shared batch "Aug 2026" (b1) used by both centres:
--   student1, student2  C-DAC Mumbai / PGCP-AC
--   student3            Test ATC     / PGCP-AC
--   student4            C-DAC Mumbai / PGCP-AI
-- Sessions: c1 Mumbai AC LBS (open), c2 Mumbai AC OS (closed), c3 ATC AC LBS (open)
-- ============================================================================

INSERT INTO public.centres (id, name, kind, parent_id)
SELECT '00000000-0000-0000-0000-0000000000a1', 'Test ATC', 'atc', id
  FROM public.centres WHERE name = 'C-DAC Mumbai';

INSERT INTO public.batches (id, label) VALUES ('00000000-0000-0000-0000-0000000000b1', 'Aug 2026');

CREATE TEMP TABLE ids AS SELECT
  (SELECT id FROM public.centres WHERE name = 'C-DAC Mumbai') AS mumbai,
  '00000000-0000-0000-0000-0000000000a1'::uuid AS atc,
  (SELECT id FROM public.courses WHERE code = 'PGCP-AC') AS ac,
  (SELECT id FROM public.courses WHERE code = 'PGCP-AI') AS ai,
  '00000000-0000-0000-0000-0000000000b1'::uuid AS b1;

INSERT INTO public.staff_roster (email, full_name, role, centre_id, course_id)
SELECT 'admin@test.local', 'Test Admin', 'admin', NULL::uuid, NULL::uuid FROM ids
UNION ALL SELECT 'cc@test.local', 'Test CC Mumbai AC', 'cc', mumbai, ac FROM ids
UNION ALL SELECT 'cc.atc@test.local', 'Test CC ATC', 'cc', atc, NULL FROM ids;

INSERT INTO public.student_roster (email, prn, full_name, batch_id, centre_id, course_id)
SELECT 'student1@test.local', 'PRN001', 'Student One', b1, mumbai, ac FROM ids
UNION ALL SELECT 'student2@test.local', 'PRN002', 'Student Two', b1, mumbai, ac FROM ids
UNION ALL SELECT 'student3@test.local', 'PRN003', 'Student Three', b1, atc, ac FROM ids
UNION ALL SELECT 'student4@test.local', 'PRN004', 'Student Four', b1, mumbai, ai FROM ids;

INSERT INTO public.faculty (name, centre_id)
SELECT 'Test Faculty Mumbai', mumbai FROM ids
UNION ALL SELECT 'Test Faculty ATC', atc FROM ids
UNION ALL SELECT 'Test Faculty Shared', NULL FROM ids;

INSERT INTO public.feedback_sessions (id, batch_id, centre_id, course_id, module_id, faculty, opens_at, closes_at)
SELECT s.id::uuid, ids.b1, CASE WHEN s.at_atc THEN ids.atc ELSE ids.mumbai END, ids.ac, m.id, s.faculty,
       now() + s.opens, now() + s.closes
  FROM ids, (VALUES
    ('00000000-0000-0000-0000-0000000000c1', false, 'LBS', '{Test Faculty Mumbai}'::text[], interval '-1 day', interval '7 days'),
    ('00000000-0000-0000-0000-0000000000c2', false, 'OS', '{Test Faculty Mumbai}'::text[], interval '-10 days', interval '-3 days'),
    ('00000000-0000-0000-0000-0000000000c3', true, 'LBS', '{Test Faculty ATC}'::text[], interval '-1 day', interval '7 days')
  ) AS s(id, at_atc, module, faculty, opens, closes)
  JOIN public.modules m ON m.short_name = s.module
 WHERE m.course_id = ids.ac;

DROP TABLE ids;

-- Email/password auth users (local only; production uses Google sign-in).
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, email_change, email_change_token_new, recovery_token)
SELECT '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       e, crypt('password', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  FROM unnest(ARRAY['admin@test.local', 'cc@test.local', 'cc.atc@test.local', 'student1@test.local',
                    'student2@test.local', 'student3@test.local', 'student4@test.local']) AS e;

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email),
       'email', now(), now(), now()
  FROM auth.users;
