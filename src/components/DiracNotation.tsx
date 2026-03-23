import React, { useMemo, useState } from 'react';
import { type Complex, cAbs2, formatComplex, cPhase } from '../logic/complex';

interface Props { state: Complex[]; numQubits: number; threshold?: number; }

const DiracNotation: React.FC<Props> = ({ state, numQubits, threshold = 1e-6 }) => {
  const [selectedBasis, setSelectedBasis] = useState<string | null>(null);

  const terms = useMemo(() => {
    const dim = 1 << numQubits;
    const out: { label: string; amp: Complex; prob: number; phase: number }[] = [];
    for (let i = 0; i < dim; i++) {
      const prob = cAbs2(state[i]);
      if (prob > threshold) {
        out.push({
          label: i.toString(2).padStart(numQubits, '0'),
          amp: state[i],
          prob,
          phase: cPhase(state[i]),
        });
      }
    }
    return out.sort((a, b) => b.prob - a.prob);
  }, [state, numQubits, threshold]);

  const phaseColor = (phase: number) => {
    const hue = (((phase + Math.PI) / (2 * Math.PI)) * 360) % 360;
    return `hsl(${hue}, 80%, 55%)`;
  };

  return (
    <div className="dirac-view">
      <div className="dirac-ket">|ψ⟩ = {terms.length === 0 ? '0' : terms.map((t, i) => (
        <span key={t.label}>
          {i > 0 && <span className="dirac-plus"> + </span>}
          <span
            className={`dirac-amp${selectedBasis === t.label ? ' active' : ''}`}
            style={{ '--phase-color': phaseColor(t.phase) } as React.CSSProperties}
            title={`phase: ${(t.phase * 180 / Math.PI).toFixed(1)}°`}
            onClick={() => setSelectedBasis((prev) => (prev === t.label ? null : t.label))}
            role="button"
          >
            ({formatComplex(t.amp, 3)})
          </span>
          <span
            className="dirac-basis"
            style={{ textDecoration: selectedBasis === t.label ? 'underline' : 'none' }}
            onClick={() => setSelectedBasis((prev) => (prev === t.label ? null : t.label))}
            role="button"
          >
            |{t.label}⟩
          </span>
        </span>
      ))}</div>
      <div className="dirac-probs">
        {terms.map(t => (
          <div
            key={t.label}
            className={`dirac-prob-row${selectedBasis === t.label ? ' active' : ''}`}
            onClick={() => setSelectedBasis((prev) => (prev === t.label ? null : t.label))}
            style={{ '--phase-color': phaseColor(t.phase) } as React.CSSProperties}
          >
            <span>|{t.label}⟩</span>
            <div className="dirac-prob-bar">
              <div
                className={`dirac-prob-fill${selectedBasis === t.label ? ' active' : ''}`}
                style={{
                  width: `${t.prob * 100}%`,
                }}
              />
            </div>
            <span>{(t.prob * 100).toFixed(1)}%</span>
            <span className="dirac-phase-val">
              {(t.phase * 180 / Math.PI).toFixed(1)}°
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
export default React.memo(DiracNotation);