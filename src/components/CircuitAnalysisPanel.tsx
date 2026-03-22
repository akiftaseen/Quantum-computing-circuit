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

  return (
    <div className="analysis-panel">
      <h4 className="analysis-title">Circuit Metrics</h4>

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
          <div className="analysis-metric-label">Est. Cost</div>
          <div className="analysis-metric-value">{cost}</div>
        </div>
      </div>

      {Object.keys(metrics.gateCount).length > 0 && (
        <div className="analysis-breakdown">
          <div className="analysis-section-label">Gate Breakdown</div>
          <div className="analysis-breakdown-grid">
            {Object.entries(metrics.gateCount).map(([gate, count]) => (
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
