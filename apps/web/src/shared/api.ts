/**
 * Native API Client for C-DAC Feedback Portal
 * Hardened REST client with comprehensive TypeScript domain contracts.
 */

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

interface CohortSize {
  batch_id: string;
  centre_id: string;
  course_id: string;
  students: number;
}

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export type Question = { id: string; text: string; kind: 'choice' | 'text'; options: string[] };

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
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

export const referenceApi = {
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
};

export const tablesApi = {
  list: <T = Record<string, unknown>>(table: string, params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<T[]>(`/api/reference/tables/${table}${q}`);
  },
  listAll: <T = Record<string, unknown>>(table: string, params?: Record<string, string>) =>
    fetchAll((p) => tablesApi.list<T>(table, { ...params, limit: String(p.limit), offset: String(p.offset) }), 500),
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
};
