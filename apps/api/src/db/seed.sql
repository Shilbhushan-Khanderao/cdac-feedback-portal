-- ============================================================================
-- C-DAC Feedback Portal Reference & Test Seed Data
-- ============================================================================

-- Centres
INSERT INTO public.centres (name, kind) VALUES 
  ('C-DAC Mumbai', 'cdac')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.centres (name, kind, parent_id)
SELECT 'Test ATC', 'atc', id
  FROM public.centres WHERE name = 'C-DAC Mumbai'
ON CONFLICT (name) DO NOTHING;

-- Courses
INSERT INTO public.courses (code, name) VALUES
  ('PGCP-AC', 'Post Graduate Certificate Programme in Advanced Computing'),
  ('PGCP-BDA', 'Post Graduate Certificate Programme in Big Data Analytics'),
  ('PGCP-AI', 'Post Graduate Certificate Programme in Artificial Intelligence')
ON CONFLICT (code) DO NOTHING;

-- Batches
INSERT INTO public.batches (label) VALUES
  ('Aug 2026')
ON CONFLICT (label) DO NOTHING;

-- Modules for PGCP-AC
INSERT INTO public.modules (course_id, name, short_name, sort_order)
SELECT c.id, m.name, m.short_name, m.ord
  FROM public.courses c
  JOIN (VALUES
    ('PGCP-AC', 'Logic Building Session', 'LBS', 1),
    ('PGCP-AC', 'Operating Systems', 'OS', 2),
    ('PGCP-AC', 'C++ Programming', 'CPPP', 3),
    ('PGCP-AC', 'Object Oriented Programming with Java', 'OOPJ', 4),
    ('PGCP-AC', 'Algorithm & Data Structures', 'ADS', 5),
    ('PGCP-AC', 'Database Technologies', 'DBT', 6),
    ('PGCP-AC', 'Web Programming Technologies', 'WPT', 7),
    ('PGCP-AC', 'Web Java Programming', 'WJP', 8),
    ('PGCP-AC', 'Microsoft DotNet', 'DotNet', 9),
    ('PGCP-AC', 'Software Development Methodologies', 'SDM', 10),
    ('PGCP-AC', 'Aptitude', 'Aptitude', 11),
    ('PGCP-AC', 'Effective Communication', 'Communication', 12)
  ) AS m(course_code, name, short_name, ord) ON m.course_code = c.code
ON CONFLICT (course_id, name) DO NOTHING;

-- Modules for PGCP-AI
INSERT INTO public.modules (course_id, name, short_name, sort_order)
SELECT c.id, m.name, m.short_name, m.ord
  FROM public.courses c
  JOIN (VALUES
    ('PGCP-AI', 'Fundamentals of AI & Mathematics for AI', 'FAI & MAI', 1),
    ('PGCP-AI', 'Advanced Programming for AI(Java Programming)', 'APAI(Java)', 2),
    ('PGCP-AI', 'Advanced Programming for AI(Advanced Programming using Python)', 'APAI(Python)', 3),
    ('PGCP-AI', 'Practical Machine Learning', 'PML', 4),
    ('PGCP-AI', 'Data Analytics', 'Data Analytics', 5),
    ('PGCP-AI', 'Deep Neural Networks', 'DNN', 6),
    ('PGCP-AI', 'Natural Language Processing & Computer Vision', 'NLP & CV', 7),
    ('PGCP-AI', 'AI Compute Platforms, Applications & Trends', 'AI & Trends', 8),
    ('PGCP-AI', 'Aptitude', 'Aptitude', 9),
    ('PGCP-AI', 'Effective Communication', 'Communication', 10)
  ) AS m(course_code, name, short_name, ord) ON m.course_code = c.code
ON CONFLICT (course_id, name) DO NOTHING;

-- Modules for PGCP-BDA
INSERT INTO public.modules (course_id, name, short_name, sort_order)
SELECT c.id, m.name, m.short_name, m.ord
  FROM public.courses c
  JOIN (VALUES
    ('Linux Programming and Cloud Computing', 'LPCC', 1),
    ('Python and R Programming', 'Python & R', 2),
    ('Java Programming', 'Java', 3),
    ('Advanced Analytics using Statistics', 'AAS', 4),
    ('Data Collection and DBMS (Principles, Tools & Platforms)', 'DBMS', 5),
    ('Big Data Technologies', 'BDT', 6),
    ('Data Visualization - Analysis and Reporting', 'DV', 7),
    ('Practical Machine Learning', 'PML', 8),
    ('Aptitude', 'Aptitude', 9),
    ('Effective Communication', 'Communication', 10)
  ) AS m(name, short_name, ord) ON true
 WHERE c.code = 'PGCP-BDA'
ON CONFLICT (course_id, name) DO NOTHING;

-- Questions Template
INSERT INTO public.questions (id, sort_order, text, kind, options) VALUES
  ('explanation', 1, 'Explanation of concepts', 'choice', '{Excellent,Very Good,Good,Average,Poor}'),
  ('pace', 2, 'Pace of teaching', 'choice', '{Very Fast,Fast,Normal,Slow,Very Slow}'),
  ('interaction', 3, 'Interaction and doubt solving', 'choice', '{Excellent,Very Good,Good,Average,Poor}'),
  ('practical', 4, 'Practical / lab sessions', 'choice', '{Excellent,Very Good,Good,Average,Poor}'),
  ('overall', 5, 'Overall rating of the module', 'choice', '{Excellent,Very Good,Good,Average,Poor}'),
  ('theory_comments', 6, 'Comments on Theory sessions', 'text', '{}'),
  ('lab_comments', 7, 'Comments on Lab sessions', 'text', '{}')
ON CONFLICT (id) DO UPDATE SET
  text = EXCLUDED.text,
  options = EXCLUDED.options;

-- Test Staff Roster
INSERT INTO public.staff_roster (email, full_name, role, centre_id, course_id)
SELECT 'admin@test.local', 'Central Admin', 'admin', NULL, NULL
ON CONFLICT (email) DO NOTHING;

INSERT INTO public.staff_roster (email, full_name, role, centre_id, course_id)
SELECT 'cc@test.local', 'Mumbai AC Coordinator', 'cc', cen.id, co.id
  FROM public.centres cen, public.courses co
 WHERE cen.name = 'C-DAC Mumbai' AND co.code = 'PGCP-AC'
ON CONFLICT (email) DO UPDATE SET course_id = EXCLUDED.course_id, centre_id = EXCLUDED.centre_id;

INSERT INTO public.staff_roster (email, full_name, role, centre_id, course_id)
SELECT 'cc.atc@test.local', 'ATC Coordinator', 'cc', id, NULL
  FROM public.centres WHERE name = 'Test ATC'
ON CONFLICT (email) DO NOTHING;

-- Test Student Roster
INSERT INTO public.student_roster (email, prn, full_name, batch_id, centre_id, course_id)
SELECT 'student1@test.local', 'PRN001', 'Alice Student', b.id, cen.id, co.id
  FROM public.batches b, public.centres cen, public.courses co
 WHERE b.label = 'Aug 2026' AND cen.name = 'C-DAC Mumbai' AND co.code = 'PGCP-AC'
ON CONFLICT (email) DO NOTHING;

INSERT INTO public.student_roster (email, prn, full_name, batch_id, centre_id, course_id)
SELECT 'student2@test.local', 'PRN002', 'Bob Student', b.id, cen.id, co.id
  FROM public.batches b, public.centres cen, public.courses co
 WHERE b.label = 'Aug 2026' AND cen.name = 'C-DAC Mumbai' AND co.code = 'PGCP-AC'
ON CONFLICT (email) DO NOTHING;

INSERT INTO public.student_roster (email, prn, full_name, batch_id, centre_id, course_id)
SELECT 'student3@test.local', 'PRN003', 'Charlie ATC Student', b.id, cen.id, co.id
  FROM public.batches b, public.centres cen, public.courses co
 WHERE b.label = 'Aug 2026' AND cen.name = 'Test ATC' AND co.code = 'PGCP-AC'
ON CONFLICT (email) DO NOTHING;

-- Test Feedback Sessions
INSERT INTO public.feedback_sessions (id, batch_id, centre_id, course_id, module_id, faculty, opens_at, closes_at)
SELECT '00000000-0000-0000-0000-0000000000c1'::uuid, b.id, cen.id, co.id, m.id, '{Test Faculty Mumbai}'::text[],
       now() - interval '1 day', now() + interval '7 days'
  FROM public.batches b, public.centres cen, public.courses co, public.modules m
 WHERE b.label = 'Aug 2026' AND cen.name = 'C-DAC Mumbai' AND co.code = 'PGCP-AC' AND m.short_name = 'LBS' AND m.course_id = co.id
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.feedback_sessions (id, batch_id, centre_id, course_id, module_id, faculty, opens_at, closes_at)
SELECT '00000000-0000-0000-0000-0000000000c2'::uuid, b.id, cen.id, co.id, m.id, '{Test Faculty Mumbai}'::text[],
       now() - interval '10 days', now() - interval '3 days'
  FROM public.batches b, public.centres cen, public.courses co, public.modules m
 WHERE b.label = 'Aug 2026' AND cen.name = 'C-DAC Mumbai' AND co.code = 'PGCP-AC' AND m.short_name = 'OS' AND m.course_id = co.id
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.feedback_sessions (id, batch_id, centre_id, course_id, module_id, faculty, opens_at, closes_at)
SELECT '00000000-0000-0000-0000-0000000000c3'::uuid, b.id, cen.id, co.id, m.id, '{Test Faculty ATC}'::text[],
       now() - interval '1 day', now() + interval '7 days'
  FROM public.batches b, public.centres cen, public.courses co, public.modules m
 WHERE b.label = 'Aug 2026' AND cen.name = 'Test ATC' AND co.code = 'PGCP-AC' AND m.short_name = 'LBS' AND m.course_id = co.id
ON CONFLICT (id) DO NOTHING;

-- Seed student1 submission on session c1
INSERT INTO public.submissions (session_id, email)
VALUES ('00000000-0000-0000-0000-0000000000c1', 'student1@test.local')
ON CONFLICT DO NOTHING;

INSERT INTO public.responses (session_id, answers)
VALUES ('00000000-0000-0000-0000-0000000000c1', '{"explanation":"Good","pace":"Normal","interaction":"Good","practical":"Good","overall":"Good"}'::jsonb);

-- ============================================================================
-- RICH REALISTIC DEMO DATA POPULATION (Centres, Courses, Batches, Faculty, Roster, Sessions)
-- ============================================================================

-- Additional Centres
INSERT INTO public.centres (name, kind) VALUES
  ('C-DAC ACTS Pune', 'cdac'),
  ('C-DAC Bangalore', 'cdac'),
  ('C-DAC Hyderabad', 'cdac'),
  ('C-DAC Noida', 'cdac')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.centres (name, kind, parent_id)
SELECT 'Sunbeam Institute Pune', 'atc', id
  FROM public.centres WHERE name = 'C-DAC ACTS Pune'
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.centres (name, kind, parent_id)
SELECT 'MET Institute Mumbai', 'atc', id
  FROM public.centres WHERE name = 'C-DAC Mumbai'
ON CONFLICT (name) DO NOTHING;

-- Additional Courses
INSERT INTO public.courses (code, name) VALUES
  ('PG-DESD', 'Post Graduate Diploma in Embedded Systems Design'),
  ('PG-DITISS', 'Post Graduate Diploma in IT Infrastructure, Systems & Security')
ON CONFLICT (code) DO NOTHING;

-- Additional Batches
INSERT INTO public.batches (label) VALUES
  ('Mar 2026'),
  ('Feb 2027')
ON CONFLICT (label) DO NOTHING;

-- Modules for PG-DESD
INSERT INTO public.modules (course_id, name, short_name, sort_order)
SELECT c.id, m.name, m.short_name, m.ord
  FROM public.courses c
  JOIN (VALUES
    ('Embedded C & Data Structures', 'ECDS', 1),
    ('Microcontrollers & Hardware Interfacing', 'MCHI', 2),
    ('Embedded Linux & Device Drivers', 'ELDD', 3),
    ('Real Time Operating Systems', 'RTOS', 4),
    ('IoT Protocols & Networking', 'IoT', 5),
    ('Aptitude', 'Aptitude', 6),
    ('Effective Communication', 'Communication', 7)
  ) AS m(name, short_name, ord) ON true
 WHERE c.code = 'PG-DESD'
ON CONFLICT (course_id, name) DO NOTHING;

-- Faculty Members (Shared & Centre Specific)
INSERT INTO public.faculty (name, centre_id, active) VALUES
  ('Dr. Rajesh Sharma', NULL, true),
  ('Rahul Verma', NULL, true),
  ('Prof. Amit Kulkarni', (SELECT id FROM public.centres WHERE name = 'C-DAC ACTS Pune'), true),
  ('Vivek Deshmukh', (SELECT id FROM public.centres WHERE name = 'C-DAC ACTS Pune'), true),
  ('Manoj Joshi', (SELECT id FROM public.centres WHERE name = 'C-DAC ACTS Pune'), true),
  ('Sunita Saxena', (SELECT id FROM public.centres WHERE name = 'C-DAC ACTS Pune'), true),
  ('Smita Patil', (SELECT id FROM public.centres WHERE name = 'C-DAC Mumbai'), true),
  ('Neha Kulkarni', (SELECT id FROM public.centres WHERE name = 'C-DAC Mumbai'), true),
  ('Vikram Seth', (SELECT id FROM public.centres WHERE name = 'C-DAC Mumbai'), true),
  ('Dr. Sneha Rao', (SELECT id FROM public.centres WHERE name = 'C-DAC Bangalore'), true),
  ('Pooja Bhatt', (SELECT id FROM public.centres WHERE name = 'C-DAC Bangalore'), true),
  ('Arvind Kumar', (SELECT id FROM public.centres WHERE name = 'C-DAC Hyderabad'), true)
ON CONFLICT DO NOTHING;

-- Realistic Staff Coordinators with Specific Course Assignments
INSERT INTO public.staff_roster (email, full_name, role, centre_id, course_id) VALUES
  ('admin@cdac.in', 'Central Academic Director', 'admin', NULL, NULL),
  ('cc.dac.pune@cdac.in', 'Pune DAC Coordinator', 'cc', (SELECT id FROM public.centres WHERE name = 'C-DAC ACTS Pune'), (SELECT id FROM public.courses WHERE code = 'PGCP-AC')),
  ('cc.bda.pune@cdac.in', 'Pune BDA Coordinator', 'cc', (SELECT id FROM public.centres WHERE name = 'C-DAC ACTS Pune'), (SELECT id FROM public.courses WHERE code = 'PGCP-BDA')),
  ('cc.ai.pune@cdac.in', 'Pune AI Coordinator', 'cc', (SELECT id FROM public.centres WHERE name = 'C-DAC ACTS Pune'), (SELECT id FROM public.courses WHERE code = 'PGCP-AI')),
  ('cc.mumbai@cdac.in', 'Mumbai AC Coordinator', 'cc', (SELECT id FROM public.centres WHERE name = 'C-DAC Mumbai'), (SELECT id FROM public.courses WHERE code = 'PGCP-AC')),
  ('cc.bangalore@cdac.in', 'Bangalore AI Coordinator', 'cc', (SELECT id FROM public.centres WHERE name = 'C-DAC Bangalore'), (SELECT id FROM public.courses WHERE code = 'PGCP-AI'))
ON CONFLICT (email) DO UPDATE SET
  centre_id = EXCLUDED.centre_id,
  course_id = EXCLUDED.course_id;

-- Seed Diverse Student Cohorts (50+ students across Pune, Mumbai, Bangalore)
DO $$
DECLARE
  v_batch_aug UUID;
  v_batch_mar UUID;
  v_pune UUID;
  v_mumbai UUID;
  v_bangalore UUID;
  v_dac UUID;
  v_bda UUID;
  v_ai UUID;
  i INT;
BEGIN
  SELECT id INTO v_batch_aug FROM public.batches WHERE label = 'Aug 2026';
  SELECT id INTO v_batch_mar FROM public.batches WHERE label = 'Mar 2026';
  SELECT id INTO v_pune FROM public.centres WHERE name = 'C-DAC ACTS Pune';
  SELECT id INTO v_mumbai FROM public.centres WHERE name = 'C-DAC Mumbai';
  SELECT id INTO v_bangalore FROM public.centres WHERE name = 'C-DAC Bangalore';
  SELECT id INTO v_dac FROM public.courses WHERE code = 'PGCP-AC';
  SELECT id INTO v_bda FROM public.courses WHERE code = 'PGCP-BDA';
  SELECT id INTO v_ai FROM public.courses WHERE code = 'PGCP-AI';

  -- 1. 20 Students in Pune PGCP-AC
  FOR i IN 1..20 LOOP
    INSERT INTO public.student_roster (email, prn, full_name, batch_id, centre_id, course_id)
    VALUES (
      format('pune.student%s@test.local', lpad(i::text, 2, '0')),
      format('PUN26AC%s', lpad(i::text, 3, '0')),
      format('Student Pune %s', i),
      v_batch_aug, v_pune, v_dac
    ) ON CONFLICT (email) DO NOTHING;
  END LOOP;

  -- 2. 15 Students in Mumbai PGCP-AC
  FOR i IN 1..15 LOOP
    INSERT INTO public.student_roster (email, prn, full_name, batch_id, centre_id, course_id)
    VALUES (
      format('mumbai.student%s@test.local', lpad(i::text, 2, '0')),
      format('MUM26AC%s', lpad(i::text, 3, '0')),
      format('Student Mumbai %s', i),
      v_batch_aug, v_mumbai, v_dac
    ) ON CONFLICT (email) DO NOTHING;
  END LOOP;

  -- 3. 15 Students in Pune PGCP-BDA
  FOR i IN 1..15 LOOP
    INSERT INTO public.student_roster (email, prn, full_name, batch_id, centre_id, course_id)
    VALUES (
      format('bda.student%s@test.local', lpad(i::text, 2, '0')),
      format('PUN26BD%s', lpad(i::text, 3, '0')),
      format('Student BDA %s', i),
      v_batch_aug, v_pune, v_bda
    ) ON CONFLICT (email) DO NOTHING;
  END LOOP;

  -- 4. 12 Students in Bangalore PGCP-AI
  FOR i IN 1..12 LOOP
    INSERT INTO public.student_roster (email, prn, full_name, batch_id, centre_id, course_id)
    VALUES (
      format('ai.student%s@test.local', lpad(i::text, 2, '0')),
      format('BLR26AI%s', lpad(i::text, 3, '0')),
      format('Student AI %s', i),
      v_batch_aug, v_bangalore, v_ai
    ) ON CONFLICT (email) DO NOTHING;
  END LOOP;
END;
$$;

-- Seed Feedback Sessions with Rich Activity (Closed, Open, Upcoming)
DO $$
DECLARE
  v_batch_aug UUID;
  v_pune UUID;
  v_mumbai UUID;
  v_bangalore UUID;
  v_dac UUID;
  v_bda UUID;
  v_ai UUID;

  v_mod_cppp UUID;
  v_mod_dbt UUID;
  v_mod_oopj UUID;
  v_mod_ads UUID;
  v_mod_py_bda UUID;
  v_mod_fai UUID;

  v_sess_cppp UUID := '11111111-0000-0000-0000-000000000001'::uuid;
  v_sess_dbt UUID  := '11111111-0000-0000-0000-000000000002'::uuid;
  v_sess_oopj UUID := '11111111-0000-0000-0000-000000000003'::uuid;
  v_sess_ads UUID  := '11111111-0000-0000-0000-000000000004'::uuid;
  v_sess_bda UUID  := '11111111-0000-0000-0000-000000000005'::uuid;
  v_sess_fai UUID  := '11111111-0000-0000-0000-000000000006'::uuid;

  j INT;
  v_email CITEXT;
  v_ans JSONB;
  v_ratings TEXT[] := ARRAY['Excellent', 'Very Good', 'Good', 'Average'];
  v_paces TEXT[] := ARRAY['Normal', 'Normal', 'Normal', 'Fast', 'Slow'];
  v_comments TEXT[] := ARRAY[
    'Clear explanation of OOP concepts with live code walkthroughs.',
    'Very lucid explanation of C++ pointers, references, and memory allocation.',
    'Lab exercises were challenging and well-structured, doubt sessions were very helpful.',
    'Practical demonstrations of database query optimization and indexing helped immensely.',
    'Great hands-on practice with normalization and transaction isolation levels.',
    'Pandas, NumPy, and Scikit-Learn pipelines were taught with real-world datasets.',
    'Matrix decompositions and eigenvalues concept clarity was outstanding.',
    'The pace was well balanced and interactive demonstrations cleared all doubts.',
    'Appreciated extra time spent on memory debugging with Valgrind and GDB.',
    'Comprehensive assignments that helped bridge theory and implementation.'
  ];
BEGIN
  SELECT id INTO v_batch_aug FROM public.batches WHERE label = 'Aug 2026';
  SELECT id INTO v_pune FROM public.centres WHERE name = 'C-DAC ACTS Pune';
  SELECT id INTO v_mumbai FROM public.centres WHERE name = 'C-DAC Mumbai';
  SELECT id INTO v_bangalore FROM public.centres WHERE name = 'C-DAC Bangalore';
  SELECT id INTO v_dac FROM public.courses WHERE code = 'PGCP-AC';
  SELECT id INTO v_bda FROM public.courses WHERE code = 'PGCP-BDA';
  SELECT id INTO v_ai FROM public.courses WHERE code = 'PGCP-AI';

  SELECT id INTO v_mod_cppp FROM public.modules WHERE course_id = v_dac AND short_name = 'CPPP';
  SELECT id INTO v_mod_dbt FROM public.modules WHERE course_id = v_dac AND short_name = 'DBT';
  SELECT id INTO v_mod_oopj FROM public.modules WHERE course_id = v_dac AND short_name = 'OOPJ';
  SELECT id INTO v_mod_ads FROM public.modules WHERE course_id = v_dac AND short_name = 'ADS';
  SELECT id INTO v_mod_py_bda FROM public.modules WHERE course_id = v_bda AND short_name = 'Python & R';
  SELECT id INTO v_mod_fai FROM public.modules WHERE course_id = v_ai AND short_name = 'FAI & MAI';

  -- Session 1: Closed - CPPP (Pune PGCP-AC) - 18 responses
  INSERT INTO public.feedback_sessions (id, batch_id, centre_id, course_id, module_id, faculty, opens_at, closes_at)
  VALUES (v_sess_cppp, v_batch_aug, v_pune, v_dac, v_mod_cppp, '{Prof. Amit Kulkarni, Vivek Deshmukh}', now() - interval '14 days', now() - interval '2 days')
  ON CONFLICT (id) DO NOTHING;

  -- Session 2: Closed - DBT (Mumbai PGCP-AC) - 14 responses
  INSERT INTO public.feedback_sessions (id, batch_id, centre_id, course_id, module_id, faculty, opens_at, closes_at)
  VALUES (v_sess_dbt, v_batch_aug, v_mumbai, v_dac, v_mod_dbt, '{Smita Patil}', now() - interval '10 days', now() - interval '1 day')
  ON CONFLICT (id) DO NOTHING;

  -- Session 3: Closed - Python & R (Pune PGCP-BDA) - 12 responses
  INSERT INTO public.feedback_sessions (id, batch_id, centre_id, course_id, module_id, faculty, opens_at, closes_at)
  VALUES (v_sess_bda, v_batch_aug, v_pune, v_bda, v_mod_py_bda, '{Dr. Rajesh Sharma, Sunita Saxena}', now() - interval '8 days', now() - interval '1 day')
  ON CONFLICT (id) DO NOTHING;

  -- Session 4: Closed - FAI & MAI (Bangalore PGCP-AI) - 10 responses
  INSERT INTO public.feedback_sessions (id, batch_id, centre_id, course_id, module_id, faculty, opens_at, closes_at)
  VALUES (v_sess_fai, v_batch_aug, v_bangalore, v_ai, v_mod_fai, '{Dr. Sneha Rao}', now() - interval '6 days', now() - interval '1 day')
  ON CONFLICT (id) DO NOTHING;

  -- Session 5: Open - OOPJ (Pune PGCP-AC) - Active window
  INSERT INTO public.feedback_sessions (id, batch_id, centre_id, course_id, module_id, faculty, opens_at, closes_at)
  VALUES (v_sess_oopj, v_batch_aug, v_pune, v_dac, v_mod_oopj, '{Manoj Joshi}', now() - interval '1 day', now() + interval '5 days')
  ON CONFLICT (id) DO NOTHING;

  -- Session 6: Upcoming Scheduled - ADS (Pune PGCP-AC)
  INSERT INTO public.feedback_sessions (id, batch_id, centre_id, course_id, module_id, faculty, opens_at, closes_at)
  VALUES (v_sess_ads, v_batch_aug, v_pune, v_dac, v_mod_ads, '{Prof. Amit Kulkarni}', now() + interval '7 days', now() + interval '14 days')
  ON CONFLICT (id) DO NOTHING;

  -- Populate responses for Session 1 (CPPP Pune - 18 students)
  FOR j IN 1..18 LOOP
    v_email := format('pune.student%s@test.local', lpad(j::text, 2, '0'));
    INSERT INTO public.submissions (session_id, email) VALUES (v_sess_cppp, v_email) ON CONFLICT DO NOTHING;
    
    v_ans := jsonb_build_object(
      'explanation', v_ratings[1 + (j % 3)],
      'pace', v_paces[1 + (j % 5)],
      'interaction', v_ratings[1 + ((j + 1) % 4)],
      'practical', v_ratings[1 + (j % 2)],
      'overall', v_ratings[1 + (j % 3)],
      'theory_comments', v_comments[1 + (j % array_length(v_comments, 1))],
      'lab_comments', 'Hands-on debugging and syntax error analysis was conducted very well.'
    );
    INSERT INTO public.responses (session_id, answers) VALUES (v_sess_cppp, v_ans);
  END LOOP;

  -- Populate responses for Session 2 (DBT Mumbai - 13 students)
  FOR j IN 1..13 LOOP
    v_email := format('mumbai.student%s@test.local', lpad(j::text, 2, '0'));
    INSERT INTO public.submissions (session_id, email) VALUES (v_sess_dbt, v_email) ON CONFLICT DO NOTHING;
    
    v_ans := jsonb_build_object(
      'explanation', v_ratings[1 + ((j + 1) % 3)],
      'pace', v_paces[1 + (j % 5)],
      'interaction', v_ratings[1 + (j % 3)],
      'practical', v_ratings[1 + ((j + 2) % 3)],
      'overall', v_ratings[1 + ((j + 1) % 3)],
      'theory_comments', v_comments[1 + ((j + 3) % array_length(v_comments, 1))],
      'lab_comments', 'SQL joins, subqueries, and stored procedure assignments were great.'
    );
    INSERT INTO public.responses (session_id, answers) VALUES (v_sess_dbt, v_ans);
  END LOOP;

  -- Populate responses for Session 3 (BDA Python - 11 students)
  FOR j IN 1..11 LOOP
    v_email := format('bda.student%s@test.local', lpad(j::text, 2, '0'));
    INSERT INTO public.submissions (session_id, email) VALUES (v_sess_bda, v_email) ON CONFLICT DO NOTHING;
    
    v_ans := jsonb_build_object(
      'explanation', v_ratings[1 + (j % 2)],
      'pace', 'Normal',
      'interaction', v_ratings[1 + (j % 3)],
      'practical', v_ratings[1 + (j % 2)],
      'overall', v_ratings[1 + (j % 2)],
      'theory_comments', v_comments[1 + ((j + 5) % array_length(v_comments, 1))],
      'lab_comments', 'Python data wrangling assignments were very practical.'
    );
    INSERT INTO public.responses (session_id, answers) VALUES (v_sess_bda, v_ans);
  END LOOP;

  -- Populate responses for Session 4 (AI FAI - 9 students)
  FOR j IN 1..9 LOOP
    v_email := format('ai.student%s@test.local', lpad(j::text, 2, '0'));
    INSERT INTO public.submissions (session_id, email) VALUES (v_sess_fai, v_email) ON CONFLICT DO NOTHING;
    
    v_ans := jsonb_build_object(
      'explanation', v_ratings[1 + (j % 3)],
      'pace', 'Normal',
      'interaction', v_ratings[1 + ((j + 1) % 3)],
      'practical', v_ratings[1 + (j % 3)],
      'overall', v_ratings[1 + (j % 3)],
      'theory_comments', v_comments[1 + ((j + 7) % array_length(v_comments, 1))],
      'lab_comments', 'Linear algebra, matrix computations, and calculus concepts were lucid.'
    );
    INSERT INTO public.responses (session_id, answers) VALUES (v_sess_fai, v_ans);
  END LOOP;

  -- Populate partial responses for Session 5 (Open session OOPJ - 10 students submitted so far)
  FOR j IN 1..10 LOOP
    v_email := format('pune.student%s@test.local', lpad(j::text, 2, '0'));
    INSERT INTO public.submissions (session_id, email) VALUES (v_sess_oopj, v_email) ON CONFLICT DO NOTHING;
    
    v_ans := jsonb_build_object(
      'explanation', v_ratings[1 + (j % 3)],
      'pace', 'Normal',
      'interaction', v_ratings[1 + (j % 2)],
      'practical', v_ratings[1 + (j % 3)],
      'overall', v_ratings[1 + (j % 3)],
      'theory_comments', 'Great coverage of inheritance, interfaces, and collections framework.',
      'lab_comments', 'Exception handling and file I/O lab examples were clear.'
    );
    INSERT INTO public.responses (session_id, answers) VALUES (v_sess_oopj, v_ans);
  END LOOP;
END;
$$;
