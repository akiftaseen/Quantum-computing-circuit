import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { type Complex,  cAbs2 } from '../logic/complex';

interface ProbabilityChartProps {
  state: Complex[];
  numQubits: number;
}

const ProbabilityChart: React.FC<ProbabilityChartProps> = ({ state, numQubits }) => {
  const dim = 1 << numQubits;
  const data = Array.from({ length: dim }, (_, i) => {
    const label = i.toString(2).padStart(numQubits, '0');
    return {
      basis: `|${label}⟩`,
      prob: cAbs2(state[i]),
    };
  });

  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
          <XAxis dataKey="basis" />
          <YAxis />
          <Tooltip formatter={(value: number) => value.toFixed(3)} />
          <Bar dataKey="prob" fill="#6366f1" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ProbabilityChart;