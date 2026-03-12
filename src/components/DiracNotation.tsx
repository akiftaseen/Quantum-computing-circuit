import React from 'react';
import { type Complex, cAbs2, formatComplex, cPhase } from '../logic/complex';

interface Props { state: Complex[]; numQubits: number; threshold?: number; }

const DiracNotation: React.FC<Props> = ({ state, numQubits, threshold = 1e-6 }) => {
  const dim = 1 << numQubits;
  const terms: { label: string; amp: Complex; prob: number; phase: number }[] = [];
  for (let i = 0; i < dim; i++) {
    const prob = cAbs2(state[i]);
    if (prob > threshold) {
      terms.push({
        label: i.toString(2).padStart(numQubits, '0'),
        amp: state[i], prob, phase: cPhase(state[i]),
      });
    }
  }

  return (
    <div className="dirac-view">
      <div className="dirac-ket">|ψ⟩ = {terms.length === 0 ? '0' : terms.map((t, i) => (
        <span key={t.label}>
          {i > 0 && <span className="dirac-plus"> + </span>}
          <span className="dirac-amp" title={`phase: ${(t.phase * 180 / Math.PI).toFixed(1)}°`}>
            ({formatComplex(t.amp, 3)})
          </span>
          <span className="dirac-basis">|{t.label}⟩</span>
        </span>
      ))}</div>
      <div className="dirac-probs">
        {terms.map(t => (
          <div key={t.label} className="dirac-prob-row">
            <span>|{t.label}⟩</span>
            <div className="dirac-prob-bar">
              <div style={{ width: `${t.prob * 100}%`, background: '#6366f1', height: '100%', borderRadius: 3 }} />
            </div>
            <span>{(t.prob * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};
export default DiracNotation;