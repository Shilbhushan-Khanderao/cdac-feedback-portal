import { badRequest, forbidden, notFound } from '../../shared/errors.js';
import { STAFF_WRITABLE } from './configs.js';
import type { Row } from './schema.js';

/**
 * Explicit centre/course authorisation for CC writes (admins pass). Checks BOTH the existing
 * (source) row and the resulting (destination) values; RLS policies are the backstop.
 * May fill defaults into `data` (a CC's faculty defaults to their own centre).
 */
export async function assertCanWrite(
  client: any,
  user: { email: string; role: string },
  table: string,
  action: 'create' | 'update' | 'delete',
  id: string | undefined,
  data: Row
): Promise<void> {
  if (user.role === 'admin') return;
  if (!STAFF_WRITABLE.includes(table)) throw forbidden('Admin access required');

  const staff = (await client.query('SELECT centre_id, course_id FROM public.staff_roster WHERE email = $1', [user.email])).rows[0];
  if (!staff) throw forbidden('Staff record not found');

  if (table === 'modules') {
    if (!staff.course_id) return; // CC covers every course at their centre
    if (action === 'create') {
      if (data.course_id !== staff.course_id) throw forbidden('You can only add modules for your assigned course');
      return;
    }
    const mod = (await client.query('SELECT course_id FROM public.modules WHERE id = $1', [id])).rows[0];
    if (!mod) throw notFound('Module not found');
    if (mod.course_id !== staff.course_id) throw forbidden('You can only edit or delete modules for your assigned course');
    if (action === 'update' && data.course_id && data.course_id !== staff.course_id) {
      throw forbidden('Cannot change module course assignment');
    }
  } else if (table === 'faculty') {
    if (action === 'create') {
      data.centre_id ??= staff.centre_id;
      if (data.centre_id !== staff.centre_id) throw forbidden('You can only add faculty for your own centre');
      return;
    }
    const fac = (await client.query('SELECT centre_id FROM public.faculty WHERE id = $1', [id])).rows[0];
    if (!fac) throw notFound('Faculty not found');
    if (fac.centre_id !== staff.centre_id) throw forbidden('You can only edit or delete faculty for your own centre');
    if (action === 'update' && data.centre_id !== undefined && data.centre_id !== staff.centre_id) {
      throw forbidden('You can only assign faculty to your own centre');
    }
  } else if (table === 'student_roster') {
    let centre: string | undefined = data.centre_id;
    let course: string | undefined = data.course_id;
    if (action !== 'create') {
      // Source row (RLS only shows rows we can manage, so foreign rows read as "not found").
      const cur = (await client.query('SELECT centre_id, course_id FROM public.student_roster WHERE email = $1', [id])).rows[0];
      if (!cur) throw notFound('Row not found or no changes allowed');
      const src = await client.query('SELECT public.can_manage($1, $2) AS ok', [cur.centre_id, cur.course_id]);
      if (!src.rows[0]?.ok) throw forbidden('You cannot manage this student');
      centre ??= cur.centre_id;
      course ??= cur.course_id;
    }
    if (action !== 'delete') {
      if (!centre || !course) throw badRequest('centre_id and course_id are required');
      const dst = await client.query('SELECT public.can_manage($1, $2) AS ok', [centre, course]);
      if (!dst.rows[0]?.ok) throw forbidden('You cannot manage student roster for this cohort');
    }
  } else if (table === 'staff_roster') {
    // Independent of STAFF_WRITABLE (VAPT AZ-1): role/centre_id/course_id are the columns a
    // staff write could use for privilege escalation (self-promotion to admin, or reassigning
    // oneself to another centre/course). staff_roster isn't in STAFF_WRITABLE today, so this
    // branch is currently unreachable for non-admins — it stays as a second, independent block
    // so adding the table there later can't reopen escalation on its own.
    throw forbidden('Admin access required');
  }
}
