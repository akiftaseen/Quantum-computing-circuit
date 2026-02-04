// src/components/GateTile.tsx
import React from 'react';
import type { PlacedGate } from '../logic/circuitTypes';

interface GateTileProps {
  gate: PlacedGate;
}

const GateTile: React.FC<GateTileProps> = ({ gate }) => {
  return (
    <div className="gate-tile">
      {gate.gate}
    </div>
  );
};

export default GateTile;