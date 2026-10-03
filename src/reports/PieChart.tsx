import { Cell, Legend, Pie, PieChart as RePieChart, ResponsiveContainer, Tooltip, type PieLabelRenderProps } from 'recharts';
import type { Slice } from './aggregate';
import { CATEGORICAL, RATING_COLORS } from '../lib/palette';

// One fixed colour per feedback word (rating words come from the shared palette; no blue).
const COLORS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(RATING_COLORS).map(([k, v]) => [k.toLowerCase(), v])),
  normal: '#1b7a4a',
  fast: '#e8864a',
  'very fast': '#b83b2e',
  slow: '#a67c00',
  'very slow': '#8e3b8a',
};
const FALLBACK = [...CATEGORICAL];

const RADIAN = Math.PI / 180;
function percentLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: PieLabelRenderProps) {
  const radius = Number(innerRadius) + (Number(outerRadius) - Number(innerRadius)) * 1.25;
  const x = Number(cx) + radius * Math.cos(-Number(midAngle) * RADIAN);
  const y = Number(cy) + radius * Math.sin(-Number(midAngle) * RADIAN);
  return (
    <text x={x} y={y} fill="#1c1917" textAnchor={x > Number(cx) ? 'start' : 'end'} dominantBaseline="central">
      {`${((percent ?? 0) * 100).toFixed(0)}%`}
    </text>
  );
}

export function PieChart({ title, data, animated = true }: { title: string; data: Slice[]; animated?: boolean }) {
  return (
    <div className="bg-white p-2 text-center">
      <h3 className="font-semibold">{title}</h3>
      {data.length === 0 ? (
        <p className="muted py-8">No answers yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={360}>
          <RePieChart>
            <Pie data={data} dataKey="count" nameKey="feedback" outerRadius={120} label={percentLabel} isAnimationActive={animated}>
              {data.map((s, i) => (
                <Cell key={s.feedback} fill={COLORS[s.feedback.toLowerCase()] ?? FALLBACK[i % FALLBACK.length]} />
              ))}
            </Pie>
            <Legend verticalAlign="bottom" />
            <Tooltip />
          </RePieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
