import { request } from '../shared/api';

interface User {
  email: string;
  role: 'student' | 'cc' | 'admin';
  full_name: string;
  prn?: string;
  batch_id?: string;
  centre_id?: string | null;
  course_id?: string | null;
}

export const authApi = {
  whoami: () => request<{ user: User | null }>('/auth/whoami'),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  devLogin: (email: string) =>
    request<{ ok: boolean; user: User }>('/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
};

export const consentApi = {
  // Defense-in-depth server-side record alongside the localStorage consent
  // flag; cookie-auth, no body. Best-effort: callers must not block the UI
  // on this or treat its failure as fatal.
  accept: () => request<{ ok: boolean }>('/api/consent', { method: 'POST' }),
};
