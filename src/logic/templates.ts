import type { CircuitState, PlacedGate } from './circuitTypes';
import { newGateId } from './circuitTypes';

const g = (gate: string, col: number, targets: number[], controls: number[] = [], params: number[] = [], cb?: number): PlacedGate => ({
  id: newGateId(), gate: gate as any, column: col, targets, controls, params,
  ...(cb !== undefined ? { classicalBit: cb } : {}),
});

export const bellPair = (): CircuitState => ({
  numQubits: 2, numColumns: 10,
  gates: [g('H', 0, [0]), g('CNOT', 1, [1], [0])],
});

export const ghz3 = (): CircuitState => ({
  numQubits: 3, numColumns: 10,
  gates: [g('H', 0, [0]), g('CNOT', 1, [1], [0]), g('CNOT', 2, [2], [0])],
});

export const teleportation = (): CircuitState => ({
  numQubits: 3, numColumns: 10,
  gates: [
    g('H', 0, [1]), g('CNOT', 1, [2], [1]),
    g('CNOT', 2, [1], [0]), g('H', 3, [0]),
    g('M', 4, [0], [], [], 0), g('M', 4, [1], [], [], 1),
  ],
});

export const deutschJozsa = (): CircuitState => ({
  numQubits: 3, numColumns: 10,
  gates: [
    g('X', 0, [2]),
    g('H', 1, [0]), g('H', 1, [1]), g('H', 1, [2]),
    g('CNOT', 3, [2], [0]),
    g('H', 5, [0]), g('H', 5, [1]),
    g('M', 7, [0], [], [], 0), g('M', 7, [1], [], [], 1),
  ],
});

export const qft3 = (): CircuitState => ({
  numQubits: 3, numColumns: 12,
  gates: [
    g('H', 0, [0]),
    g('P', 1, [0], [1], [Math.PI / 2]),
    g('P', 2, [0], [2], [Math.PI / 4]),
    g('H', 3, [1]),
    g('P', 4, [1], [2], [Math.PI / 2]),
    g('H', 5, [2]),
    g('SWAP', 6, [0, 2]),
  ],
});

export const TEMPLATES = [
  { name: 'Bell Pair', build: bellPair },
  { name: 'GHZ (3q)', build: ghz3 },
  { name: 'Teleportation', build: teleportation },
  { name: 'Deutsch-Jozsa', build: deutschJozsa },
  { name: 'QFT (3q)', build: qft3 },
] as const;