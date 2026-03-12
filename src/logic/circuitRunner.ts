import type { CircuitState, GateName } from './circuitTypes';
import type { Complex } from './complex';
import { c } from './complex';
import {
  initZeroState, applySingleQubitGate, applyControlledGate,
  applySWAP, measureQubit,
} from './simulator';
import {
  I_GATE, H_GATE, X_GATE, Y_GATE, Z_GATE,
  S_GATE, SDG_GATE, T_GATE, TDG_GATE, Rx, Ry, Rz, PGate,
} from './gate';
import type { Matrix2 } from './gate';

export const getMatrix = (g: GateName, p: number[]): Matrix2 => {
  switch (g) {
    case 'I': return I_GATE; case 'H': return H_GATE;
    case 'X': return X_GATE; case 'Y': return Y_GATE; case 'Z': return Z_GATE;
    case 'S': return S_GATE; case 'Sdg': return SDG_GATE;
    case 'T': return T_GATE; case 'Tdg': return TDG_GATE;
    case 'Rx': return Rx(p[0] ?? 0); case 'Ry': return Ry(p[0] ?? 0);
    case 'Rz': return Rz(p[0] ?? 0); case 'P': return PGate(p[0] ?? 0);
    default: return I_GATE;
  }
};

export interface StepResult {
  state: Complex[];
  classicalBits: Map<number, number>;
}

export const runCircuit = (
  circuit: CircuitState, upToCol?: number, skipMeasure = false,
): StepResult => {
  const { numQubits, numColumns, gates } = circuit;
  let state = initZeroState(numQubits);
  const cb = new Map<number, number>();
  const maxCol = upToCol ?? numColumns - 1;

  for (let col = 0; col <= maxCol; col++) {
    const colGates = gates.filter(g => g.column === col);
    for (const g of colGates) {
      if (g.condition !== undefined && cb.get(g.condition) !== 1) continue;
      if (g.gate === 'Barrier') continue;
      if (g.gate === 'M') {
        if (skipMeasure) continue;
        const r = measureQubit(state, g.targets[0], numQubits);
        state = r.state;
        if (g.classicalBit !== undefined) cb.set(g.classicalBit, r.outcome);
        continue;
      }
      if (g.gate === 'SWAP') {
        state = applySWAP(state, g.targets[0], g.targets[1], numQubits);
        continue;
      }
      if (g.gate === 'CNOT') {
        state = applyControlledGate(state, X_GATE, g.controls, g.targets[0], numQubits);
        continue;
      }
      if (g.gate === 'CZ') {
        state = applyControlledGate(state, Z_GATE, g.controls, g.targets[0], numQubits);
        continue;
      }
      const mat = getMatrix(g.gate, g.params);
      state = g.controls.length > 0
        ? applyControlledGate(state, mat, g.controls, g.targets[0], numQubits)
        : applySingleQubitGate(state, mat, g.targets[0], numQubits);
    }
  }
  return { state, classicalBits: cb };
};

export const runWithShots = (
  circuit: CircuitState, shots: number,
): Map<string, number> => {
  const { numQubits } = circuit;
  const hist = new Map<string, number>();
  const hasMidMeasure = circuit.gates.some(g =>
    g.gate === 'M' && circuit.gates.some(g2 => g2.column > g.column && g2.gate !== 'M' && g2.gate !== 'Barrier')
  );

  if (!hasMidMeasure) {
    const { state } = runCircuit(circuit, undefined, true);
    const dim = 1 << numQubits;
    const probs = state.map(a => a.re * a.re + a.im * a.im);
    for (let s = 0; s < shots; s++) {
      const r = Math.random();
      let cum = 0;
      for (let i = 0; i < dim; i++) {
        cum += probs[i];
        if (r < cum) {
          const k = i.toString(2).padStart(numQubits, '0');
          hist.set(k, (hist.get(k) || 0) + 1);
          break;
        }
      }
    }
  } else {
    for (let s = 0; s < shots; s++) {
      const { state } = runCircuit(circuit);
      const dim = 1 << numQubits;
      const probs = state.map(a => a.re * a.re + a.im * a.im);
      const r = Math.random();
      let cum = 0;
      for (let i = 0; i < dim; i++) {
        cum += probs[i];
        if (r < cum) {
          const k = i.toString(2).padStart(numQubits, '0');
          hist.set(k, (hist.get(k) || 0) + 1);
          break;
        }
      }
    }
  }
  return hist;
};

export const computeUnitary2Q = (circuit: CircuitState): Complex[][] | null => {
  if (circuit.numQubits > 2) return null;
  const dim = 1 << circuit.numQubits;
  const cols: Complex[][] = [];
  for (let j = 0; j < dim; j++) {
    const basis: Complex[] = Array(dim).fill(null).map(() => c(0));
    basis[j] = c(1);
    let st = basis;
    const circ: CircuitState = { ...circuit, gates: circuit.gates.filter(g => g.gate !== 'M' && g.gate !== 'Barrier') };
    for (let col = 0; col < circ.numColumns; col++) {
      for (const g of circ.gates.filter(g2 => g2.column === col)) {
        if (g.gate === 'SWAP') { st = applySWAP(st, g.targets[0], g.targets[1], circ.numQubits); continue; }
        if (g.gate === 'CNOT') { st = applyControlledGate(st, X_GATE, g.controls, g.targets[0], circ.numQubits); continue; }
        if (g.gate === 'CZ') { st = applyControlledGate(st, Z_GATE, g.controls, g.targets[0], circ.numQubits); continue; }
        const mat = getMatrix(g.gate, g.params);
        st = g.controls.length > 0
          ? applyControlledGate(st, mat, g.controls, g.targets[0], circ.numQubits)
          : applySingleQubitGate(st, mat, g.targets[0], circ.numQubits);
      }
    }
    cols.push(st);
  }
  return Array.from({ length: dim }, (_, i) =>
    Array.from({ length: dim }, (_, j) => cols[j][i])
  );
};