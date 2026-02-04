// src/components/CircuitGrid.tsx
import React from 'react';
import type { SimpleCircuit, PlacedGate, GateName } from '../logic/circuitTypes';
import GateTile from './GateTile';

interface CircuitGridProps {
  circuit: SimpleCircuit;
  onPlaceGate: (gate: Omit<PlacedGate, 'id'>) => void;
}

const CircuitGrid: React.FC<CircuitGridProps> = ({ circuit, onPlaceGate }) => {
  const { numQubits, numColumns, gates } = circuit;

  const handleDrop = (
    e: React.DragEvent<HTMLDivElement>,
    qubit: number,
    column: number
  ) => {
    e.preventDefault();
    const gate = e.dataTransfer.getData('application/gate') as GateName | '';
    if (!gate) return;

    onPlaceGate({ gate, qubit, column });
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // 必须阻止默认行为才能触发 drop
  };

  return (
    <div className="circuit-grid">
      {Array.from({ length: numQubits }).map((_, q) => (
        <div className="circuit-row" key={q}>
          {Array.from({ length: numColumns }).map((_, col) => {
            const gateInCell = gates.find(
              (g) => g.qubit === q && g.column === col
            );

            return (
              <div
                key={col}
                className="circuit-cell"
                onDrop={(e) => handleDrop(e, q, col)}
                onDragOver={handleDragOver}
              >
                {gateInCell && <GateTile gate={gateInCell} />}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default CircuitGrid;