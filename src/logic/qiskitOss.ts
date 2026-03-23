import type { CircuitState, GateName, PlacedGate } from './circuitTypes';
import { newGateId } from './circuitTypes';

type TranspileLevel = 0 | 1 | 2 | 3;

export interface TranspileReport {
  circuit: CircuitState;
  beforeGateCount: number;
  afterGateCount: number;
  beforeDepth: number;
  afterDepth: number;
  fusedOrCancelled: number;
}

const EPS = 1e-9;

const sortByColumn = (gates: PlacedGate[]): PlacedGate[] =>
  [...gates].sort((a, b) => (a.column - b.column) || a.id.localeCompare(b.id));

const gateWires = (g: PlacedGate): number[] => [...g.controls, ...g.targets].sort((a, b) => a - b);

const sameWires = (a: PlacedGate, b: PlacedGate): boolean => {
  const wa = gateWires(a);
  const wb = gateWires(b);
  if (wa.length !== wb.length) return false;
  for (let i = 0; i < wa.length; i += 1) {
    if (wa[i] !== wb[i]) return false;
  }
  return true;
};

const gatesCancel = (a: PlacedGate, b: PlacedGate): boolean => {
  if (!sameWires(a, b)) return false;

  if (a.gate === b.gate && ['H', 'X', 'Y', 'Z', 'CNOT', 'CZ', 'SWAP', 'CCX', 'iSWAP'].includes(a.gate)) {
    return true;
  }

  if ((a.gate === 'S' && b.gate === 'Sdg') || (a.gate === 'Sdg' && b.gate === 'S')) return true;
  if ((a.gate === 'T' && b.gate === 'Tdg') || (a.gate === 'Tdg' && b.gate === 'T')) return true;

  return false;
};

const compactColumns = (circuit: CircuitState): CircuitState => {
  const gates = sortByColumn(circuit.gates).map((g) => ({ ...g, column: 0 }));
  const occupancy: Array<Set<number>> = [];

  for (const g of gates) {
    const wires = gateWires(g);
    let col = 0;
    while (true) {
      if (!occupancy[col]) occupancy[col] = new Set<number>();
      const blocked = wires.some((w) => occupancy[col].has(w));
      if (!blocked) {
        g.column = col;
        for (const w of wires) occupancy[col].add(w);
        break;
      }
      col += 1;
    }
  }

  const maxCol = gates.reduce((mx, g) => Math.max(mx, g.column), 0);
  return {
    ...circuit,
    gates,
    numColumns: Math.max(8, maxCol + 2),
  };
};

const simplifyLinearPass = (circuit: CircuitState, mergeAngles: boolean): CircuitState => {
  const sorted = sortByColumn(circuit.gates);
  const out: PlacedGate[] = [];

  for (const gate of sorted) {
    if (gate.gate === 'I') continue;

    const prev = out[out.length - 1];
    if (prev && gatesCancel(prev, gate)) {
      out.pop();
      continue;
    }

    if (
      mergeAngles &&
      prev &&
      prev.gate === gate.gate &&
      ['Rx', 'Ry', 'Rz', 'P', 'XX', 'YY', 'ZZ'].includes(gate.gate) &&
      sameWires(prev, gate)
    ) {
      const a = prev.params[0] ?? 0;
      const b = gate.params[0] ?? 0;
      const next = a + b;
      if (Math.abs(next) < EPS) {
        out.pop();
      } else {
        prev.params = [next];
      }
      continue;
    }

    out.push({ ...gate });
  }

  const relabeled = out.map((g, i) => ({ ...g, column: i }));
  return {
    ...circuit,
    gates: relabeled,
    numColumns: Math.max(8, relabeled.length + 2),
  };
};

export const transpileLikePreset = (circuit: CircuitState, level: TranspileLevel): CircuitState => {
  if (level === 0) {
    return { ...circuit, gates: circuit.gates.map((g) => ({ ...g })) };
  }

  let next = simplifyLinearPass(circuit, false);
  if (level >= 2) next = simplifyLinearPass(next, true);
  if (level >= 3) next = compactColumns(next);
  return next;
};

export const transpileLikePresetReport = (circuit: CircuitState, level: TranspileLevel): TranspileReport => {
  const beforeDepth = Math.max(0, ...circuit.gates.map((g) => g.column)) + (circuit.gates.length > 0 ? 1 : 0);
  const optimized = transpileLikePreset(circuit, level);
  const afterDepth = Math.max(0, ...optimized.gates.map((g) => g.column)) + (optimized.gates.length > 0 ? 1 : 0);

  return {
    circuit: optimized,
    beforeGateCount: circuit.gates.length,
    afterGateCount: optimized.gates.length,
    beforeDepth,
    afterDepth,
    fusedOrCancelled: Math.max(0, circuit.gates.length - optimized.gates.length),
  };
};

const angleIsMultipleOfHalfPi = (theta: number): boolean => {
  const ratio = theta / (Math.PI / 2);
  return Math.abs(ratio - Math.round(ratio)) < 1e-8;
};

export const isCliffordLikeCircuit = (circuit: CircuitState): { isClifford: boolean; reason: string } => {
  for (const gate of circuit.gates) {
    if (['H', 'X', 'Y', 'Z', 'S', 'Sdg', 'CNOT', 'CZ', 'SWAP', 'Barrier', 'M', 'I'].includes(gate.gate)) {
      continue;
    }

    if (['Rx', 'Ry', 'Rz', 'P'].includes(gate.gate)) {
      const theta = gate.params[0] ?? 0;
      if (angleIsMultipleOfHalfPi(theta)) continue;
    }

    return {
      isClifford: false,
      reason: `${gate.gate} is non-Clifford for stabilizer fast path`,
    };
  }

  return {
    isClifford: true,
    reason: 'Circuit is Clifford-like and eligible for stabilizer fast path sampling',
  };
};

const lcg = (seed: number) => {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const pick = <T,>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length) % arr.length];

export const generateRandomCircuit = (numQubits: number, depth: number, seed: number): CircuitState => {
  const qubits = Math.max(1, Math.min(8, Math.round(numQubits)));
  const cols = Math.max(1, Math.min(128, Math.round(depth)));
  const rng = lcg(seed);

  const oneQ: GateName[] = ['H', 'X', 'Y', 'Z', 'S', 'T', 'Rx', 'Ry', 'Rz'];
  const twoQ: GateName[] = ['CNOT', 'CZ', 'SWAP', 'XX', 'YY', 'ZZ'];
  const gates: PlacedGate[] = [];

  for (let column = 0; column < cols; column += 1) {
    const useTwoQ = qubits > 1 && rng() < 0.35;
    if (!useTwoQ) {
      const gate = pick(rng, oneQ);
      const target = Math.floor(rng() * qubits);
      const param = ['Rx', 'Ry', 'Rz'].includes(gate) ? [(rng() * 2 - 1) * Math.PI] : [];
      gates.push({
        id: newGateId(),
        gate,
        column,
        targets: [target],
        controls: [],
        params: param,
      });
      continue;
    }

    const a = Math.floor(rng() * qubits);
    let b = Math.floor(rng() * qubits);
    if (b === a) b = (b + 1) % qubits;
    const gate = pick(rng, twoQ);

    if (gate === 'CNOT' || gate === 'CZ') {
      gates.push({
        id: newGateId(),
        gate,
        column,
        targets: [b],
        controls: [a],
        params: [],
      });
      continue;
    }

    const param = ['XX', 'YY', 'ZZ'].includes(gate) ? [(rng() * 2 - 1) * Math.PI] : [];
    gates.push({
      id: newGateId(),
      gate,
      column,
      targets: [a, b],
      controls: [],
      params: param,
    });
  }

  return {
    numQubits: qubits,
    numColumns: Math.max(8, cols + 2),
    gates,
  };
};

const fmtAngle = (theta: number): string => {
  const normalized = Math.abs(theta) < EPS ? 0 : theta;
  const ratio = normalized / Math.PI;
  const candidates: Array<[number, string]> = [
    [0, '0'],
    [1, 'pi'],
    [-1, '-pi'],
    [0.5, 'pi/2'],
    [-0.5, '-pi/2'],
    [0.25, 'pi/4'],
    [-0.25, '-pi/4'],
  ];
  for (const [r, text] of candidates) {
    if (Math.abs(ratio - r) < 1e-6) return text;
  }
  return normalized.toFixed(8);
};

const lineForGate = (g: PlacedGate): string => {
  const t0 = g.targets[0] ?? 0;
  const t1 = g.targets[1] ?? 0;
  const c0 = g.controls[0] ?? 0;
  const c1 = g.controls[1] ?? 0;
  const p0 = fmtAngle(g.params[0] ?? 0);

  switch (g.gate) {
    case 'H': return `h q[${t0}];`;
    case 'X': return `x q[${t0}];`;
    case 'Y': return `y q[${t0}];`;
    case 'Z': return `z q[${t0}];`;
    case 'S': return `s q[${t0}];`;
    case 'Sdg': return `sdg q[${t0}];`;
    case 'T': return `t q[${t0}];`;
    case 'Tdg': return `tdg q[${t0}];`;
    case 'I': return `id q[${t0}];`;
    case 'Rx': return `rx(${p0}) q[${t0}];`;
    case 'Ry': return `ry(${p0}) q[${t0}];`;
    case 'Rz': return `rz(${p0}) q[${t0}];`;
    case 'P': return `p(${p0}) q[${t0}];`;
    case 'CNOT': return `cx q[${c0}],q[${t0}];`;
    case 'CZ': return `cz q[${c0}],q[${t0}];`;
    case 'SWAP': return `swap q[${t0}],q[${t1}];`;
    case 'CCX': return `ccx q[${c0}],q[${c1}],q[${t0}];`;
    case 'XX': return `rxx(${p0}) q[${t0}],q[${t1}];`;
    case 'YY': return `ryy(${p0}) q[${t0}],q[${t1}];`;
    case 'ZZ': return `rzz(${p0}) q[${t0}],q[${t1}];`;
    case 'Barrier': return 'barrier q;';
    case 'M': return `measure q[${t0}] -> c[${g.classicalBit ?? t0}];`;
    case 'iSWAP': return `// iSWAP q[${t0}],q[${t1}] not in OpenQASM 2.0 core`;
    default: return `// Unsupported gate ${g.gate}`;
  }
};

export const exportOpenQasm2 = (circuit: CircuitState): string => {
  const lines = [
    'OPENQASM 2.0;',
    'include "qelib1.inc";',
    `qreg q[${circuit.numQubits}];`,
    `creg c[${circuit.numQubits}];`,
  ];

  for (const gate of sortByColumn(circuit.gates)) {
    lines.push(lineForGate(gate));
  }

  return `${lines.join('\n')}\n`;
};

export type { TranspileLevel };
