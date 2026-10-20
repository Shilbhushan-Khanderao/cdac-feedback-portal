import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './lib/api';
import { loginError } from './lib/format';
import { Lock } from '@phosphor-icons/react';
import { BrandLockup } from './components/Logo';

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

/** POST logout, drop local drafts, then reload so no cached state survives. */
export async function signOut() {
  try {
    await api.auth.logout();
  } finally {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('cdac_draft_'))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      // storage unavailable
    }
    window.location.assign(window.location.pathname);
  }
}

// Consent is recorded per browser/user in localStorage; api.consent.accept()
// below is a best-effort server-side record alongside it (defense-in-depth).
const consentKey = (email: string) => `cdac_dpdp_consent_${email.toLowerCase()}`;
const staffNoticeKey = (email: string) => `cdac_dpdp_notice_seen_${email.toLowerCase()}`;
const readFlag = (key: string) => {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
};
const writeFlag = (key: string) => {
  try {
    localStorage.setItem(key, 'true');
  } catch {
    // storage unavailable: flag holds for this page view only
  }
};
const readConsent = (email: string) => readFlag(consentKey(email));

/** Fire-and-forget: never blocks the UI, never treated as fatal. */
function recordConsent() {
  void api.consent.accept().catch(() => {
    // best-effort defense-in-depth; the localStorage flag is the source of truth
  });
}

/** One-time, dismissible privacy FYI for staff (CC/admin), who get no consent gate. */
export function StaffPrivacyNotice() {
  const me = useMe();
  const [dismissed, setDismissed] = useState(() => readFlag(staffNoticeKey(me.email)));
  if (!isStaff(me) || dismissed) return null;

  const dismiss = () => {
    writeFlag(staffNoticeKey(me.email));
    recordConsent();
    setDismissed(true);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pt-2">
      <div role="status" className="card flex flex-wrap items-start gap-3 border-brand-200 bg-brand-50 p-3 text-sm text-stone-700">
        <p className="flex-1">
          <strong>Privacy notice:</strong> your name, email, IP address and actions on this portal are logged for
          security and audit purposes. Sign-in uses Google Sign-In (we request only your email). This is the same
          DPDP Act 2023 notice shown to students at sign-in.
        </p>
        <button className="btn px-3 py-1 text-xs" onClick={dismiss}>
          Got it
        </button>
      </div>
    </div>
  );
}

/** Renders children only for a signed-in user who is on a roster. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [unavailable, setUnavailable] = useState(false);
  const [consented, setConsented] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const refreshMe = async () => {
    try {
      const res = await api.auth.whoami();
      setUnavailable(false);
      setMe(res.user ?? null);
    } catch (e) {
      // 401 means signed out; anything else (network, 5xx) is an outage, not a login problem.
      if (e instanceof ApiError && e.status === 401) setMe(null);
      else {
        setUnavailable(true);
        setMe(null);
      }
    }
  };

  useEffect(() => {
    queryClient.clear();
    void refreshMe();
  }, [queryClient]);

  if (me === undefined) {
    return <p className="p-8 text-center muted">Loading…</p>;
  }

  if (unavailable) {
    return (
      <Centered>
        <h1 className="page-title">Service unavailable</h1>
        <p role="alert" className="muted">The server could not be reached. Please try again in a moment.</p>
        <button className="btn btn-primary w-full py-3" onClick={() => void refreshMe()}>
          Retry
        </button>
      </Centered>
    );
  }

  if (!me) {
    return <LoginPage onLoginSuccess={refreshMe} />;
  }

  // DPDP Act 2023 Consent Check for Students
  if (me.role === 'student' && consented !== me.email && !readConsent(me.email)) {
    const handleConsent = () => {
      writeFlag(consentKey(me.email));
      recordConsent();
      setConsented(me.email);
    };

    return (
      <main id="main" className="mx-auto mt-12 max-w-lg px-4">
        <div className="card space-y-4 text-left">
          <div className="flex items-center gap-2 border-b pb-3">
            <svg viewBox="0 0 24 24" className="size-6 text-brand-700" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 5-4.03 9-9 9s-9-4-9-9 4.03-9 9-9 9 4 9 9z" />
            </svg>
            <h1 className="page-title">Your Privacy & Feedback</h1>
          </div>
          <div className="space-y-2 text-sm text-stone-700">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-emerald-900 space-y-1.5">
              <p className="font-semibold flex items-center gap-1.5">
                <Lock size={16} aria-hidden /> 100% Anonymous Feedback
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm text-emerald-800">
                <li>Your answers are strictly anonymous — coordinators and faculty cannot see who submitted what.</li>
                <li>Reports only unlock when at least 3 students have submitted.</li>
                <li>Feedback answers are stored on C-DAC campus servers in India.</li>
              </ul>
            </div>
            <details className="text-xs text-stone-500 pt-1 cursor-pointer">
              <summary className="hover:text-stone-700 font-medium">View full DPDP Act 2023 legal notice</summary>
              <div className="mt-2 space-y-1 border-t pt-2 text-stone-600">
                <p>In accordance with the <strong>Digital Personal Data Protection (DPDP) Act 2023</strong>:</p>
                <p>• Data is processed solely for academic quality monitoring and faculty appraisal within C-DAC.</p>
                <p>• Response records are de-identified at the database layer with no link to your student identity or timestamps.</p>
                <p>• Signing in uses Google Sign-In, which requests only your email address; your email is processed by Google as part of login.</p>
                <p>• Course coordinators may choose to share the anonymous feedback link for a session via WhatsApp, a third-party service, when inviting your batch.</p>
                <p>• No third-party analytics or ad trackers are used. Google Sign-In and WhatsApp sharing (above) are the only other services involved.</p>
              </div>
            </details>
          </div>
          <div className="pt-2 flex gap-3">
            <button className="btn btn-primary flex-1 py-2.5 font-medium" onClick={handleConsent}>
              I Understand & Continue
            </button>
            <button className="btn px-4" onClick={() => void signOut()}>
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
    <main id="main" className="mx-auto mt-16 max-w-sm px-4">
      <div className="card space-y-4 text-center">{children}</div>
    </main>
  );
}

function LoginPage({ onLoginSuccess }: { onLoginSuccess: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(() => {
    const fromUrl = new URLSearchParams(location.search).get('error_description');
    return fromUrl ? loginError(fromUrl) : null;
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
      <h1 className="sr-only">C-DAC Module Feedback Portal</h1>
      <BrandLockup className="justify-center" />
      <p className="muted">Sign in with your Google or registered ACTS email.</p>
      <button className="btn btn-primary w-full py-3 text-base" onClick={google}>
        Sign in with Google
      </button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
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
