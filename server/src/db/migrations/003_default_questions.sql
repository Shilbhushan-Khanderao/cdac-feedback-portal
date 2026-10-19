-- Default feedback questionnaire (reference data, not test data; safe in production).
INSERT INTO public.questions (id, sort_order, text, kind, options) VALUES
  ('explanation', 1, 'Explanation of concepts', 'choice', '{Excellent,Very Good,Good,Average,Poor}'),
  ('pace', 2, 'Pace of teaching', 'choice', '{Very Fast,Fast,Normal,Slow,Very Slow}'),
  ('interaction', 3, 'Interaction and doubt solving', 'choice', '{Excellent,Very Good,Good,Average,Poor}'),
  ('practical', 4, 'Practical / lab sessions', 'choice', '{Excellent,Very Good,Good,Average,Poor}'),
  ('overall', 5, 'Overall rating of the module', 'choice', '{Excellent,Very Good,Good,Average,Poor}'),
  ('theory_comments', 6, 'Comments on Theory sessions', 'text', '{}'),
  ('lab_comments', 7, 'Comments on Lab sessions', 'text', '{}')
ON CONFLICT (id) DO NOTHING;
