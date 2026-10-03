-- PGCP-BDA modules from the official C-DAC ACTS flyer (PGCP_BDA.pdf, v.2026.01, June 2026, cdac.in).
-- "Aptitude & Effective Communication" is split and "Project" left out, matching the AC/AI lists.
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
