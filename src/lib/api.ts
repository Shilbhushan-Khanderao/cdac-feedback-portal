/**
 * Native API Client for C-DAC Feedback Portal
 * Hardened REST client with comprehensive TypeScript domain contracts.
 */

export interface User {
  email: string;
  role: 'student' | 'cc' | 'admin';
  full_name: string;
  prn?: string;
  batch_id?: string;
  centre_id?: string | null;
  course_id?: string | null;
}

export interface Batch {
  id: string;
  label: string;
  active: boolean;
}

export interface Centre {
  id: string;
  name: string;
  kind: 'cdac' | 'atc';
  parent_id?: string | null;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface Module {
  id: string;
  course_id: string;
  name: string;
  short_name?: string | null;
  sort_order: number;
  active: boolean;
}

export interface Faculty {
  id: string;
  name: string;
  centre_id?: string | null;
  active: boolean;
}

export interface CohortSize {
  batch_id: string;
  centre_id: string;
  course_id: string;
  students: number;
}

export interface SessionListItem {
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

export interface DashboardReportRow {
  id: string;
  batch_id?: string;
  centre_id?: string;
  course_id?: string;
  opens_at: string;
  closes_at: string;
  faculty: string[];
  batch: string;
  centre: string;
  course: string;
  module: string;
  students: number;
  submitted: number;
  ratings: Record<string, number> | null;
}

export interface StudentRosterRow {
  email: string;
  prn: string;
  full_name: string;
  batch_id: string;
  centre_id: string;
  course_id: string;
}

export interface SessionReportResult {
  status: 'open' | 'too_few' | 'ready';
  total: number;
  answers: Record<string, string>[];
}

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      // Only set for requests that actually have a JSON body: Fastify's JSON parser
      // rejects an empty body sent with this content-type (400), which broke every
      // no-body POST (logout, consent) silently - the client reloaded/moved on anyway,
      // so logout looked like it worked while the session cookie was never cleared.
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    credentials: 'include', // sends signed HttpOnly session cookie
  });

  if (!res.ok) {
    let errMsg = `Request failed: ${res.status} ${res.statusText}`;
    if (res.status === 429) errMsg = 'Too many requests. Rate limit reached, wait a minute and try again.';
    else if (res.status >= 502 && res.status <= 504) errMsg = 'Service unavailable. Please try again in a moment.';
    try {
      // Proxy error pages are HTML; only trust a JSON body.
      const errJson = await res.json();
      if (errJson.error) errMsg = errJson.error;
    } catch {
      // ignore
    }
    throw new ApiError(errMsg, res.status);
  }

  return res.json();
}

/** Fetch every page of a list endpoint (server caps one page at `page` rows). */
export async function fetchAll<T>(get: (p: { limit: number; offset: number }) => Promise<T[]>, page: number): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += page) {
    const rows = await get({ limit: page, offset });
    out.push(...rows);
    if (rows.length < page) return out;
  }
}

export const api = {
  auth: {
    whoami: () => request<{ user: User | null }>('/auth/whoami'),
    logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
    devLogin: (email: string) =>
      request<{ ok: boolean; user: User }>('/auth/dev-login', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
  },
  consent: {
    // Defense-in-depth server-side record alongside the localStorage consent
    // flag; cookie-auth, no body. Best-effort: callers must not block the UI
    // on this or treat its failure as fatal.
    accept: () => request<{ ok: boolean }>('/api/consent', { method: 'POST' }),
  },
  reference: {
    batches: () => request<Batch[]>('/api/reference/batches'),
    centres: () => request<Centre[]>('/api/reference/centres'),
    courses: () => request<Course[]>('/api/reference/courses'),
    modules: () => request<Module[]>('/api/reference/modules'),
    faculty: () => request<Faculty[]>('/api/reference/faculty'),
    addFaculty: (name: string, centre_id?: string | null) =>
      request<Faculty>('/api/reference/faculty', {
        method: 'POST',
        body: JSON.stringify({ name, centre_id }),
      }),
    cohortSizes: () => request<CohortSize[]>('/api/reference/cohort-sizes'),
  },
  sessions: {
    list: (params?: { limit?: number; offset?: number }) => {
      const q = params ? '?' + new URLSearchParams(params as Record<string, any>).toString() : '';
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
    dashboard: () => request<DashboardReportRow[]>('/api/reports/dashboard'),
    get: (id: string) => request<SessionReportResult>(`/api/reports/${id}`),
  },
  roster: {
    listAll: (f: { batch_id: string; centre_id: string; course_id: string }) =>
      fetchAll((p) => api.roster.list({ ...f, ...p }), 1000),
    list: (params?: { batch_id?: string; centre_id?: string; course_id?: string; limit?: number; offset?: number }) => {
      const q = params ? '?' + new URLSearchParams(params as Record<string, any>).toString() : '';
      return request<StudentRosterRow[]>(`/api/roster${q}`);
    },
    upsert: (students: Array<{ email: string; prn: string; full_name: string; batch_id: string; centre_id: string; course_id: string }>) =>
      request<{ ok: boolean; count: number }>('/api/roster/upsert', {
        method: 'POST',
        body: JSON.stringify({ students }),
      }),
  },
  tables: {
    list: <T = Record<string, unknown>>(table: string, params?: Record<string, string>) => {
      const q = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<T[]>(`/api/reference/tables/${table}${q}`);
    },
    listAll: <T = Record<string, unknown>>(table: string, params?: Record<string, string>) =>
      fetchAll((p) => api.tables.list<T>(table, { ...params, limit: String(p.limit), offset: String(p.offset) }), 500),
    create: <T = Record<string, unknown>>(table: string, data: Record<string, unknown>) =>
      request<T>(`/api/reference/tables/${table}`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: <T = Record<string, unknown>>(table: string, id: string, data: Record<string, unknown>, pk = 'id') =>
      request<T>(`/api/reference/tables/${table}/${encodeURIComponent(id)}?pk=${pk}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (table: string, id: string, pk = 'id') =>
      request<{ ok: boolean }>(`/api/reference/tables/${table}/${encodeURIComponent(id)}?pk=${pk}`, {
        method: 'DELETE',
      }),
  },
};
