-- ============================================================================
-- Starting reference data. Everything here is editable from the admin screen.
-- Module lists come from pie-generator-app/src/config/masterData.jsx.
-- PGCP-BDA modules were not in that list: add them from the admin screen.
-- ============================================================================

INSERT INTO public.centres (name, kind) VALUES ('C-DAC Mumbai', 'cdac');

INSERT INTO public.courses (code, name) VALUES
  ('PGCP-AC', 'Post Graduate Certificate Programme in Advanced Computing'),
  ('PGCP-BDA', 'Post Graduate Certificate Programme in Big Data Analytics'),
  ('PGCP-AI', 'Post Graduate Certificate Programme in Artificial Intelligence');

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
    ('PGCP-AC', 'Effective Communication', 'Communication', 12),
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
  ) AS m(course_code, name, short_name, ord) ON m.course_code = c.code;

-- Faculty names are not committed (public repo). See README: run supabase/private/faculty.sql
-- (gitignored) in the SQL editor, or add them under Setup > Faculty.

-- Default questions = the columns of the old feedback form. Texts keep the old
-- keywords (Explanation, Pace, ...) so the CSV export still works in v1.
INSERT INTO public.questions (id, sort_order, text, kind, options) VALUES
  ('explanation', 1, 'Explanation of concepts', 'choice', '{Excellent,Very Good,Good,Average,Poor}'),
  ('pace', 2, 'Pace of teaching', 'choice', '{Very Fast,Fast,Normal,Slow,Very Slow}'),
  ('interaction', 3, 'Interaction and doubt solving', 'choice', '{Excellent,Very Good,Good,Average,Poor}'),
  ('practical', 4, 'Practical / lab sessions', 'choice', '{Excellent,Very Good,Good,Average,Poor}'),
  ('overall', 5, 'Overall rating of the module', 'choice', '{Excellent,Very Good,Good,Average,Poor}'),
  ('theory_comments', 6, 'Comments on Theory sessions', 'text', '{}'),
  ('lab_comments', 7, 'Comments on Lab sessions', 'text', '{}');
