import type { CircuitState, PlacedGate, GateName } from './circuitTypes';
import { newGateId } from './circuitTypes';

const g = (gate: GateName, col: number, targets: number[], controls: number[] = [], params: number[] = [], cb?: number): PlacedGate => ({
  id: newGateId(), gate, column: col, targets, controls, params,
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

export const groversSearch = (): CircuitState => ({
  numQubits: 3, numColumns: 18,
  gates: [
    // Initialize superposition
    g('H', 0, [0]), g('H', 0, [1]), g('H', 0, [2]),
    // Oracle: mark state |101⟩
    g('X', 1, [0]), g('X', 1, [1]),
    g('H', 2, [2]), g('CCX', 3, [2], [0, 1]), g('H', 4, [2]),
    g('X', 5, [0]), g('X', 5, [1]),
    // Diffusion operator
    g('H', 6, [0]), g('H', 6, [1]), g('H', 6, [2]),
    g('X', 7, [0]), g('X', 7, [1]), g('X', 7, [2]),
    g('H', 8, [2]), g('CCX', 9, [2], [0, 1]), g('H', 10, [2]),
    g('X', 11, [0]), g('X', 11, [1]), g('X', 11, [2]),
    g('H', 12, [0]), g('H', 12, [1]), g('H', 12, [2]),
    // Measurement
    g('M', 14, [0], [], [], 0), g('M', 14, [1], [], [], 1), g('M', 14, [2], [], [], 2),
  ],
});

export const vqeAnsatz = (): CircuitState => ({
  numQubits: 2, numColumns: 15,
  gates: [
    // VQE: Ry-CNOT-Ry ansatz with parameterized gates
    g('Ry', 0, [0], [], [Math.PI / 4]),
    g('Ry', 0, [1], [], [Math.PI / 3]),
    g('CNOT', 1, [1], [0]),
    g('Ry', 2, [0], [], [Math.PI / 6]),
    g('Ry', 2, [1], [], [Math.PI / 5]),
    g('CNOT', 3, [1], [0]),
    g('Ry', 4, [0], [], [Math.PI / 2]),
    // Measurement to get expectation values
    g('M', 6, [0], [], [], 0), g('M', 6, [1], [], [], 1),
  ],
});

export const ising2D = (): CircuitState => ({
  numQubits: 2, numColumns: 12,
  gates: [
    // 2-qubit Ising model: XX and ZZ interactions
    g('H', 0, [0]), g('H', 0, [1]),
    g('XX', 1, [0, 1], [], [Math.PI / 4]),
    g('ZZ', 2, [0, 1], [], [Math.PI / 6]),
    g('YY', 3, [0, 1], [], [Math.PI / 5]),
    g('Rx', 4, [0], [], [Math.PI / 3]),
    g('Rx', 4, [1], [], [Math.PI / 4]),
    // Measurement
    g('M', 6, [0], [], [], 0), g('M', 6, [1], [], [], 1),
  ],
});

export const TEMPLATES = [
  { name: 'Bell Pair', build: bellPair },
  { name: 'GHZ (3q)', build: ghz3 },
  { name: 'Teleportation', build: teleportation },
  { name: 'Deutsch-Jozsa', build: deutschJozsa },
  { name: 'QFT (3q)', build: qft3 },
  { name: "Grover's Search", build: groversSearch },
  { name: 'VQE Ansatz', build: vqeAnsatz },
  { name: 'Ising 2D', build: ising2D },
] as const;