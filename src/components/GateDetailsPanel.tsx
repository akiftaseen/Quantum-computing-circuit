import React from 'react';
import type { PlacedGate } from '../logic/circuitTypes';
import { isSingleQubit, gateDisplayName, isParametric } from '../logic/circuitTypes';
import { getMatrix } from '../logic/circuitRunner';
import { formatComplex } from '../logic/complex';
import type { Complex } from '../logic/complex';

interface Props { gate: PlacedGate | null; }

const MatCell: React.FC<{ z: Complex }> = ({ z }) => (
  <td className="mat-cell">{formatComplex(z, 3)}</td>
);

const GateDetailsPanel: React.FC<Props> = ({ gate }) => {
  if (!gate || !isSingleQubit(gate.gate)) return (
    <div className="gate-details-empty">Click a single-qubit gate to see its matrix.</div>
  );
  const m = getMatrix(gate.gate, gate.params);
  const name = gateDisplayName[gate.gate];
  const paramStr = isParametric(gate.gate) && gate.params[0] !== undefined
    ? `(${(gate.params[0] / Math.PI).toFixed(3)}π)` : '';

  return (
    <div className="gate-details">
      <h4>{name}{paramStr} Matrix</h4>
      <table className="matrix-table">
        <tbody>
          <tr><MatCell z={m[0]} /><MatCell z={m[1]} /></tr>
          <tr><MatCell z={m[2]} /><MatCell z={m[3]} /></tr>
        </tbody>
      </table>
      {gate.gate === 'H' && <div className="gate-identity">H = (X + Z) / √2</div>}
      {gate.gate === 'S' && <div className="gate-identity">S = √Z = P(π/2)</div>}
      {gate.gate === 'T' && <div className="gate-identity">T = ⁴√Z = P(π/4)</div>}
    </div>
  );
};
export default GateDetailsPanel;