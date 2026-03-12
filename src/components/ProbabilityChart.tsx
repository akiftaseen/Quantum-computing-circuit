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
    <div style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <XAxis dataKey="basis" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number) => v.toFixed(4)} />
          <Bar dataKey="prob" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.prob > 0.01 ? '#6366f1' : '#cbd5e1'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
export default ProbabilityChart;