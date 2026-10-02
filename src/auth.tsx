import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './lib/supabase';

export type Me = {
  email: string;
  role: 'student' | 'cc' | 'admin';
  full_name: string;
  prn?: string;
  batch_id?: string;
  centre_id?: string | null;
  course_id?: string | null;
};

const MeContext = createContext<Me | null>(null);

export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error('useMe outside AuthGate');
  return me;
}

export const isStaff = (me: Me) => me.role !== 'student';

/** Renders children only for a signed-in user who is on a roster. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const queryClient = useQueryClient();

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    setMe(undefined);
    queryClient.clear(); // never show the previous user's cached data
    if (!userId) return;
    // Deferred: awaiting Supabase inside onAuthStateChange can deadlock the client.
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc('whoami');
      setMe(error ? null : ((data as Me | null) ?? null));
    });
    return () => clearTimeout(timer);
  }, [userId, queryClient]);

  if (session === undefined || (session && me === undefined)) {
    return <p className="p-8 text-center muted">Loading…</p>;
  }
  if (!session) return <LoginPage />;
  if (!me) {
    return (
      <Centered>
        <h1 className="text-lg font-semibold">Not on the roster</h1>
        <p className="muted">
          {session.user.email} is not registered for feedback. Ask your course coordinator to add this email, then sign
          in again.
        </p>
        <button className="btn" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </Centered>
    );
  }
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto mt-16 max-w-sm px-4">
      <div className="card space-y-4 text-center">{children}</div>
    </main>
  );
}

function LoginPage() {
  const [error, setError] = useState<string | null>(
    // Supabase puts OAuth / signup-hook errors in the redirect URL.
    new URLSearchParams(location.search).get('error_description'),
  );

  const google = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname },
    });
    if (error) setError(error.message);
  };

  // Local development only: seeded test users (see supabase/seed.sql). Stripped from production builds.
  const devLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = new FormData(e.currentTarget).get('email') as string;
    const { error } = await supabase.auth.signInWithPassword({ email, password: 'password' });
    if (error) setError(error.message);
  };

  return (
    <Centered>
      <h1 className="text-xl font-semibold">C-DAC Module Feedback</h1>
      <p className="muted">Sign in with the Google account your coordinator registered.</p>
      <button className="btn btn-primary w-full py-3 text-base" onClick={google}>
        Sign in with Google
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {import.meta.env.DEV && (
        <form onSubmit={devLogin} className="space-y-2 border-t pt-4 text-left">
          <label className="label" htmlFor="dev-email">
            Dev login (local Supabase)
          </label>
          <select id="dev-email" name="email" className="input">
            {['student1', 'student2', 'student3', 'cc', 'cc.atc', 'admin'].map((u) => (
              <option key={u}>{u}@test.local</option>
            ))}
          </select>
          <button className="btn w-full">Sign in</button>
        </form>
      )}
    </Centered>
  );
}
