import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { flowType: 'pkce' } },
);

type Ok<R> = Extract<R, { error: null }> extends { data: infer T } ? T : never;

/** Await a Supabase query and throw its error, so TanStack Query sees failures. */
export async function must<R extends { data: unknown; error: { message: string } | null }>(query: PromiseLike<R>): Promise<Ok<R>> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as Ok<R>;
}
