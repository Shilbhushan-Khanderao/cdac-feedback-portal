import { useQuery } from '@tanstack/react-query';
import { referenceApi } from './api';

/** Key for one cohort = batch + centre + course. */
export const cohortKey = (r: { batch_id: string | null; centre_id: string | null; course_id: string | null }) =>
  `${r.batch_id}|${r.centre_id}|${r.course_id}`;

export const useBatches = () =>
  useQuery({
    queryKey: ['batches'],
    queryFn: () => referenceApi.batches(),
  });

export const useCentres = () =>
  useQuery({
    queryKey: ['centres'],
    queryFn: () => referenceApi.centres(),
  });

export const useCourses = () =>
  useQuery({
    queryKey: ['courses'],
    queryFn: () => referenceApi.courses(),
  });

export const useModules = () =>
  useQuery({
    queryKey: ['modules'],
    queryFn: () => referenceApi.modules(),
  });

/** Active faculty of one centre plus shared ones. */
export const useFaculty = (centreId: string | undefined) =>
  useQuery({
    queryKey: ['faculty', 'picker', centreId],
    enabled: !!centreId,
    queryFn: async () => {
      const all = await referenceApi.faculty();
      return all.filter((f) => !f.centre_id || f.centre_id === centreId);
    },
  });

/** Students per cohort, keyed by cohortKey(). */
export const useCohortSizes = () =>
  useQuery({
    queryKey: ['student_roster', 'sizes'],
    queryFn: () => referenceApi.cohortSizes(),
    select: (rows) => new Map(rows.map((r) => [cohortKey(r), r.students ?? 0])),
  });
