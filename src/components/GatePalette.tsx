import React from 'react';

const CATEGORIES = [
  {
    name: 'Basic',
    gates: [
      { id: 'H', label: 'H' },
      { id: 'I', label: 'I' },
    ],
  },
  {
    name: 'Pauli',
    gates: [
      { id: 'X', label: 'X' },
      { id: 'Y', label: 'Y' },
      { id: 'Z', label: 'Z' },
    ],
  },
  {
    name: 'Phase',
    gates: [
      { id: 'S', label: 'S' },
      { id: 'T', label: 'T' },
      { id: 'Sdg', label: 'S†' },
      { id: 'Tdg', label: 'T†' },
    ],
  },
  {
    name: 'Rotation',
    gates: [
      { id: 'Rx', label: 'Rx' },
      { id: 'Ry', label: 'Ry' },
      { id: 'Rz', label: 'Rz' },
    ],
  },
  {
    name: 'Multi-Qubit',
    gates: [
      { id: 'CNOT', label: 'CX' },
      { id: 'CZ', label: 'CZ' },
      { id: 'SWAP', label: 'SW' },
    ],
  },
];

const GatePalette: React.FC = () => {
  const onDragStart = (e: React.DragEvent, gateId: string) => {
    e.dataTransfer.setData('gateId', gateId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <aside className="palette">
      <h3 className="palette-heading">Gates</h3>

      {CATEGORIES.map((cat) => (
        <div key={cat.name} className="palette-group">
          <div className="palette-cat">{cat.name}</div>
          <div className="palette-chips">
            {cat.gates.map((g) => (
              <span
                key={g.id}
                className="palette-chip"
                draggable
                onDragStart={(e) => onDragStart(e, g.id)}
                title={`拖拽 ${g.id} 到电路`}
              >
                {g.label}
              </span>
            ))}
          </div>
        </div>
      ))}

      <p className="palette-hint">↑ 拖拽门到右侧电路上</p>
    </aside>
  );
};

export default GatePalette;