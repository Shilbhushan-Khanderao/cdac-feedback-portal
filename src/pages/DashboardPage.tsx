import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useMe } from '../auth';
import { fmt, sessionStatus } from '../lib/format';
import { CATEGORICAL, INK, RATING_COLORS, RATING_ORDER, RATING_SCORE } from '../lib/palette';
import { api } from '../lib/api';

type Row = {
  id: string;
  batch_id: string;
  centre_id: string;
  course_id: string;
  opens_at: string;
  closes_at: string;
  faculty: string[];
  batch: string;
  centre: string;
  course: string;
  module: string;
  students: number;
  submitted: number;
  /** Rating word -> count. null until the session has closed with at least 3 responses. */
  ratings: Record<string, number> | null;
};

const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
const mean = (r: Record<string, number>) => {
  const n = Object.entries(r).reduce((a, [k, v]) => a + (RATING_SCORE[k] ? v : 0), 0);
  return n ? Object.entries(r).reduce((a, [k, v]) => a + (RATING_SCORE[k] ?? 0) * v, 0) / n : 0;
};
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
const merge = (rows: Row[]) =>
  rows.reduce<Record<string, number>>((acc, r) => {
    for (const [k, v] of Object.entries(r.ratings ?? {})) acc[k] = (acc[k] ?? 0) + v;
    return acc;
  }, {});

export function DashboardPage() {
  const me = useMe();
  const [batch, setBatch] = useState('');
  const [course, setCourse] = useState('');
  const [centre, setCentre] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.reports.dashboard() as Promise<Row[]>,
  });

  const distinct = (key: 'batch' | 'course' | 'centre') =>
    [...new Map((data ?? []).map((r) => [r[key], r[`${key}` as const]])).values()].sort();
  const rows = useMemo(
    () => (data ?? []).filter((r) => (!batch || r.batch === batch) && (!course || r.course === course) && (!centre || r.centre === centre)),
    [data, batch, course, centre],
  );
  const ready = rows.filter((r) => r.ratings);
  const all = merge(ready);
  const students = rows.reduce((a, r) => a + r.students, 0);
  const submitted = rows.reduce((a, r) => a + r.submitted, 0);
  const open = rows.filter((r) => sessionStatus(r) === 'open').length;
  const awaiting = rows.filter((r) => sessionStatus(r) === 'closed' && !r.ratings).length;

  // Response rate by centre (admin, several centres) or by module (a single centre).
  const byCentre = new Set(rows.map((r) => r.centre)).size > 1;
  const rateGroups = group(rows, (r) => (byCentre ? r.centre : r.module)).map(([name, g]) => ({
    name,
    value: pct(g.reduce((a, r) => a + r.submitted, 0), g.reduce((a, r) => a + r.students, 0)),
  }));
  const moduleScores = group(ready, (r) => r.module)
    .map(([name, g]) => ({ name, value: round1(mean(merge(g))), n: g.length }))
    .sort((a, b) => b.value - a.value);
  const facultyScores = group(
    ready.flatMap((r) => r.faculty.map((f) => ({ f, r }))),
    (x) => x.f,
  )
    .map(([name, g]) => ({ name, value: round1(mean(merge(g.map((x) => x.r)))), n: g.length }))
    .sort((a, b) => b.value - a.value);
  const trend = [...ready]
    .sort((a, b) => a.closes_at.localeCompare(b.closes_at))
    .map((r) => ({ name: r.module, date: new Date(r.closes_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), value: round1(mean(r.ratings!)) }));
  const attention = rows
    .filter((r) => sessionStatus(r) === 'open' && r.students > 0 && r.submitted / r.students < 0.5)
    .sort((a, b) => a.closes_at.localeCompare(b.closes_at))
    .slice(0, 6);

  if (isLoading) return <p className="muted">Loading dashboard…</p>;
  if (error) return <p className="text-red-700">{error.message}</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="page-title">Overview</h1>
          <p className="muted">
            {me.role === 'admin' ? 'All centres' : 'Your centre'} · ratings appear after a session closes with at least 3 responses
          </p>
        </div>
        <Filter label="Batch" value={batch} onChange={setBatch} options={distinct('batch')} />
        <Filter label="Course" value={course} onChange={setCourse} options={distinct('course')} />
        {me.role === 'admin' && <Filter label="Centre" value={centre} onChange={setCentre} options={distinct('centre')} />}
      </div>

      {rows.length === 0 ? (
        <div className="card py-12 text-center">
          <p className="font-medium">No feedback sessions yet</p>
          <p className="muted mt-1">Create one under Sessions and share the link with the batch.</p>
          <Link to="/sessions" className="btn btn-primary mt-4">
            Go to Sessions
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Sessions" value={rows.length} hint={`${open} open now`} />
            <Kpi label="Response rate" value={`${pct(submitted, students)}%`} hint={`${submitted} of ${students} students`} />
            <Kpi
              label="Average rating"
              value={ready.length ? `${round1(mean(all))} / 5` : '–'}
              hint={ready.length ? `${total(all)} answers, ${ready.length} sessions` : 'No closed sessions yet'}
            />
            <Kpi label="Awaiting results" value={awaiting} hint="Closed, fewer than 3 responses" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Response rate" sub={byCentre ? 'By centre' : 'By module'} empty={!rateGroups.length}>
              <HBar data={rateGroups} max={100} suffix="%" color={CATEGORICAL[0]} />
            </Panel>
            <Panel title="Overall ratings" sub="Share of all answers on the Excellent to Poor scale" empty={!ready.length} emptyText="Appears after the first session closes with 3+ responses.">
              <Distribution counts={all} />
            </Panel>
            <Panel title="Average rating by module" sub="Out of 5, closed sessions only" empty={!moduleScores.length}>
              <HBar data={moduleScores} max={5} color={CATEGORICAL[0]} />
            </Panel>
            <Panel title="Average rating by faculty" sub="Out of 5, across their closed sessions" empty={!facultyScores.length}>
              <HBar data={facultyScores} max={5} color={CATEGORICAL[0]} />
            </Panel>
          </div>

          {trend.length >= 3 && (
            <Panel title="Rating trend" sub="Average rating of each session, by closing date">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trend} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke={INK.grid} vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: INK.muted, fontSize: 12 }} axisLine={{ stroke: INK.grid }} tickLine={false} />
                  <YAxis domain={[1, 5]} tick={{ fill: INK.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => [`${v} / 5`, 'Average']} labelFormatter={(_, p) => p?.[0]?.payload.name ?? ''} />
                  <Line type="monotone" dataKey="value" stroke={CATEGORICAL[0]} strokeWidth={2} dot={{ r: 4, fill: CATEGORICAL[0], stroke: '#fff', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>
          )}

          {attention.length > 0 && (
            <section className="card">
              <h2 className="section-title">Needs attention</h2>
              <p className="muted mb-2">Open sessions where fewer than half of the students have responded.</p>
              <ul className="divide-y divide-stone-100">
                {attention.map((r) => (
                  <li key={r.id}>
                    <Link to={`/sessions/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 hover:bg-stone-50">
                      <span className="font-medium">{r.module}</span>
                      <span className="muted">{r.centre} · {r.course}</span>
                      <span className="num ml-auto text-sm text-amber-800">
                        {r.submitted}/{r.students} ({pct(r.submitted, r.students)}%) · closes {fmt(r.closes_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function group<T>(items: T[], key: (t: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const i of items) m.set(key(i), [...(m.get(key(i)) ?? []), i]);
  return [...m.entries()];
}
const round1 = (n: number) => Math.round(n * 10) / 10;

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="text-sm">
      <span className="sr-only">{label}</span>
      <select className="input w-auto" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="">All {label.toLowerCase()}s</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
  return (
    <div className="card">
      <p className="muted">{label}</p>
      <p className="num mt-1 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="muted mt-1">{hint}</p>
    </div>
  );
}

function Panel({ title, sub, empty, emptyText, children }: { title: string; sub?: string; empty?: boolean; emptyText?: string; children: ReactNode }) {
  return (
    <section className="card">
      <h2 className="font-semibold">{title}</h2>
      {sub && <p className="muted mb-3">{sub}</p>}
      {empty ? <p className="muted py-8 text-center">{emptyText ?? 'No data for this selection yet.'}</p> : children}
    </section>
  );
}

/** Horizontal bars with the value written at the end of each bar. */
function HBar({ data, max, suffix = '', color }: { data: { name: string; value: number }[]; max: number; suffix?: string; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 36 + 16)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 44, bottom: 0, left: 0 }} barCategoryGap={8}>
        <XAxis type="number" domain={[0, max]} hide />
        <YAxis type="category" dataKey="name" width={140} tick={{ fill: INK.secondary, fontSize: 12 }} axisLine={false} tickLine={false} interval={0} tickFormatter={(n: string) => (n.length > 22 ? `${n.slice(0, 21)}…` : n)} />
        <Tooltip cursor={{ fill: '#f5f5f4' }} formatter={(v, _n, p) => [`${v}${suffix}`, p.payload.name]} separator=": " />
        <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} barSize={18} background={{ fill: '#f5f5f4', radius: 4 }}>
          <LabelList dataKey="value" position="right" formatter={(v) => `${v}${suffix}`} style={{ fill: INK.primary, fontSize: 12, fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** One 100% stacked bar of Excellent..Poor, with a legend that carries counts (colour is never the only cue). */
function Distribution({ counts }: { counts: Record<string, number> }) {
  const n = total(counts);
  return (
    <div>
      <div className="flex h-8 w-full gap-0.5 overflow-hidden rounded-md" role="img" aria-label={RATING_ORDER.map((k) => `${k} ${pct(counts[k] ?? 0, n)}%`).join(', ')}>
        {RATING_ORDER.map((k) =>
          counts[k] ? <div key={k} style={{ width: `${(100 * counts[k]) / n}%`, background: RATING_COLORS[k] }} title={`${k}: ${counts[k]}`} /> : null,
        )}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-1 xl:grid-cols-2">
        {RATING_ORDER.map((k) => (
          <li key={k} className="flex items-center gap-2 text-sm">
            <span className="size-3 shrink-0 rounded-sm" style={{ background: RATING_COLORS[k] }} />
            <span className="text-stone-700">{k}</span>
            <span className="num ml-auto font-semibold">{pct(counts[k] ?? 0, n)}%</span>
            <span className="num w-10 text-right text-stone-500">{counts[k] ?? 0}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
