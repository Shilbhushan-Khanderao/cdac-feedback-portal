import { request } from '../../shared/api';

interface SessionReportResult {
  status: 'open' | 'too_few' | 'ready';
  total: number;
  answers: Record<string, string>[];
}

export const reportsApi = {
  get: (id: string) => request<SessionReportResult>(`/api/reports/${id}`),
  logDownload: (id: string, format: 'pdf' | 'csv') =>
    request<{ ok: boolean }>(`/api/reports/${id}/download`, { method: 'POST', body: JSON.stringify({ format }) }),
  submissions: (sessionId: string) => request<{ email: string }[]>(`/api/feedback/submissions/${sessionId}`),
};
