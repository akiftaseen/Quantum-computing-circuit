import React, { useMemo } from 'react';
import type { CircuitState } from '../logic/circuitTypes';
import {
  analyzeAmplitudeAmplification,
  analyzeDeutschJozsa,
  analyzeSimonsPattern,
  analyzeVQETracker,
} from '../logic/algorithmStudio';

interface Props {
  circuit: CircuitState;
  shotsResult: Map<string, number> | null;
}

const AlgorithmStudioPanel: React.FC<Props> = ({ circuit, shotsResult }) => {
  const deutschJozsa = useMemo(() => analyzeDeutschJozsa(circuit, shotsResult), [circuit, shotsResult]);
  const vqe = useMemo(() => analyzeVQETracker(circuit), [circuit]);
  const simons = useMemo(() => analyzeSimonsPattern(circuit, shotsResult), [circuit, shotsResult]);
  const amplification = useMemo(() => analyzeAmplitudeAmplification(circuit), [circuit]);

  const vqeSpan = useMemo(() => {
    if (vqe.points.length === 0) return null;
    const min = Math.min(...vqe.points.map((p) => p.cost));
    const max = Math.max(...vqe.points.map((p) => p.cost));
    return { min, max, range: Math.max(1e-9, max - min) };
  }, [vqe.points]);

  return (
    <div className="algorithm-studio-panel">
      <h4 className="learning-title">Advanced Algorithm Studio</h4>
      <p className="learning-subtitle">
        Compare quantum-vs-classical query models, inspect variational cost landscapes, and break down period/amplification structure.
      </p>

      <section className="state-insights-card">
        <div className="state-insights-card-title">Deutsch-Jozsa: Oracle Evaluation</div>
        <div className="state-inline-metrics">
          <div>Pattern confidence: <strong>{deutschJozsa.likelyPattern ? 'high' : 'low'}</strong></div>
          <div>Oracle gates: <strong>{deutschJozsa.oracleGateCount}</strong></div>
          <div>Quantum queries: <strong>{deutschJozsa.quantumQueries}</strong></div>
          <div>Classical worst-case: <strong>{deutschJozsa.classicalQueries}</strong></div>
          <div>Outcome verdict: <strong>{deutschJozsa.verdict}</strong></div>
        </div>
      </section>

      <section className="state-insights-card">
        <div className="state-insights-card-title">Variational Quantum Eigensolver Tracker</div>
        {vqe.points.length > 0 && vqeSpan ? (
          <>
            <div className="state-inline-metrics">
              <div>Parametric gates: <strong>{vqe.paramGateCount}</strong></div>
              <div>
                Best cost: <strong>{vqe.bestPoint?.cost.toFixed(4)}</strong>
              </div>
              <div>
                Best scale: <strong>{vqe.bestPoint?.scale.toFixed(2)}</strong>
              </div>
            </div>
            <div className="vqe-track-grid">
              {vqe.points.map((point) => {
                const norm = ((point.cost - vqeSpan.min) / vqeSpan.range) * 100;
                return (
                  <div key={point.step} className="vqe-track-item">
                    <span>{point.scale.toFixed(2)}</span>
                    <div className="state-bar"><div style={{ width: `${norm}%` }} /></div>
                    <span>{point.cost.toFixed(3)}</span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="shots-empty-note">Add parametric gates (Rx/Ry/Rz/P/XX/YY/ZZ) to track a VQE-style cost landscape.</p>
        )}
      </section>

      <section className="state-insights-card">
        <div className="state-insights-card-title">Simon’s Problem: Period Finding View</div>
        <div className="state-inline-metrics">
          <div>Pattern confidence: <strong>{simons.likelyPattern ? 'high' : 'low'}</strong></div>
          <div>Unique outcomes: <strong>{simons.uniqueOutcomes}</strong></div>
        </div>
        <p className="learning-brief-summary">{simons.relationHint}</p>
      </section>

      <section className="state-insights-card">
        <div className="state-insights-card-title">Amplitude Amplification Breakdown</div>
        <div className="state-inline-metrics">
          <div>Hadamard prep gates: <strong>{amplification.hadamards}</strong></div>
          <div>Oracle-like blocks: <strong>{amplification.oracleLikeBlocks}</strong></div>
          <div>Diffusion-like blocks: <strong>{amplification.diffusionLikeBlocks}</strong></div>
          <div>Estimated Grover iterations: <strong>{amplification.estimatedIterations}</strong></div>
        </div>
      </section>
    </div>
  );
};

export default React.memo(AlgorithmStudioPanel);
