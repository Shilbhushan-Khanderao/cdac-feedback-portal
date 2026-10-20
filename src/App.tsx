import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { createHashRouter, Navigate, NavLink, Outlet, RouterProvider, useLocation, useRouteError } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthGate, isStaff, signOut, StaffPrivacyNotice, useMe } from './auth';
import { ApiError } from './lib/api';
import { StudentHome } from './pages/StudentHome';
import { FeedbackForm } from './pages/FeedbackForm';

// Staff-only code (charts, NLP, PDF, CSV) never loads for students.
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const SessionsPage = lazy(() => import('./pages/SessionsPage').then((m) => ({ default: m.SessionsPage })));
const RosterPage = lazy(() => import('./pages/RosterPage').then((m) => ({ default: m.RosterPage })));
const ManagePage = lazy(() => import('./pages/ManagePage').then((m) => ({ default: m.ManagePage })));
const SessionReport = lazy(() => import('./pages/SessionReport'));

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  roles: Array<'student' | 'cc' | 'admin'>;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', end: true, roles: ['cc', 'admin'] },
  { to: '/sessions', label: 'Sessions', roles: ['cc', 'admin'] },
  { to: '/roster', label: 'Students', roles: ['cc', 'admin'] },
  { to: '/manage', label: 'Setup', roles: ['cc', 'admin'] },
];

// CL-7: hash router never updates document.title, so every route showed the
// same static title. Checked most-specific prefix first.
const ROUTE_TITLES: Array<[string, string]> = [
  ['/sessions/', 'Session report'],
  ['/feedback/', 'Submit feedback'],
  ['/sessions', 'Sessions'],
  ['/roster', 'Students'],
  ['/manage', 'Setup'],
  ['/', 'Dashboard'],
];

function useRouteTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const title = ROUTE_TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? 'Dashboard';
    document.title = `${title} · C-DAC Module Feedback`;
  }, [pathname]);
}

function RoleRoute({
  allowedRoles,
  children,
}: {
  allowedRoles: Array<'student' | 'cc' | 'admin'>;
  children: ReactNode;
}) {
  const me = useMe();
  if (!allowedRoles.includes(me.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function Layout() {
  const me = useMe();
  useRouteTitle();
  const visibleNav = NAV.filter((n) => n.roles.includes(me.role));
  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-2 text-sm transition-colors duration-150 ${isActive ? 'bg-brand-50 font-semibold text-brand-800' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'}`;
  return (
    <>
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }} className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-30 focus:rounded-md focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
          <span className="mr-3 flex items-center gap-2 font-semibold tracking-tight">
            <svg viewBox="0 0 24 24" className="size-7 text-brand-700" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="5" fill="currentColor" stroke="none" />
              <path d="M8 13l3 3 5-7" stroke="#fff" />
            </svg>
            Module Feedback
          </span>
          {isStaff(me) && visibleNav.length > 0 && (
            <nav className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto" aria-label="Main">
              {visibleNav.map((n) => (
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
          <button
            className="btn px-3 py-1.5"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      </header>
      <StaffPrivacyNotice />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-6 outline-none">
        <Suspense fallback={<p className="muted" role="status">Loading…</p>}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="border-t border-stone-200 px-4 py-4 text-xs text-stone-500">
        <div className="mx-auto max-w-6xl">
          C-DAC Module Feedback Portal · Feedback data is processed under the DPDP Act 2023 notice shown at
          sign-in · Built to WCAG 2.1 AA accessibility guidelines — report issues to your course coordinator.
        </div>
      </footer>
    </>
  );
}

function Home() {
  return isStaff(useMe()) ? <DashboardPage /> : <StudentHome />;
}

function RouteError() {
  const err = useRouteError();
  console.error(err);
  return (
    <main className="mx-auto mt-16 max-w-sm px-4">
      <div className="card space-y-3 text-center" role="alert">
        <h1 className="page-title">Something went wrong</h1>
        <p className="muted">Reload the page. If it keeps happening, contact your coordinator.</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    </main>
  );
}

const router = createHashRouter([
  {
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <Home /> },
      {
        path: '/sessions',
        element: (
          <RoleRoute allowedRoles={['cc', 'admin']}>
            <SessionsPage />
          </RoleRoute>
        ),
      },
      {
        path: '/feedback/:id',
        element: (
          <RoleRoute allowedRoles={['student']}>
            <FeedbackForm />
          </RoleRoute>
        ),
      },
      {
        path: '/sessions/:id',
        element: (
          <RoleRoute allowedRoles={['cc', 'admin']}>
            <SessionReport />
          </RoleRoute>
        ),
      },
      {
        path: '/roster',
        element: (
          <RoleRoute allowedRoles={['cc', 'admin']}>
            <RosterPage />
          </RoleRoute>
        ),
      },
      {
        path: '/manage',
        element: (
          <RoleRoute allowedRoles={['cc', 'admin']}>
            <ManagePage />
          </RoleRoute>
        ),
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

const queryClient = new QueryClient({ defaultOptions: {
    queries: {
      // Client errors (4xx) will not fix themselves; only retry network/5xx.
      retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2,
      refetchOnWindowFocus: false,
    },
  } });

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
