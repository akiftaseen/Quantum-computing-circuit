import React from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { type Complex, cAbs2 } from '../logic/complex';
import { computeAdaptiveDomain } from '../logic/chartDomains';

interface Props { state: Complex[]; numQubits: number; }

const ProbabilityChart: React.FC<Props> = ({ state, numQubits }) => {
  const dim = 1 << numQubits;
  const data = Array.from({ length: dim }, (_, i) => ({
    basis: `|${i.toString(2).padStart(numQubits, '0')}⟩`,
    bits: i.toString(2).padStart(numQubits, '0'),
    prob: cAbs2(state[i]),
  }));

  const topStates = [...data]
    .sort((a, b) => b.prob - a.prob)
    .slice(0, 3)
    .filter((row) => row.prob > 1e-6);

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
  const xTickInterval = data.length > 16 ? Math.ceil(data.length / 16) - 1 : 0;
  const yDomain = React.useMemo(
    () => computeAdaptiveDomain(data.map((row) => row.prob), {
      defaultDomain: [0, 1],
      clampMin: 0,
      clampMax: 1,
      flatPad: 0.03,
      minPad: 0.01,
    }),
    [data],
  );

  return (
    <div className="probability-chart-wrap">
      <div className="probability-chart-canvas">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 10, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="basis"
              tick={basisTick}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={{ stroke: 'var(--border)' }}
              interval={xTickInterval}
              minTickGap={10}
            />
            <YAxis
              domain={yDomain}
              tick={valueTick}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={{ stroke: 'var(--border)' }}
            />
            <Tooltip
              formatter={(v: number | undefined, name) => {
                if (name === 'prob') return [`${((v ?? 0) * 100).toFixed(2)}%`, 'Probability'];
                return v ?? 0;
              }}
              labelFormatter={(label, payload) => {
                const row = payload?.[0]?.payload as { bits?: string } | undefined;
                return row?.bits ? `|${row.bits}⟩` : String(label);
              }}
              contentStyle={tooltipStyle}
              labelStyle={{ fontFamily: 'var(--font-mono)' }}
            />
            <Bar dataKey="prob" radius={[4, 4, 0, 0]} maxBarSize={24}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={d.prob > 0.01 ? 'var(--primary)' : 'var(--border)'}
                fillOpacity={d.prob > 0.01 ? 0.95 : 0.45}
              />
            ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="probability-chart-meta">
        {topStates.map((item, idx) => (
          <span key={item.basis} className="probability-chip">
            #{idx + 1} {item.basis} {(item.prob * 100).toFixed(2)}%
          </span>
        ))}
      </div>
    </div>
  );
};
export default React.memo(ProbabilityChart);