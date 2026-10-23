import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { FilePdf } from '@phosphor-icons/react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useMe } from '../../app/auth';
import { sessionStatus } from '../../shared/format';
import { CATEGORICAL, INK } from '../../shared/palette';
import { useBatches, useModules } from '../../shared/reference';
import { Choice } from '../../shared/ui';
import { dashboardApi, type DashboardReportRow as Row } from './api';
import { Attention } from './Attention';
import { downloadSummary } from './exportSummary';
import {
  actions,
  commentsByQuestion,
  LOW_RATING,
  mean,
  merge,
  pct,
  questionScores,
  round1,
  scoreTable,
  total,
} from './insights';
import { KPISummary } from './KPISummary';
import { Empty, Panel, QuestionAreas, ScoreTable, StudentVoice } from './Sections';

export function DashboardPage() {
  const me = useMe();
  const isAdmin = me.role === 'admin';
  const [batch, setBatch] = useState('');
  const [course, setCourse] = useState('');
  const [centre, setCentre] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const modules = useModules();
  const batches = useBatches();
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.dashboard() as Promise<Row[]>,
  });
  const insights = useQuery({
    queryKey: ['dashboard', 'insights'],
    queryFn: () => dashboardApi.insights(),
  });

  const distinct = (key: 'batch' | 'course' | 'centre') =>
    [...new Set((data ?? []).map((r) => r[key]))].sort();
  const rows = useMemo(
    () =>
      (data ?? []).filter(
        (r) =>
          (!batch || r.batch === batch) &&
          (!course || r.course === course) &&
          (!centre || r.centre === centre),
      ),
    [data, batch, course, centre],
  );
  const ids = new Set(rows.map((r) => r.id));
  const shownInsights = (insights.data ?? []).filter((s) => ids.has(s.session_id));
  const ready = rows.filter((r) => r.ratings);
  const all = merge(ready.map((r) => r.ratings));
  const avg = round1(mean(all));
  const students = rows.reduce((a, r) => a + r.students, 0);
  const submitted = rows.reduce((a, r) => a + r.submitted, 0);
  const open = rows.filter((r) => sessionStatus(r) === 'open').length;
  const hidden = rows.filter((r) => sessionStatus(r) === 'closed' && !r.ratings).length;
  const activeBatchIds = new Set((batches.data ?? []).filter((b) => b.active).map((b) => b.id));
  const todo = actions(rows, modules.data ?? [], activeBatchIds);
  const scores = questionScores(shownInsights);
  const voice = commentsByQuestion(shownInsights);
  const moduleRows = scoreTable(rows, (r) => [r.module]);
  const facultyRows = scoreTable(rows, (r) => r.faculty);
  const centreRows = scoreTable(rows, (r) => [r.centre]);
  const trend = [...ready]
    .sort((a, b) => a.closes_at.localeCompare(b.closes_at))
    .map((r) => ({
      name: r.module,
      date: new Date(r.closes_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      value: round1(mean(r.ratings!)),
    }));

  if (isLoading) return <p className="muted">Loading dashboard…</p>;
  if (error)
    return (
      <p role="alert" className="text-red-700">
        {error.message}
      </p>
    );

  const scope =
    [batch, course, centre].filter(Boolean).join(' · ') ||
    (isAdmin ? 'All centres' : 'Your centre');
  const exportPdf = async () => {
    setPdfBusy(true);
    try {
      await downloadSummary({
        title: `Feedback summary - ${scope}`,
        meta: [
          ['Selection', scope],
          ['Sessions', `${rows.length} (${ready.length} with results)`],
          ['Response rate', `${pct(submitted, students)}% (${submitted} of ${students} students)`],
          [
            'Average rating',
            ready.length ? `${avg} / 5 from ${total(all)} answers` : 'No results yet',
          ],
          ['Generated', new Date().toLocaleString('en-IN')],
        ],
        sections: ['areas', ...(isAdmin ? ['centres'] : []), 'modules', 'faculty'].map((id) =>
          document.getElementById(id),
        ),
        comments: voice,
      });
    } catch (e) {
      toast.error(`PDF failed: ${(e as Error).message}`);
    } finally {
      setPdfBusy(false);
    }
  };

  const header = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="mr-auto">
        <h1 className="page-title">Feedback overview</h1>
        <p className="muted">
          {scope} · results appear once a session closes with at least 3 answers
        </p>
      </div>
      <Filter
        label="Batch"
        all="All batches"
        value={batch}
        onChange={setBatch}
        options={distinct('batch')}
      />
      <Filter
        label="Course"
        all="All courses"
        value={course}
        onChange={setCourse}
        options={distinct('course')}
      />
      {isAdmin && (
        <Filter
          label="Centre"
          all="All centres"
          value={centre}
          onChange={setCentre}
          options={distinct('centre')}
        />
      )}
      <button
        className="btn btn-primary max-sm:w-full"
        onClick={exportPdf}
        disabled={pdfBusy || !ready.length}
      >
        <FilePdf size={18} aria-hidden /> {pdfBusy ? 'Preparing…' : 'Download summary'}
      </button>
    </div>
  );

  if (!rows.length)
    return (
      <div className="space-y-6">
        {header}
        <div className="card py-12 text-center">
          <p className="font-semibold text-stone-900">No feedback sessions yet</p>
          <p className="muted mt-1">Create one and share the link with the batch.</p>
          <Link to="/sessions?new=1" className="btn btn-primary mt-4">
            Create session
          </Link>
        </div>
      </div>
    );

  const kpis = (
    <KPISummary
      items={[
        { label: 'Sessions', value: rows.length, hint: `${open} open now`, to: '/sessions' },
        {
          label: 'Response rate',
          value: `${pct(submitted, students)}%`,
          hint: `${submitted} of ${students} students`,
          to: '#modules',
        },
        {
          label: 'Average rating',
          value: ready.length ? `${avg} / 5` : '–',
          hint: ready.length ? `${total(all)} answers` : 'No results yet',
          to: '#areas',
          alert: !!ready.length && avg < LOW_RATING,
        },
        {
          label: 'Results ready',
          value: ready.length,
          hint: 'Closed with 3+ answers',
          to: '#voice',
        },
        { label: 'Results hidden', value: hidden, hint: 'Closed with under 3 answers' },
      ]}
    />
  );
  const attention = <Attention items={todo} />;
  const areas = (
    <Panel id="areas" title="Strengths and weak areas" sub="Average per question, out of 5">
      <QuestionAreas scores={scores} />
    </Panel>
  );
  const trendPanel = (
    <Panel title="Rating over time" sub="Average of each session, by closing date">
      {trend.length >= 2 ? (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trend} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={INK.grid} vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: INK.muted, fontSize: 12 }}
              axisLine={{ stroke: INK.grid }}
              tickLine={false}
            />
            <YAxis
              domain={[1, 5]}
              tick={{ fill: INK.muted, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(v) => [`${v} / 5`, 'Average']}
              labelFormatter={(_, p) => p?.[0]?.payload.name ?? ''}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={CATEGORICAL[0]}
              strokeWidth={2}
              isAnimationActive={false}
              dot={{ r: 4, fill: CATEGORICAL[0], stroke: '#fff', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <Empty>Shows once two sessions have results.</Empty>
      )}
    </Panel>
  );
  const tables = (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel
        id="modules"
        title="Modules"
        sub="Score out of 5, and the share of students who answered"
      >
        <ScoreTable rows={moduleRows} label="Module" />
      </Panel>
      <Panel id="faculty" title="Faculty" sub="Across all their sessions with results">
        <ScoreTable rows={facultyRows} label="Faculty" />
      </Panel>
    </div>
  );
  const voicePanel = (
    <Panel
      id="voice"
      title="What students said"
      sub="Written comments in random order; no names are attached"
    >
      {insights.isLoading ? (
        <p className="muted">Loading comments…</p>
      ) : (
        <StudentVoice groups={voice} />
      )}
    </Panel>
  );

  return (
    <div className="space-y-6">
      {header}
      {isAdmin ? (
        <>
          {kpis}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              id="centres"
              title="Centres compared"
              sub="Score out of 5 and turnout, sessions with results"
            >
              <ScoreTable rows={centreRows} label="Centre" />
            </Panel>
            {areas}
          </div>
          {attention}
          {tables}
          {trend.length >= 2 && trendPanel}
          {voicePanel}
        </>
      ) : (
        <>
          {attention}
          {kpis}
          {trend.length >= 2 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {areas}
              {trendPanel}
            </div>
          ) : (
            areas
          )}
          {tables}
          {voicePanel}
        </>
      )}
    </div>
  );
}

function Filter({
  label,
  all,
  value,
  onChange,
  options,
}: {
  label: string;
  all: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <Choice
      label={label}
      hideLabel
      className="w-full sm:w-44"
      value={value}
      onChange={onChange}
      emptyLabel={all}
      options={options.map((o) => ({ value: o, label: o }))}
    />
  );
}
