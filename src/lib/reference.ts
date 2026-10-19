import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/** Key for one cohort = batch + centre + course. */
export const cohortKey = (r: { batch_id: string | null; centre_id: string | null; course_id: string | null }) =>
  `${r.batch_id}|${r.centre_id}|${r.course_id}`;

export const useBatches = () =>
  useQuery({
    queryKey: ['batches'],
    queryFn: () => api.reference.batches(),
  });

export const useCentres = () =>
  useQuery({
    queryKey: ['centres'],
    queryFn: () => api.reference.centres(),
  });

export const useCourses = () =>
  useQuery({
    queryKey: ['courses'],
    queryFn: () => api.reference.courses(),
  });

export const useModules = () =>
  useQuery({
    queryKey: ['modules'],
    queryFn: () => api.reference.modules(),
  });

/** Active faculty of one centre plus shared ones. */
export const useFaculty = (centreId: string | undefined) =>
  useQuery({
    queryKey: ['faculty', 'picker', centreId],
    enabled: !!centreId,
    queryFn: async () => {
      const all = await api.reference.faculty();
      return all.filter((f: any) => !f.centre_id || f.centre_id === centreId);
    },
  });

/** Students per cohort, keyed by cohortKey(). */
export const useCohortSizes = () =>
  useQuery({
    queryKey: ['student_roster', 'sizes'],
    queryFn: () => api.reference.cohortSizes(),
    select: (rows) => new Map(rows.map((r: any) => [cohortKey(r), r.students ?? 0])),
  });
