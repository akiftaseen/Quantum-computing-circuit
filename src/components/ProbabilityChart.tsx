import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { type Complex, cAbs2 } from '../logic/complex';

interface Props { state: Complex[]; numQubits: number; }

const ProbabilityChart: React.FC<Props> = ({ state, numQubits }) => {
  const dim = 1 << numQubits;
  const data = Array.from({ length: dim }, (_, i) => ({
    basis: `|${i.toString(2).padStart(numQubits, '0')}⟩`,
    prob: cAbs2(state[i]),
  }));
  return (
    <div className="probability-chart-wrap">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <XAxis dataKey="basis" tick={{ fontSize: 11, fill: 'var(--text-2)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={{ stroke: 'var(--border)' }} />
          <YAxis domain={[0, 1]} tick={{ fontSize: 11, fill: 'var(--text-2)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={{ stroke: 'var(--border)' }} />
          <Tooltip formatter={(v: number | undefined) => (v ?? 0).toFixed(4)} />
          <Bar dataKey="prob" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.prob > 0.01 ? 'var(--primary)' : 'var(--border)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
export default React.memo(ProbabilityChart);