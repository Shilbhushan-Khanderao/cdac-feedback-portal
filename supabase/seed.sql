-- ============================================================================
-- LOCAL DEV / TEST DATA ONLY. Never applied to production (`db push` skips seed).
-- Every test user signs in with password: password
-- pgTAP tests in supabase/tests rely on the fixed ids below.
-- ============================================================================

INSERT INTO public.centres (id, name, kind, parent_id)
SELECT '00000000-0000-0000-0000-0000000000a1', 'Test ATC', 'atc', id
  FROM public.centres WHERE name = 'C-DAC Mumbai';

INSERT INTO public.batches (id, centre_id, course_id, label)
SELECT '00000000-0000-0000-0000-0000000000b1', ce.id, co.id, 'Aug 2026'
  FROM public.centres ce, public.courses co
 WHERE ce.name = 'C-DAC Mumbai' AND co.code = 'PGCP-AC';

INSERT INTO public.batches (id, centre_id, course_id, label)
SELECT '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', co.id, 'Aug 2026'
  FROM public.courses co WHERE co.code = 'PGCP-AC';

INSERT INTO public.staff_roster (email, full_name, role, centre_id, course_id)
VALUES ('admin@test.local', 'Test Admin', 'admin', NULL, NULL);
INSERT INTO public.staff_roster (email, full_name, role, centre_id, course_id)
SELECT 'cc@test.local', 'Test CC Mumbai', 'cc', ce.id, co.id
  FROM public.centres ce, public.courses co
 WHERE ce.name = 'C-DAC Mumbai' AND co.code = 'PGCP-AC';
INSERT INTO public.staff_roster (email, full_name, role, centre_id, course_id)
VALUES ('cc.atc@test.local', 'Test CC ATC', 'cc', '00000000-0000-0000-0000-0000000000a1', NULL);

INSERT INTO public.student_roster (email, prn, full_name, batch_id) VALUES
  ('student1@test.local', 'PRN001', 'Student One', '00000000-0000-0000-0000-0000000000b1'),
  ('student2@test.local', 'PRN002', 'Student Two', '00000000-0000-0000-0000-0000000000b1'),
  ('student3@test.local', 'PRN003', 'Student Three', '00000000-0000-0000-0000-0000000000b2');

INSERT INTO public.faculty (name) VALUES ('Test Faculty A'), ('Test Faculty B'), ('Test Faculty C');

-- s1: open now (Mumbai batch). s2: already closed (Mumbai batch).
INSERT INTO public.feedback_sessions (id, batch_id, module_id, faculty, opens_at, closes_at)
SELECT '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', m.id,
       '{Test Faculty A}', now() - interval '1 day', now() + interval '7 days'
  FROM public.modules m JOIN public.courses c ON c.id = m.course_id
 WHERE c.code = 'PGCP-AC' AND m.short_name = 'LBS';

INSERT INTO public.feedback_sessions (id, batch_id, module_id, faculty, opens_at, closes_at)
SELECT '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1', m.id,
       '{Test Faculty B}', now() - interval '10 days', now() - interval '3 days'
  FROM public.modules m JOIN public.courses c ON c.id = m.course_id
 WHERE c.code = 'PGCP-AC' AND m.short_name = 'OS';

-- Email/password auth users (local only; production uses Google sign-in).
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, email_change, email_change_token_new, recovery_token)
SELECT '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       e, crypt('password', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  FROM unnest(ARRAY['admin@test.local', 'cc@test.local', 'cc.atc@test.local',
                    'student1@test.local', 'student2@test.local', 'student3@test.local']) AS e;

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email),
       'email', now(), now(), now()
  FROM auth.users;
