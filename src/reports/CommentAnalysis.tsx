import { useMemo } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Sentiment from 'sentiment';
import nlp from 'compromise';

// Ported from v1 CommentAnalysis.jsx (AFINN sentiment + compromise phrases). Screen only, not in the PDF.
const analyser = new Sentiment();
const toneColor = (score: number) => (score >= 3 ? '#43a047' : score <= -2 ? '#e53935' : '#ffb300');

function top(freq: Record<string, number>, n: number) {
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([term, count]) => ({ term, count }));
}

function analyze(comments: string[]) {
  const scores = comments.map((c) => analyser.analyze(c).score);
  const positive = scores.filter((s) => s >= 3).length;
  const negative = scores.filter((s) => s <= -2).length;
  const phrases: Record<string, number> = {};
  const terms: Record<string, number> = {};
  const bump = (freq: Record<string, number>, w: string) => {
    const key = w.toLowerCase().trim();
    if (key.length > 2) freq[key] = (freq[key] ?? 0) + 1;
  };
  for (const c of comments) {
    const doc = nlp(c);
    (doc.nouns().out('array') as string[]).forEach((p) => bump(phrases, p));
    [...(doc.adjectives().out('array') as string[]), ...(doc.verbs().out('array') as string[])].forEach((w) => bump(terms, w));
  }
  return {
    avgScore: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
    tone: [
      { label: 'Positive', count: positive, color: '#43a047' },
      { label: 'Neutral', count: comments.length - positive - negative, color: '#ffb300' },
      { label: 'Negative', count: negative, color: '#e53935' },
    ],
    phrases: top(phrases, 10),
    terms: top(terms, 12),
  };
}

export function CommentAnalysis({ comments }: { comments: string[] }) {
  const a = useMemo(() => (comments.length ? analyze(comments) : null), [comments]);
  if (!a) return null;
  return (
    <details className="mt-3 rounded-lg border border-sky-200 bg-sky-50/40">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Analysis</summary>
      <div className="space-y-4 bg-white p-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Comments" value={comments.length} />
          <Stat label="Positive" value={a.tone[0].count} color="#43a047" />
          <Stat label="Avg. score" value={(a.avgScore > 0 ? '+' : '') + a.avgScore} color={toneColor(a.avgScore)} />
        </div>
        <Bars title="Tone (AFINN)" data={a.tone.map((t) => ({ term: t.label, count: t.count, color: t.color }))} />
        {a.phrases.length > 0 && <Bars title="Key phrases" data={a.phrases} color="#0088FE" />}
        {a.terms.length > 0 && <Bars title="Descriptive words" data={a.terms} color="#00C49F" />}
      </div>
    </details>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <div className="text-xl font-bold" style={{ color }}>
        {value}
      </div>
      <div className="muted">{label}</div>
    </div>
  );
}

function Bars({ title, data, color }: { title: string; data: { term: string; count: number; color?: string }[]; color?: string }) {
  return (
    <div>
      <h4 className="muted mb-1">{title}</h4>
      <ResponsiveContainer width="100%" height={36 + data.length * 22}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30 }}>
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="term" width={130} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((d) => (
              <Cell key={d.term} fill={d.color ?? color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
