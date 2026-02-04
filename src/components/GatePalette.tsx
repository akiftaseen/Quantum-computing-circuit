// src/components/GatePalette.tsx
import React from 'react';
import type { GateName } from '../logic/circuitTypes';

const GATE_TYPES: GateName[] = ['H', 'X', 'Y', 'Z', 'S', 'T'];

const GatePalette: React.FC = () => {
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, gate: GateName) => {
    e.dataTransfer.setData('application/gate', gate);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="gate-palette">
      <h2>Gate Palette</h2>
      <div className="gate-list">
        {GATE_TYPES.map((g) => (
          <div
            key={g}
            className="gate-item"
            draggable
            onDragStart={(e) => handleDragStart(e, g)}
          >
            {g}
          </div>
        ))}
      </div>
    </div>
  );
};

export default GatePalette;