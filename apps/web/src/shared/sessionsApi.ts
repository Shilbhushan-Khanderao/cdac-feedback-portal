import { request } from './api';

interface SessionListItem {
  id: string;
  batch_id: string;
  centre_id: string;
  course_id: string;
  module_id: string;
  faculty: string[];
  questions?: unknown[];
  question_count?: number;
  opens_at: string;
  closes_at: string;
  created_by?: string;
  created_at?: string;
  modules?: { name: string; short_name?: string | null };
  batches?: { label: string };
  centres?: { name: string };
  courses?: { code: string };
  submissions?: Array<{ session_id?: string; email?: string }>;
}

export interface CreateSessionPayload {
  batch_id: string;
  centre_id: string;
  course_id: string;
  module_id: string;
  faculty: string[];
  opens_at: string;
  closes_at: string;
}

export const sessionsApi = {
  list: (params?: { limit?: number; offset?: number }) => {
    const q = params ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : '';
    return request<SessionListItem[]>(`/api/sessions${q}`);
  },
  get: (id: string) => request<SessionListItem>(`/api/sessions/${id}`),
  create: (data: CreateSessionPayload | CreateSessionPayload[]) =>
    request<SessionListItem | SessionListItem[]>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateFaculty: (id: string, faculty: string[]) =>
    request<SessionListItem>(`/api/sessions/${id}/faculty`, {
      method: 'PATCH',
      body: JSON.stringify({ faculty }),
    }),
  reschedule: (id: string, opens_at: string, closes_at: string) =>
    request<SessionListItem>(`/api/sessions/${id}/schedule`, {
      method: 'PATCH',
      body: JSON.stringify({ opens_at, closes_at }),
    }),
  delete: (id: string) =>
    request<{ ok: boolean }>(`/api/sessions/${id}`, {
      method: 'DELETE',
    }),
};
