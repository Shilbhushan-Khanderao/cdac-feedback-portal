import { useQuery } from '@tanstack/react-query';
import type { Me } from '../auth';
import { must, supabase } from './supabase';

// Mirrors can_manage() in SQL. RLS is the real guard; this only trims dropdowns.
export const canManage = (me: Me, centreId: string, courseId: string) =>
  me.role === 'admin' || (centreId === me.centre_id && (!me.course_id || courseId === me.course_id));

/** Key for one cohort = batch + centre + course. */
export const cohortKey = (r: { batch_id: string | null; centre_id: string | null; course_id: string | null }) =>
  `${r.batch_id}|${r.centre_id}|${r.course_id}`;

export const useBatches = () =>
  useQuery({
    queryKey: ['batches'],
    queryFn: () => must(supabase.from('batches').select('*').order('label', { ascending: false })),
  });

export const useCentres = () =>
  useQuery({ queryKey: ['centres'], queryFn: () => must(supabase.from('centres').select('*').order('name')) });

export const useCourses = () =>
  useQuery({ queryKey: ['courses'], queryFn: () => must(supabase.from('courses').select('*').order('code')) });

export const useModules = () =>
  useQuery({
    queryKey: ['modules'],
    queryFn: () => must(supabase.from('modules').select('*').eq('active', true).order('sort_order').order('name')),
  });

/** Active faculty of one centre plus shared ones (centre_id NULL). */
export const useFaculty = (centreId: string | undefined) =>
  useQuery({
    queryKey: ['faculty', 'picker', centreId],
    enabled: !!centreId,
    queryFn: () =>
      must(
        supabase
          .from('faculty')
          .select('*')
          .eq('active', true)
          .or(`centre_id.is.null,centre_id.eq.${centreId}`)
          .order('name'),
      ),
  });

/** Students per cohort, keyed by cohortKey(). */
export const useCohortSizes = () =>
  useQuery({
    queryKey: ['student_roster', 'sizes'],
    queryFn: () => must(supabase.from('cohort_sizes').select('*')),
    select: (rows) => new Map(rows.map((r) => [cohortKey(r), r.students ?? 0])),
  });
