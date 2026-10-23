import { withUser } from '../../db/pool.js';
import { audit } from '../../shared/audit.js';
import { notFound } from '../../shared/errors.js';

export function dashboardData(email: string) {
  return withUser(email, async (client) => {
    const res = await client.query('SELECT public.dashboard_data() AS data');
    return res.rows[0]?.data ?? [];
  });
}

// The only path to response content: session_report() enforces can_manage, closed, n>=3, random order.
export function sessionReport(email: string, ip: string, id: string) {
  return withUser(email, async (client) => {
    const res = await client.query('SELECT public.session_report($1) AS report', [id]);
    await audit({ actor: email, action: 'REPORT_VIEW', entityType: 'feedback_sessions', entityId: id, ip }, client);
    return res.rows[0]?.report;
  });
}

// PDF/CSV are built in the browser from session_report() data (already audited as REPORT_VIEW);
// the client reports each download here so it gets its own trail.
export function logReportDownload(email: string, ip: string, id: string, format: 'pdf' | 'csv') {
  return withUser(email, async (client) => {
    // RLS: a session outside the caller's scope is simply not visible.
    const visible = await client.query('SELECT 1 FROM public.feedback_sessions WHERE id = $1', [id]);
    if (!visible.rowCount) throw notFound('Session not found');
    await audit({ actor: email, action: 'REPORT_DOWNLOAD', entityType: 'feedback_sessions', entityId: id, details: { format }, ip }, client);
  });
}
