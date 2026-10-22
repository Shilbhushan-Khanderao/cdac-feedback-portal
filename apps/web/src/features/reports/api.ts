import { request } from '../../shared/api';

interface SessionReportResult {
  status: 'open' | 'too_few' | 'ready';
  total: number;
  answers: Record<string, string>[];
}

export const reportsApi = {
  get: (id: string) => request<SessionReportResult>(`/api/reports/${id}`),
  submissions: (sessionId: string) => request<{ email: string }[]>(`/api/feedback/submissions/${sessionId}`),
};
