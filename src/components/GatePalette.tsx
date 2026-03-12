import React from 'react';
import type { GateName } from '../logic/circuitTypes';

const CATS: { label: string; gates: { n: GateName; d: string; tip: string }[] }[] = [
  { label: 'Single', gates: [
    { n:'H', d:'H', tip:'Hadamard' }, { n:'X', d:'X', tip:'Pauli-X (NOT)' },
    { n:'Y', d:'Y', tip:'Pauli-Y' }, { n:'Z', d:'Z', tip:'Pauli-Z' },
    { n:'S', d:'S', tip:'S = √Z' }, { n:'Sdg', d:'S†', tip:'S-dagger' },
    { n:'T', d:'T', tip:'T = ⁴√Z' }, { n:'Tdg', d:'T†', tip:'T-dagger' },
  ]},
  { label: 'Parametric', gates: [
    { n:'Rx', d:'Rx', tip:'Rx(θ)' }, { n:'Ry', d:'Ry', tip:'Ry(θ)' },
    { n:'Rz', d:'Rz', tip:'Rz(θ)' }, { n:'P', d:'P', tip:'Phase(φ)' },
  ]},
  { label: 'Multi-Qubit', gates: [
    { n:'CNOT', d:'CX', tip:'CNOT / Controlled-X' }, { n:'CZ', d:'CZ', tip:'Controlled-Z' },
    { n:'SWAP', d:'SW', tip:'SWAP' },
  ]},
  { label: 'Other', gates: [
    { n:'M', d:'M', tip:'Measure (Z basis)' }, { n:'Barrier', d:'┃', tip:'Barrier' },
  ]},
];

const GatePalette: React.FC = () => {
  const onDrag = (e: React.DragEvent, g: GateName) => {
    e.dataTransfer.setData('application/gate', g);
    e.dataTransfer.effectAllowed = 'copy';
  };
  return (
    <div className="gate-palette" role="toolbar" aria-label="Gate palette">
      {CATS.map(cat => (
        <div key={cat.label} className="gate-cat">
          <div className="gate-cat-label">{cat.label}</div>
          <div className="gate-list">
            {cat.gates.map(g => (
              <div key={g.n} className="gate-item" draggable title={g.tip}
                onDragStart={e => onDrag(e, g.n)} tabIndex={0} role="button" aria-label={g.tip}>
                {g.d}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
export default GatePalette;