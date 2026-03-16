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
    <div style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <XAxis dataKey="basis" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v, name) => (name === 'count' ? v : Number(v).toFixed(4))} />
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.count > 0 ? '#22c55e' : '#cbd5e1'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
export default ShotsHistogram;