import { useQuery } from '@tanstack/react-query';
import { useMe, type Me } from '../auth';
import { must, supabase } from './supabase';

// Mirrors can_manage() in SQL. RLS is the real guard; this only trims dropdowns.
const canManage = (me: Me, b: { centre_id: string; course_id: string }) =>
  me.role === 'admin' || (b.centre_id === me.centre_id && (!me.course_id || b.course_id === me.course_id));

/** Batches the signed-in staff member manages, with roster size. */
export function useMyBatches() {
  const me = useMe();
  return useQuery({
    queryKey: ['batches'],
    queryFn: () =>
      must(
        supabase
          .from('batches')
          .select('*, centres(name), courses(code), student_roster(count)')
          .order('label', { ascending: false }),
      ),
    select: (rows) =>
      rows
        .filter((b) => canManage(me, b))
        .map((b) => ({
          ...b,
          title: `${b.centres?.name} · ${b.courses?.code} · ${b.label}`,
          size: b.student_roster[0]?.count ?? 0,
        })),
  });
}

export const useModules = () =>
  useQuery({
    queryKey: ['modules'],
    queryFn: () => must(supabase.from('modules').select('*').eq('active', true).order('sort_order').order('name')),
  });

export const useFaculty = () =>
  useQuery({
    queryKey: ['faculty'],
    queryFn: () => must(supabase.from('faculty').select('*').eq('active', true).order('name')),
  });
