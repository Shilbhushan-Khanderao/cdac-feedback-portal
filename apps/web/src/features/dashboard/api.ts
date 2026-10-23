import { request } from '../../shared/api';

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

/** Per-question counts and comments of one closed session with 3+ responses (no per-student data). */
export interface SessionInsight {
  session_id: string;
  questions: { id: string; text: string; kind: 'choice' | 'text'; options: string[] | null }[];
  counts: Record<string, Record<string, number>>;
  comments: Record<string, string[]>;
}

export const dashboardApi = {
  dashboard: () => request<DashboardReportRow[]>('/api/reports/dashboard'),
  insights: () => request<SessionInsight[]>('/api/reports/dashboard/insights'),
};
