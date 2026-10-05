/**
 * Native API Client for C-DAC Feedback Portal
 * Replaces direct supabase-js calls with hardened Fastify REST endpoints.
 */

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include', // sends signed HttpOnly session cookie
  });

  if (!res.ok) {
    let errMsg = `Request failed: ${res.status} ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson.error) errMsg = errJson.error;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }

  return res.json();
}

export const api = {
  auth: {
    whoami: () => request<{ user: any | null }>('/auth/whoami'),
    logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
    devLogin: (email: string) =>
      request<{ ok: boolean; user: any }>('/auth/dev-login', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
  },
  reference: {
    batches: () => request<any[]>('/api/reference/batches'),
    centres: () => request<any[]>('/api/reference/centres'),
    courses: () => request<any[]>('/api/reference/courses'),
    modules: () => request<any[]>('/api/reference/modules'),
    faculty: () => request<any[]>('/api/reference/faculty'),
    addFaculty: (name: string, centre_id?: string | null) =>
      request<any>('/api/reference/faculty', {
        method: 'POST',
        body: JSON.stringify({ name, centre_id }),
      }),
    cohortSizes: () => request<any[]>('/api/reference/cohort-sizes'),
  },
  sessions: {
    list: () => request<any[]>('/api/sessions'),
    get: (id: string) => request<any>(`/api/sessions/${id}`),
    create: (data: any) =>
      request<any>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateFaculty: (id: string, faculty: string[]) =>
      request<any>(`/api/sessions/${id}/faculty`, {
        method: 'PATCH',
        body: JSON.stringify({ faculty }),
      }),
    reschedule: (id: string, opens_at: string, closes_at: string) =>
      request<any>(`/api/sessions/${id}/schedule`, {
        method: 'PATCH',
        body: JSON.stringify({ opens_at, closes_at }),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/api/sessions/${id}`, {
        method: 'DELETE',
      }),
  },
  feedback: {
    mySubmissions: () => request<{ session_id: string }[]>('/api/feedback/my-submissions'),
    submissions: (sessionId: string) => request<{ email: string }[]>(`/api/feedback/submissions/${sessionId}`),
    submit: (sessionId: string, answers: Record<string, string>) =>
      request<{ ok: boolean }>('/api/feedback/submit', {
        method: 'POST',
        body: JSON.stringify({ session_id: sessionId, answers }),
      }),
  },
  reports: {
    dashboard: () => request<any[]>('/api/reports/dashboard'),
    get: (id: string) => request<any>(`/api/reports/${id}`),
  },
  roster: {
    list: (params?: { batch_id?: string; centre_id?: string; course_id?: string }) => {
      const q = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
      return request<any[]>(`/api/roster${q}`);
    },
    upsert: (students: any[]) =>
      request<{ ok: boolean; count: number }>('/api/roster/upsert', {
        method: 'POST',
        body: JSON.stringify({ students }),
      }),
  },
  tables: {
    list: (table: string, params?: Record<string, string>) => {
      const q = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<any[]>(`/api/reference/tables/${table}${q}`);
    },
    create: (table: string, data: any) =>
      request<any>(`/api/reference/tables/${table}`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (table: string, id: string, data: any, pk = 'id') =>
      request<any>(`/api/reference/tables/${table}/${encodeURIComponent(id)}?pk=${pk}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (table: string, id: string, pk = 'id') =>
      request<{ ok: boolean }>(`/api/reference/tables/${table}/${encodeURIComponent(id)}?pk=${pk}`, {
        method: 'DELETE',
      }),
  },
};
