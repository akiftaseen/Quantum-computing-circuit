// src/logic/circuitRunner.ts
import type { SimpleCircuit } from './circuitTypes';
import type { Complex } from './complex';
import { initZeroState, applySingleQubitGate } from './simulator';
import {
  H_GATE,
  X_GATE,
  Y_GATE,
  Z_GATE,
  S_GATE,
  T_GATE,
} from './gate';

import type { GateName } from './circuitTypes';

const getGateMatrix = (name: GateName) => {
  switch (name) {
    case 'H':
      return H_GATE;
    case 'X':
      return X_GATE;
    case 'Y':
      return Y_GATE;
    case 'Z':
      return Z_GATE;
    case 'S':
      return S_GATE;
    case 'T':
      return T_GATE;
    default:
      // This should never happen if GateName is kept in sync
      throw new Error(`Unsupported gate: ${name}`);
  }
};

export const runSimpleCircuit = (circuit: SimpleCircuit): Complex[] => {
  const { numQubits, numColumns, gates } = circuit;
  let state = initZeroState(numQubits);

  // For now we only support single-qubit gates (any number of qubits is fine).
  for (let col = 0; col < numColumns; col++) {
    const gatesThisCol = gates.filter((g) => g.column === col);

    for (const g of gatesThisCol) {
      const matrix = getGateMatrix(g.gate);
      state = applySingleQubitGate(state, matrix, g.qubit, numQubits);
    }
  }

  return state;
};