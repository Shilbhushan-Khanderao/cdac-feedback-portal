import { withUser } from '../../db/pool.js';
import { audit } from '../../shared/audit.js';

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
