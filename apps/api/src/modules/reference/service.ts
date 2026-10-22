import { query, withUser } from '../../db/pool.js';
import { audit } from '../../shared/audit.js';

export const listBatches = async () => (await query('SELECT * FROM public.batches ORDER BY label DESC')).rows;
export const listCentres = async () => (await query('SELECT * FROM public.centres ORDER BY name ASC')).rows;
export const listCourses = async () => (await query('SELECT * FROM public.courses ORDER BY code ASC')).rows;
export const listActiveModules = async () =>
  (await query('SELECT * FROM public.modules WHERE active = true ORDER BY sort_order ASC, name ASC')).rows;

export function listActiveFaculty(email: string) {
  return withUser(email, async (client) => {
    const r = await client.query(
      `SELECT id, name, centre_id, active
         FROM public.faculty
        WHERE active = true
        ORDER BY name ASC`
    );
    return r.rows;
  });
}

export function createFaculty(email: string, ip: string, name: string, centreId: string | null) {
  return withUser(email, async (client) => {
    // Admin: centre as given (NULL = shared). CC: defaults to their own centre; any other
    // centre (or shared) is rejected by the faculty_ins RLS policy.
    const r = await client.query(
      `INSERT INTO public.faculty (name, centre_id)
       VALUES ($1, CASE WHEN public.is_admin() THEN $2::uuid
                        ELSE COALESCE($2::uuid, (SELECT centre_id FROM public.staff_roster WHERE email = public.my_email())) END)
       RETURNING id, name, centre_id, active`,
      [name, centreId]
    );
    await audit({ actor: email, action: 'FACULTY_CREATE', entityType: 'faculty', entityId: r.rows[0].id, ip }, client);
    return r.rows[0];
  });
}

export function cohortSizes(email: string) {
  return withUser(email, async (client) => (await client.query('SELECT * FROM public.cohort_sizes')).rows);
}
