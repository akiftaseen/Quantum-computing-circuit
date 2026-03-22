import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Props { histogram: Map<string, number>; numQubits: number; totalShots: number; }

const ShotsHistogram: React.FC<Props> = ({ histogram, numQubits, totalShots }) => {
  const dim = 1 << numQubits;
  const data = Array.from({ length: dim }, (_, i) => {
    const key = i.toString(2).padStart(numQubits, '0');
    const count = histogram.get(key) || 0;
    return { basis: `|${key}⟩`, count, freq: count / totalShots };
  });

  return (
    <div className="probability-chart-wrap">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <XAxis dataKey="basis" tick={{ fontSize: 11, fill: 'var(--text-2)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={{ stroke: 'var(--border)' }} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text-2)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={{ stroke: 'var(--border)' }} />
          <Tooltip formatter={(v, name) => (name === 'count' ? v : Number(v).toFixed(4))} />
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.count > 0 ? 'var(--primary)' : 'var(--border)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
export default React.memo(ShotsHistogram);