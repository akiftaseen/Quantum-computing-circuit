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
import { computeAdaptiveDomain } from '../logic/chartDomains';

interface Props {
  histogram: Map<string, number>;
  numQubits: number;
  totalShots: number;
  referenceHistogram?: Map<string, number> | null;
  referenceLabel?: string;
}

const ShotsHistogram: React.FC<Props> = ({
  histogram,
  numQubits,
  totalShots,
  referenceHistogram,
  referenceLabel = 'Reference',
}) => {
  const dim = 1 << numQubits;
  const safeShots = Math.max(1, totalShots);
  const data = Array.from({ length: dim }, (_, i) => {
    const key = i.toString(2).padStart(numQubits, '0');
    const count = histogram.get(key) || 0;
    const referenceCount = referenceHistogram?.get(key) ?? null;
    const freq = count / safeShots;
    const referenceFreq = referenceCount === null ? null : referenceCount / safeShots;
    const delta = referenceFreq === null ? null : freq - referenceFreq;
    return {
      basis: `|${key}⟩`,
      bits: key,
      count,
      freq,
      referenceFreq,
      delta,
    };
  });

  const hasReference = Boolean(referenceHistogram);
  const tvDistance = hasReference
    ? 0.5 * data.reduce((acc, row) => acc + Math.abs(row.delta ?? 0), 0)
    : null;
  const maxDeltaState = hasReference
    ? [...data].sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))[0]
    : null;

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
  const denseXAxis = numQubits >= 4 || data.length > 16;
  const maxVisibleTicks = denseXAxis ? 8 : 16;
  const xTickInterval = data.length > maxVisibleTicks ? Math.ceil(data.length / maxVisibleTicks) - 1 : 0;
  const xTickStep = xTickInterval + 1;
  const chartMargin = denseXAxis
    ? { top: 8, right: 10, bottom: 10, left: 0 }
    : { top: 8, right: 10, bottom: 4, left: 0 };
  const yDomain = React.useMemo(
    () => computeAdaptiveDomain(data.map((row) => row.freq), {
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
          <ComposedChart data={data} margin={chartMargin}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="bits"
              tickFormatter={(bits) => (denseXAxis ? bits : `|${bits}⟩`)}
              tick={basisTick}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={{ stroke: 'var(--border)' }}
              interval={xTickInterval}
              minTickGap={denseXAxis ? 4 : 10}
              angle={denseXAxis ? -24 : 0}
              textAnchor={denseXAxis ? 'end' : 'middle'}
              height={denseXAxis ? 42 : 30}
              tickMargin={denseXAxis ? 1 : 4}
            />
            <YAxis
              domain={yDomain}
              tick={valueTick}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={{ stroke: 'var(--border)' }}
            />
            <Tooltip
              formatter={(value, name) => {
                const numeric = typeof value === 'number' ? value : Number(value ?? 0);
                if (name === 'freq') return [`${(numeric * 100).toFixed(2)}%`, 'Observed'];
                if (name === 'referenceFreq') return [`${(numeric * 100).toFixed(2)}%`, referenceLabel];
                if (name === 'delta') return [`${(numeric * 100).toFixed(2)}%`, 'Delta'];
                if (name === 'count') return [Math.round(numeric), 'Count'];
                return [numeric, name];
              }}
              labelFormatter={(label, payload) => {
                const row = payload?.[0]?.payload as { bits?: string; count?: number } | undefined;
                if (!row) return String(label);
                return `|${row.bits ?? label}⟩ · ${row.count ?? 0} shots`;
              }}
              contentStyle={tooltipStyle}
              labelStyle={{ fontFamily: 'var(--font-mono)' }}
            />
            <Bar dataKey="freq" radius={[4, 4, 0, 0]} maxBarSize={24}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={
                  d.delta === null
                    ? (d.count > 0 ? 'var(--primary)' : 'var(--border)')
                    : (d.delta >= 0 ? 'var(--primary)' : 'var(--text-3)')
                }
                fillOpacity={d.count > 0 ? 0.95 : 0.45}
              />
            ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="probability-chart-meta">
        <span className="probability-chip probability-chip-muted">Total shots: {safeShots}</span>
        {denseXAxis && xTickStep > 1 && (
          <span className="probability-chip probability-chip-muted">
            X-axis condensed: showing every {xTickStep}th basis state
          </span>
        )}
        {hasReference && maxDeltaState && (
          <span className="probability-chip">
            Max deviation: {maxDeltaState.basis} {((maxDeltaState.delta ?? 0) * 100).toFixed(2)}%
          </span>
        )}
        {tvDistance !== null && (
          <span className="probability-chip probability-chip-muted">
            TV distance: {(tvDistance * 100).toFixed(2)}%
          </span>
        )}
      </div>
    </div>
  );
};
export default React.memo(ShotsHistogram);