import type { CircuitState, PlacedGate, GateName } from './circuitTypes';
import { newGateId } from './circuitTypes';

const g = (
  gate: GateName,
  col: number,
  targets: number[],
  controls: number[] = [],
  params: number[] = [],
  cb?: number,
  cond?: number,
): PlacedGate => ({
  id: newGateId(), gate, column: col, targets, controls, params,
  ...(cb !== undefined ? { classicalBit: cb } : {}),
  ...(cond !== undefined ? { condition: cond } : {}),
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
    // Classical feed-forward corrections on receiver q2.
    g('Z', 5, [2], [], [], undefined, 0),
    g('X', 5, [2], [], [], undefined, 1),
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

export const clusterState4 = (): CircuitState => ({
  numQubits: 4, numColumns: 14,
  gates: [
    g('H', 0, [0]), g('H', 0, [1]), g('H', 0, [2]), g('H', 0, [3]),
    g('CZ', 1, [1], [0]),
    g('CZ', 2, [2], [1]),
    g('CZ', 3, [3], [2]),
    g('M', 5, [0], [], [], 0), g('M', 5, [1], [], [], 1), g('M', 5, [2], [], [], 2), g('M', 5, [3], [], [], 3),
  ],
});

export const bernsteinVazirani = (): CircuitState => ({
  numQubits: 3, numColumns: 14,
  gates: [
    // Hidden string s = 11 with ancilla on q2
    g('X', 0, [2]),
    g('H', 1, [0]), g('H', 1, [1]), g('H', 1, [2]),
    g('CNOT', 2, [2], [0]),
    g('CNOT', 3, [2], [1]),
    g('H', 4, [0]), g('H', 4, [1]),
    g('M', 6, [0], [], [], 0), g('M', 6, [1], [], [], 1),
  ],
});

export const qaoaRing3 = (): CircuitState => ({
  numQubits: 3, numColumns: 16,
  gates: [
    g('H', 0, [0]), g('H', 0, [1]), g('H', 0, [2]),
    g('ZZ', 1, [0, 1], [], [Math.PI / 3]),
    g('ZZ', 2, [1, 2], [], [Math.PI / 3]),
    g('ZZ', 3, [2, 0], [], [Math.PI / 3]),
    g('Rx', 4, [0], [], [Math.PI / 4]),
    g('Rx', 4, [1], [], [Math.PI / 4]),
    g('Rx', 4, [2], [], [Math.PI / 4]),
    g('M', 6, [0], [], [], 0), g('M', 6, [1], [], [], 1), g('M', 6, [2], [], [], 2),
  ],
});

export const superposition4 = (): CircuitState => ({
  numQubits: 4, numColumns: 10,
  gates: [
    g('H', 0, [0]), g('H', 0, [1]), g('H', 0, [2]), g('H', 0, [3]),
    g('M', 2, [0], [], [], 0), g('M', 2, [1], [], [], 1), g('M', 2, [2], [], [], 2), g('M', 2, [3], [], [], 3),
  ],
});

export const phaseKickback2 = (): CircuitState => ({
  numQubits: 2, numColumns: 12,
  gates: [
    g('X', 0, [1]),
    g('H', 1, [0]),
    g('CZ', 2, [1], [0]),
    g('H', 3, [0]),
    g('M', 5, [0], [], [], 0), g('M', 5, [1], [], [], 1),
  ],
});

export const swapDemo2 = (): CircuitState => ({
  numQubits: 2, numColumns: 10,
  gates: [
    g('X', 0, [0]),
    g('H', 0, [1]),
    g('SWAP', 1, [0, 1]),
    g('M', 3, [0], [], [], 0), g('M', 3, [1], [], [], 1),
  ],
});

export const ringEntangler4 = (): CircuitState => ({
  numQubits: 4, numColumns: 14,
  gates: [
    g('H', 0, [0]), g('H', 0, [1]), g('H', 0, [2]), g('H', 0, [3]),
    g('CNOT', 1, [1], [0]),
    g('CNOT', 2, [2], [1]),
    g('CNOT', 3, [3], [2]),
    g('CNOT', 4, [0], [3]),
    g('M', 6, [0], [], [], 0), g('M', 6, [1], [], [], 1), g('M', 6, [2], [], [], 2), g('M', 6, [3], [], [], 3),
  ],
});

export const repetitionCode3 = (): CircuitState => ({
  numQubits: 3, numColumns: 14,
  gates: [
    // Encode logical qubit from q0 into 3-qubit repetition code
    g('H', 0, [0]),
    g('CNOT', 1, [1], [0]), g('CNOT', 2, [2], [0]),
    // Inject a sample bit-flip error and perform majority-vote correction
    g('X', 3, [1]),
    g('CCX', 4, [0], [1, 2]),
    g('CCX', 5, [1], [0, 2]),
    g('CCX', 6, [2], [0, 1]),
    g('M', 8, [0], [], [], 0), g('M', 8, [1], [], [], 1), g('M', 8, [2], [], [], 2),
  ],
});

export type CircuitTemplate = {
  name: string;
  build: () => CircuitState;
  qubits: number;
};

export type TemplateGroup = {
  name: string;
  templates: readonly CircuitTemplate[];
};

const beginnerTemplates: readonly CircuitTemplate[] = [
  { name: 'Bell Pair', build: bellPair, qubits: 2 },
  { name: 'GHZ', build: ghz3, qubits: 3 },
  { name: 'Superposition', build: superposition4, qubits: 4 },
  { name: 'Swap Demo', build: swapDemo2, qubits: 2 },
  { name: 'Phase Kickback', build: phaseKickback2, qubits: 2 },
];

const intermediateTemplates: readonly CircuitTemplate[] = [
  { name: 'Deutsch-Jozsa', build: deutschJozsa, qubits: 3 },
  { name: 'Teleportation', build: teleportation, qubits: 3 },
  { name: 'QFT', build: qft3, qubits: 3 },
  { name: 'Cluster State', build: clusterState4, qubits: 4 },
  { name: 'Ring Entangler', build: ringEntangler4, qubits: 4 },
  { name: 'Bernstein-Vazirani', build: bernsteinVazirani, qubits: 3 },
];

const advancedTemplates: readonly CircuitTemplate[] = [
  { name: "Grover's Search", build: groversSearch, qubits: 3 },
  { name: 'VQE Ansatz', build: vqeAnsatz, qubits: 2 },
  { name: 'QAOA Ring', build: qaoaRing3, qubits: 3 },
  { name: 'Ising 2D', build: ising2D, qubits: 2 },
  { name: 'Repetition Code', build: repetitionCode3, qubits: 3 },
];

export const TEMPLATE_GROUPS: readonly TemplateGroup[] = [
  { name: 'Beginner', templates: beginnerTemplates },
  { name: 'Intermediate', templates: intermediateTemplates },
  { name: 'Advanced', templates: advancedTemplates },
] as const;

export const TEMPLATES: readonly CircuitTemplate[] = TEMPLATE_GROUPS.flatMap((group) => group.templates);