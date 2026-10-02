import { Cell, Legend, Pie, PieChart as RePieChart, ResponsiveContainer, Tooltip, type PieLabelRenderProps } from 'recharts';
import type { Slice } from './aggregate';

// Semantic colours from v1 reportConfig: each feedback label always gets the same colour.
const COLORS: Record<string, string> = {
  excellent: '#43a047',
  'very good': '#00acc1',
  good: '#ffb300',
  average: '#ff7043',
  poor: '#e53935',
  normal: '#43a047',
  fast: '#29b6f6',
  'very fast': '#1565c0',
  slow: '#ff9800',
  'very slow': '#d32f2f',
};
const FALLBACK = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#D733FF'];

const RADIAN = Math.PI / 180;
function percentLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: PieLabelRenderProps) {
  const radius = Number(innerRadius) + (Number(outerRadius) - Number(innerRadius)) * 1.25;
  const x = Number(cx) + radius * Math.cos(-Number(midAngle) * RADIAN);
  const y = Number(cy) + radius * Math.sin(-Number(midAngle) * RADIAN);
  return (
    <text x={x} y={y} fill="black" textAnchor={x > Number(cx) ? 'start' : 'end'} dominantBaseline="central">
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
