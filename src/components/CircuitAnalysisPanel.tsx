import React, { useMemo } from 'react';
import type { CircuitState } from '../logic/circuitTypes';
import { analyzeCircuit, findOptimizations, calculateCircuitCost } from '../logic/circuitAnalysis';

interface Props {
  circuit: CircuitState;
}

const CircuitAnalysisPanel: React.FC<Props> = ({ circuit }) => {
  const metrics = useMemo(() => analyzeCircuit(circuit), [circuit]);
  const optimizations = useMemo(() => findOptimizations(circuit), [circuit]);
  const cost = useMemo(() => calculateCircuitCost(circuit), [circuit]);
  const totalGates = Math.max(metrics.totalGates, 1);

  const entanglingRatio = Math.round((metrics.twoQubitGateCount / totalGates) * 100);
  const depthDensity = Math.round((metrics.totalGates / Math.max(metrics.circuitDepth, 1)) * 10) / 10;

  const costTier =
    cost < 40 ? 'Low' :
    cost < 120 ? 'Moderate' :
    cost < 260 ? 'High' : 'Very High';

  const sortedGateCounts = Object.entries(metrics.gateCount)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="analysis-panel">
      <div className="analysis-header-row">
        <h4 className="analysis-title">Circuit Metrics</h4>
        <span className={`analysis-tier analysis-tier-${costTier.toLowerCase().replace(' ', '-')}`}>{costTier}</span>
      </div>

      <div className="analysis-metric-grid">
        <div className="analysis-metric-card">
          <div className="analysis-metric-label">Total Gates</div>
          <div className="analysis-metric-value">{metrics.totalGates}</div>
        </div>

        <div className="analysis-metric-card">
          <div className="analysis-metric-label">Circuit Depth</div>
          <div className="analysis-metric-value">{metrics.circuitDepth}</div>
        </div>

        <div className="analysis-metric-card">
          <div className="analysis-metric-label">2-Qubit Gates</div>
          <div className="analysis-metric-value">{metrics.twoQubitGateCount}</div>
        </div>

        <div className="analysis-metric-card">
          <div className="analysis-metric-label">Estimated Cost</div>
          <div className="analysis-metric-value">{cost}</div>
        </div>
      </div>

      <div className="analysis-indicators">
        <div className="analysis-indicator">
          <div className="analysis-indicator-label">Entangling Ratio</div>
          <div className="analysis-indicator-track">
            <div className="analysis-indicator-fill" style={{ width: `${entanglingRatio}%` }} />
          </div>
          <div className="analysis-indicator-value">{entanglingRatio}%</div>
        </div>
        <div className="analysis-indicator">
          <div className="analysis-indicator-label">Depth Density</div>
          <div className="analysis-indicator-track">
            <div className="analysis-indicator-fill" style={{ width: `${Math.min(100, depthDensity * 20)}%` }} />
          </div>
          <div className="analysis-indicator-value">{depthDensity} gates/col</div>
        </div>
      </div>

      {Object.keys(metrics.gateCount).length > 0 && (
        <div className="analysis-breakdown">
          <div className="analysis-section-label">Gate Breakdown</div>
          <div className="analysis-breakdown-grid">
            {sortedGateCounts.map(([gate, count]) => (
              <div key={gate} className="analysis-breakdown-item">
                <span>{gate}:</span>
                <span className="analysis-breakdown-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {optimizations.length > 0 && (
        <div className="analysis-optimization">
          <div className="analysis-optimization-title">Optimization Opportunities</div>
          <ul className="analysis-optimization-list">
            {optimizations.slice(0, 5).map((opt, i) => (
              <li key={i} className="analysis-optimization-item">{opt}</li>
            ))}
          </ul>
          {optimizations.length > 5 && (
            <div className="analysis-optimization-more">
              +{optimizations.length - 5} more suggestions
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default React.memo(CircuitAnalysisPanel);
