import React, { useMemo, useState } from 'react';
import { getBlochVector } from '../logic/simulator';
import type { Complex } from '../logic/complex';

interface Props {
  state: Complex[];
  numQubits: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const BasisExplorerPanel: React.FC<Props> = ({ state, numQubits }) => {
  const [qubit, setQubit] = useState(0);

  const basis = useMemo(() => {
    const [bx, by, bz] = getBlochVector(state, qubit, numQubits);
    return {
      X: { plus: clamp01((1 + bx) / 2), minus: clamp01((1 - bx) / 2) },
      Y: { plus: clamp01((1 + by) / 2), minus: clamp01((1 - by) / 2) },
      Z: { plus: clamp01((1 + bz) / 2), minus: clamp01((1 - bz) / 2) },
      bloch: [bx, by, bz] as const,
    };
  }, [state, qubit, numQubits]);

  return (
    <div className="basis-panel">
      <div className="basis-header">
        <h4 className="basis-title">Basis Explorer Lab</h4>
        <div className="basis-controls">
          <label>
            Qubit
            <select value={qubit} onChange={(e) => setQubit(Number(e.target.value))}>
              {Array.from({ length: numQubits }, (_, i) => (
                <option key={i} value={i}>q{i}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <p className="basis-subtitle">
        Compare expected outcomes across X, Y, and Z measurement frames for the selected qubit.
      </p>

      <div className="basis-grid">
        {(['X', 'Y', 'Z'] as const).map((axis) => (
          <div key={axis} className="basis-card">
            <div className="basis-card-title">{axis}-basis</div>
            <div className="basis-row">
              <span>{`|+${axis.toLowerCase()}\u27e9`}</span>
              <div className="basis-bar"><div style={{ width: `${basis[axis].plus * 100}%` }} /></div>
              <strong>{(basis[axis].plus * 100).toFixed(1)}%</strong>
            </div>
            <div className="basis-row">
              <span>{`|-${axis.toLowerCase()}\u27e9`}</span>
              <div className="basis-bar"><div style={{ width: `${basis[axis].minus * 100}%` }} /></div>
              <strong>{(basis[axis].minus * 100).toFixed(1)}%</strong>
            </div>
          </div>
        ))}
      </div>

      <div className="basis-bloch-readout">
        Bloch vector (q{qubit}): [{basis.bloch.map((v) => v.toFixed(3)).join(', ')}]
      </div>
    </div>
  );
};

export default React.memo(BasisExplorerPanel);
