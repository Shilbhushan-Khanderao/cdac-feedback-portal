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

export const dashboardApi = {
  dashboard: () => request<DashboardReportRow[]>('/api/reports/dashboard'),
};
