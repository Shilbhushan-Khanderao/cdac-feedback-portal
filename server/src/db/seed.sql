-- ============================================================================
-- C-DAC Feedback Portal Reference & Test Seed Data
-- ============================================================================

-- Centres
INSERT INTO public.centres (name, kind) VALUES 
  ('C-DAC Mumbai', 'cdac'),
  ('Test ATC', 'atc')
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
SELECT 'cc@test.local', 'Mumbai AC Coordinator', 'cc', id, NULL
  FROM public.centres WHERE name = 'C-DAC Mumbai'
ON CONFLICT (email) DO NOTHING;

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
