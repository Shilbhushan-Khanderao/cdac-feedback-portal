import { withUser } from '../../db/pool.js';
import { audit, maskEmail } from '../../shared/audit.js';
import { forbidden } from '../../shared/errors.js';
import type { Student } from './schema.js';

export function listStudents(email: string, params: unknown[], conditions: string[]) {
  return withUser(email, async (client) => {
    const res = await client.query(
      `SELECT email, prn, full_name, batch_id, centre_id, course_id
         FROM public.student_roster
        WHERE ${conditions.join(' AND ')}
        ORDER BY prn ASC, full_name ASC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return res.rows;
  });
}

export function upsertStudents(actor: string, ip: string, students: Student[]) {
  return withUser(actor, async (client) => {
    // Destination check, once per distinct cohort.
    const pairs = new Map<string, [string, string]>();
    for (const s of students) pairs.set(`${s.centre_id}|${s.course_id}`, [s.centre_id, s.course_id]);
    for (const [centre, course] of pairs.values()) {
      const r = await client.query('SELECT public.can_manage($1, $2) AS allowed', [centre, course]);
      if (!r.rows[0]?.allowed) throw forbidden('You cannot add students to this centre or course');
    }

    // Source check: an email already rostered elsewhere belongs to someone else's cohort.
    // RLS hides rows outside our scope, so "not visible but exists" means foreign. The
    // ON CONFLICT ... DO UPDATE below also fails closed via the UPDATE policy USING clause.
    const emails = students.map((s) => s.email.toLowerCase().trim());
    const foreign = await client.query(
      `SELECT count(*)::int AS n
         FROM unnest($1::text[]) e(email)
        WHERE public.roster_email_taken(e.email::citext)
          AND NOT EXISTS (SELECT 1 FROM public.student_roster r WHERE r.email = e.email::citext)`,
      [emails]
    );
    if (foreign.rows[0].n > 0) throw forbidden('Some emails already belong to another centre or course');

    let inserted = 0;
    for (const s of students) {
      await client.query(
        `INSERT INTO public.student_roster (email, prn, full_name, batch_id, centre_id, course_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO UPDATE SET
           prn = EXCLUDED.prn,
           full_name = EXCLUDED.full_name,
           batch_id = EXCLUDED.batch_id,
           centre_id = EXCLUDED.centre_id,
           course_id = EXCLUDED.course_id`,
        [s.email.toLowerCase().trim(), s.prn, s.full_name, s.batch_id, s.centre_id, s.course_id]
      );
      inserted++;
    }

    // CMP-6: record which emails were touched (and the row count) so a cohort move or
    // PII overwrite can be traced later. Masked: audit_logs is append-only, so a full
    // address stored here could never be erased on a DPDP request.
    await audit({ actor, action: 'ROSTER_UPLOAD', entityType: 'student_roster', details: { count: inserted, emails: emails.map(maskEmail) }, ip }, client);
    return inserted;
  });
}
