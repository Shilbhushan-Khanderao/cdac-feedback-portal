import { lazy, Suspense } from 'react';
import { createHashRouter, NavLink, Outlet, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthGate, isStaff, useMe } from './auth';
import { api } from './lib/api';
import { StudentHome } from './pages/StudentHome';
import { FeedbackForm } from './pages/FeedbackForm';
import { DashboardPage } from './pages/DashboardPage';
import { SessionsPage } from './pages/SessionsPage';
import { RosterPage } from './pages/RosterPage';
import { ManagePage } from './pages/ManagePage';

// Charts, NLP and PDF code load only when staff open a report.
const SessionReport = lazy(() => import('./pages/SessionReport'));

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/sessions', label: 'Sessions' },
  { to: '/roster', label: 'Students' },
  { to: '/manage', label: 'Setup' },
];

function Layout() {
  const me = useMe();
  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-2 text-sm transition-colors duration-150 ${isActive ? 'bg-brand-50 font-semibold text-brand-800' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'}`;
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
          <span className="mr-3 flex items-center gap-2 font-semibold tracking-tight">
            <svg viewBox="0 0 24 24" className="size-7 text-brand-700" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="5" fill="currentColor" stroke="none" />
              <path d="M8 13l3 3 5-7" stroke="#fff" />
            </svg>
            Module Feedback
          </span>
          {isStaff(me) && (
            <nav className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto" aria-label="Main">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} className={link}>
                  {n.label}
                </NavLink>
              ))}
            </nav>
          )}
          <span className="ml-auto flex items-center gap-2 text-sm">
            <span className="hidden truncate text-stone-600 sm:inline">{me.full_name}</span>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium capitalize text-stone-600">{me.role === 'cc' ? 'Coordinator' : me.role}</span>
          </span>
          <button className="btn px-3 py-1.5" onClick={() => void api.auth.logout().then(() => window.location.reload())}>
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <Outlet />
        </Suspense>
      </main>
    </>
  );
}

function Home() {
  return isStaff(useMe()) ? <DashboardPage /> : <StudentHome />;
}

const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/sessions', element: <SessionsPage /> },
      { path: '/feedback/:id', element: <FeedbackForm /> },
      { path: '/sessions/:id', element: <SessionReport /> },
      { path: '/roster', element: <RosterPage /> },
      { path: '/manage', element: <ManagePage /> },
      { path: '*', element: <Home /> },
    ],
  },
]);

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 2, refetchOnWindowFocus: false } } });

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
