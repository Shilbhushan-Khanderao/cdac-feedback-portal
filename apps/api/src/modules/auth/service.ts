import { withUser } from '../../db/pool.js';

/** Identity payload from the `whoami()` SQL function, evaluated under the user's RLS context. */
export const whoami = (email: string) =>
  withUser(email, async (client) => {
    const res = await client.query('SELECT whoami() AS me');
    return res.rows[0]?.me ?? null;
  });
