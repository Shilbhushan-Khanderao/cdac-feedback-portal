import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './lib/api';
import { friendlyError } from './lib/format';

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
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [hasConsent, setHasConsent] = useState<boolean>(() => {
    return localStorage.getItem('cdac_dpdp_consent') === 'true';
  });
  const queryClient = useQueryClient();

  const refreshMe = async () => {
    try {
      const res = await api.auth.whoami();
      setMe(res.user ?? null);
    } catch {
      setMe(null);
    }
  };

  useEffect(() => {
    queryClient.clear();
    void refreshMe();
  }, [queryClient]);

  const signOut = async () => {
    await api.auth.logout();
    queryClient.clear();
    setMe(null);
  };

  if (me === undefined) {
    return <p className="p-8 text-center muted">Loading…</p>;
  }

  if (!me) {
    return <LoginPage onLoginSuccess={refreshMe} />;
  }

  // DPDP Act 2023 Consent Check for Students
  if (me.role === 'student' && !hasConsent) {
    const handleConsent = () => {
      localStorage.setItem('cdac_dpdp_consent', 'true');
      setHasConsent(true);
    };

    return (
      <main className="mx-auto mt-12 max-w-lg px-4">
        <div className="card space-y-4 text-left">
          <div className="flex items-center gap-2 border-b pb-3">
            <svg viewBox="0 0 24 24" className="size-6 text-brand-700" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 5-4.03 9-9 9s-9-4-9-9 4.03-9 9-9 9 4 9 9z" />
            </svg>
            <h1 className="text-lg font-bold">C-DAC Student Feedback: Privacy Notice</h1>
          </div>
          <div className="space-y-3 text-sm text-stone-700">
            <p>
              In accordance with the <strong>Digital Personal Data Protection (DPDP) Act 2023</strong>, please review how your feedback is processed:
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong>Strict Anonymity:</strong> Your ratings and comments are stored completely separate from your identity. No coordinator or faculty member can see which answers belong to you.
              </li>
              <li>
                <strong>Aggregation Safeguard:</strong> Feedback reports are generated only after the session closes and require at least 3 student responses.
              </li>
              <li>
                <strong>Purpose:</strong> Data is collected solely for academic quality monitoring and faculty appraisal within C-DAC.
              </li>
              <li>
                <strong>Sovereignty & Storage:</strong> All data is hosted on C-DAC campus servers in India.
              </li>
            </ul>
          </div>
          <div className="pt-2 flex gap-3">
            <button className="btn btn-primary flex-1 py-2.5" onClick={handleConsent}>
              I Understand & Consent
            </button>
            <button className="btn px-4" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </main>
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

function LoginPage({ onLoginSuccess }: { onLoginSuccess: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(() => {
    const fromUrl = new URLSearchParams(location.search).get('error_description');
    return fromUrl && friendlyError(fromUrl);
  });

  const google = () => {
    window.location.href = '/auth/google';
  };

  // Local development only: seeded test users.
  const devLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = new FormData(e.currentTarget).get('email') as string;
    try {
      const res = await api.auth.devLogin(email);
      if (res.ok) {
        await onLoginSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
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
            Dev login (local server)
          </label>
          <select id="dev-email" name="email" className="input">
            {['student1', 'student2', 'student3', 'student4', 'cc', 'cc.atc', 'admin'].map((u) => (
              <option key={u}>{u}@test.local</option>
            ))}
          </select>
          <button className="btn w-full">Sign in</button>
        </form>
      )}
    </Centered>
  );
}
