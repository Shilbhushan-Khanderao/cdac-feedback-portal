import { lazy, Suspense } from 'react';
import { createHashRouter, NavLink, Outlet, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthGate, isStaff, useMe } from './auth';
import { supabase } from './lib/supabase';
import { StudentHome } from './pages/StudentHome';
import { FeedbackForm } from './pages/FeedbackForm';
import { SessionsPage } from './pages/SessionsPage';
import { RosterPage } from './pages/RosterPage';
import { ManagePage } from './pages/ManagePage';

// Charts, NLP and PDF code load only when staff open a report.
const SessionReport = lazy(() => import('./pages/SessionReport'));

function Layout() {
  const me = useMe();
  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`;
  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-3">
          <span className="mr-2 font-semibold">Module Feedback</span>
          {isStaff(me) && (
            <nav className="flex gap-1">
              <NavLink to="/" end className={link}>
                Sessions
              </NavLink>
              <NavLink to="/roster" className={link}>
                Students
              </NavLink>
              <NavLink to="/manage" className={link}>
                Setup
              </NavLink>
            </nav>
          )}
          <span className="ml-auto truncate muted">{me.full_name}</span>
          <button className="btn px-3 py-1.5" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <Outlet />
        </Suspense>
      </main>
    </>
  );
}

function Home() {
  return isStaff(useMe()) ? <SessionsPage /> : <StudentHome />;
}

const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/feedback/:id', element: <FeedbackForm /> },
      { path: '/sessions/:id', element: <SessionReport /> },
      { path: '/roster', element: <RosterPage /> },
      { path: '/manage', element: <ManagePage /> },
      { path: '*', element: <Home /> },
    ],
  },
]);

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <RouterProvider router={router} />
      </AuthGate>
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
