import type { ReactNode } from 'react';

interface KPICardProps {
  label: string;
  value: ReactNode;
  hint: string;
}

function KPICard({ label, value, hint }: KPICardProps) {
  return (
    <div className="card">
      <p className="muted text-xs sm:text-sm font-medium">{label}</p>
      <p className="num mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-stone-900">{value}</p>
      <p className="muted mt-1 text-xs">{hint}</p>
    </div>
  );
}

interface KPISummaryProps {
  sessionCount: number;
  openCount: number;
  responseRatePct: number;
  submittedCount: number;
  studentsCount: number;
  avgRating: string;
  avgRatingHint: string;
  awaitingCount: number;
}

export function KPISummary({
  sessionCount,
  openCount,
  responseRatePct,
  submittedCount,
  studentsCount,
  avgRating,
  avgRatingHint,
  awaitingCount,
}: KPISummaryProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KPICard label="Sessions" value={sessionCount} hint={`${openCount} open now`} />
      <KPICard
        label="Response rate"
        value={`${responseRatePct}%`}
        hint={`${submittedCount} of ${studentsCount} students`}
      />
      <KPICard
        label="Average rating"
        value={avgRating}
        hint={avgRatingHint}
      />
      <KPICard label="Awaiting results" value={awaitingCount} hint="Closed, fewer than 3 responses" />
    </div>
  );
}
