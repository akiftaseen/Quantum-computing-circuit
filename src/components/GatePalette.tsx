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
      { id: 'P', label: 'P' },
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
      { id: 'CCX', label: 'CCX' },
      { id: 'iSWAP', label: 'iSW' },
    ],
  },
  {
    name: 'Interactions',
    gates: [
      { id: 'XX', label: 'XX' },
      { id: 'YY', label: 'YY' },
      { id: 'ZZ', label: 'ZZ' },
    ],
  },
];

const GatePalette: React.FC = () => {
  const onDragStart = (e: React.DragEvent, gateId: string) => {
    e.dataTransfer.setData('gateId', gateId);
    e.dataTransfer.effectAllowed = 'copy';

    const chip = document.createElement('div');
    chip.textContent = gateId;
    chip.className = 'palette-drag-ghost';
    document.body.appendChild(chip);
    e.dataTransfer.setDragImage(chip, chip.offsetWidth / 2, chip.offsetHeight / 2);
    requestAnimationFrame(() => chip.remove());
  };

  return (
    <div className="palette">
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
                title={`Drag ${g.id} into the circuit`}
              >
                {g.label}
              </span>
            ))}
          </div>
        </div>
      ))}

      <p className="palette-hint">Drag gates into the circuit workspace</p>
    </div>
  );
};

export default GatePalette;