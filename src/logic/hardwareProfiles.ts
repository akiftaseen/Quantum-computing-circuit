import type { CircuitState, GateName } from './circuitTypes';

export interface HardwareProfile {
  id: string;
  name: string;
  basisGates: GateName[];
  couplingEdges: Array<[number, number]>;
  t1Us: number;
  t2Us: number;
  readoutError: number;
  cxError: number;
}

export interface HardwareCompatibilityReport {
  unsupportedGateCounts: Record<string, number>;
  unsupportedTotal: number;
  edgeViolations: number;
  estimatedSwapOverhead: number;
  compatibilityScore: number;
  notes: string[];
}

const toUndirectedKey = (a: number, b: number): string => {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return `${lo}-${hi}`;
};

const isEdgeAllowed = (edges: Array<[number, number]>, qA: number, qB: number): boolean => {
  const allowed = new Set(edges.map(([a, b]) => toUndirectedKey(a, b)));
  return allowed.has(toUndirectedKey(qA, qB));
};

export const HARDWARE_PROFILES: HardwareProfile[] = [
  {
    id: 'all-to-all-ideal',
    name: 'Ideal All-to-All (Reference)',
    basisGates: ['I', 'H', 'X', 'Y', 'Z', 'S', 'Sdg', 'T', 'Tdg', 'Rx', 'Ry', 'Rz', 'P', 'CNOT', 'CZ', 'SWAP', 'CCX', 'iSWAP', 'XX', 'YY', 'ZZ', 'M', 'Barrier'],
    couplingEdges: [],
    t1Us: 180,
    t2Us: 140,
    readoutError: 0.01,
    cxError: 0.01,
  },
  {
    id: '5q-line',
    name: '5Q Line (NISQ)',
    basisGates: ['I', 'X', 'SX', 'Rz', 'CNOT', 'M', 'Barrier'] as unknown as GateName[],
    couplingEdges: [[0, 1], [1, 2], [2, 3], [3, 4]],
    t1Us: 90,
    t2Us: 70,
    readoutError: 0.03,
    cxError: 0.02,
  },
  {
    id: '7q-heavy-hex-lite',
    name: '7Q Heavy-Hex Lite',
    basisGates: ['I', 'X', 'SX', 'Rz', 'CNOT', 'M', 'Barrier'] as unknown as GateName[],
    couplingEdges: [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [3, 6]],
    t1Us: 110,
    t2Us: 85,
    readoutError: 0.025,
    cxError: 0.015,
  },
];

const nativeGateSet = (profile: HardwareProfile): Set<string> => {
  const expanded = new Set<string>(profile.basisGates);
  if (expanded.has('SX')) {
    expanded.add('X');
    expanded.add('Rx');
    expanded.add('Ry');
    expanded.add('Rz');
  }
  return expanded;
};

export const evaluateCircuitAgainstHardware = (
  circuit: CircuitState,
  profile: HardwareProfile,
): HardwareCompatibilityReport => {
  const unsupportedGateCounts: Record<string, number> = {};
  let unsupportedTotal = 0;
  let edgeViolations = 0;

  const native = nativeGateSet(profile);
  const allToAll = profile.couplingEdges.length === 0;

  for (const gate of circuit.gates) {
    if (!native.has(gate.gate)) {
      unsupportedGateCounts[gate.gate] = (unsupportedGateCounts[gate.gate] ?? 0) + 1;
      unsupportedTotal += 1;
    }

    if (!allToAll && ['CNOT', 'CZ', 'SWAP', 'XX', 'YY', 'ZZ', 'iSWAP'].includes(gate.gate)) {
      const wires = [...gate.controls, ...gate.targets];
      if (wires.length >= 2) {
        const qA = wires[0];
        const qB = wires[1];
        if (!isEdgeAllowed(profile.couplingEdges, qA, qB)) {
          edgeViolations += 1;
        }
      }
    }
  }

  const estimatedSwapOverhead = edgeViolations * 2;
  const gatePenalty = unsupportedTotal * 2.5;
  const swapPenalty = estimatedSwapOverhead * 1.5;
  const errorPenalty = (profile.cxError * 100 + profile.readoutError * 60);
  const compatibilityScore = Math.max(0, Math.min(100, 100 - gatePenalty - swapPenalty - errorPenalty));

  const notes: string[] = [];
  if (unsupportedTotal > 0) notes.push('Some gates are non-native and will require decomposition.');
  if (edgeViolations > 0) notes.push('Two-qubit connectivity constraints imply inserted SWAP chains.');
  if (unsupportedTotal === 0 && edgeViolations === 0) notes.push('Circuit is hardware-friendly for this profile.');

  return {
    unsupportedGateCounts,
    unsupportedTotal,
    edgeViolations,
    estimatedSwapOverhead,
    compatibilityScore,
    notes,
  };
};
