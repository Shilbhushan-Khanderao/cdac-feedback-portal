import { fetchAll, request } from './api';

interface StudentRosterRow {
  email: string;
  prn: string;
  full_name: string;
  batch_id: string;
  centre_id: string;
  course_id: string;
}

export const rosterApi = {
  listAll: (f: { batch_id: string; centre_id: string; course_id: string }) =>
    fetchAll((p) => rosterApi.list({ ...f, ...p }), 1000),
  list: (params?: { batch_id?: string; centre_id?: string; course_id?: string; limit?: number; offset?: number }) => {
    const q = params ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : '';
    return request<StudentRosterRow[]>(`/api/roster${q}`);
  },
  upsert: (students: Array<{ email: string; prn: string; full_name: string; batch_id: string; centre_id: string; course_id: string }>) =>
    request<{ ok: boolean; count: number }>('/api/roster/upsert', {
      method: 'POST',
      body: JSON.stringify({ students }),
    }),
};
