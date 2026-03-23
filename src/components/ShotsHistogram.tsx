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

  const basisTick = { fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--text-2)' };
  const valueTick = { fontSize: 11, fontFamily: 'var(--font-sans)', fill: 'var(--text-2)' };
  const tooltipStyle = {
    fontFamily: 'var(--font-sans)',
    fontSize: 12,
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--card)',
  };

  return (
    <div className="probability-chart-wrap">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <XAxis dataKey="basis" tick={basisTick} axisLine={{ stroke: 'var(--border)' }} tickLine={{ stroke: 'var(--border)' }} />
          <YAxis tick={valueTick} axisLine={{ stroke: 'var(--border)' }} tickLine={{ stroke: 'var(--border)' }} />
          <Tooltip formatter={(v, name) => (name === 'count' ? v : Number(v).toFixed(4))} contentStyle={tooltipStyle} labelStyle={{ fontFamily: 'var(--font-mono)' }} />
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