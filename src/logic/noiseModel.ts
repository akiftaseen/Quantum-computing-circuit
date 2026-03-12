import type { Complex } from './complex';
import { c, cAbs2, cScale } from './complex';
import { applySingleQubitGate } from './simulator';
import { X_GATE, Y_GATE, Z_GATE } from './gate';
import type { Matrix2 } from './gate';

export interface NoiseConfig {
  enabled: boolean;
  depolarizing1q: number;
  amplitudeDamping: number;
  readoutError: number;
}

export const defaultNoise: NoiseConfig = {
  enabled: false, depolarizing1q: 0, amplitudeDamping: 0, readoutError: 0,
};

export const applyDepolarizing = (
  state: Complex[], qubit: number, n: number, p: number,
): Complex[] => {
  if (Math.random() > p) return state;
  const r = Math.random();
  if (r < 1 / 3) return applySingleQubitGate(state, X_GATE, qubit, n);
  if (r < 2 / 3) return applySingleQubitGate(state, Y_GATE, qubit, n);
  return applySingleQubitGate(state, Z_GATE, qubit, n);
};

export const applyAmplitudeDamping = (
  state: Complex[], qubit: number, n: number, gamma: number,
): Complex[] => {
  if (gamma <= 0) return state;
  const K0: Matrix2 = [c(1), c(0), c(0), c(Math.sqrt(1 - gamma))];
  const K1: Matrix2 = [c(0), c(Math.sqrt(gamma)), c(0), c(0)];
  const s0 = applySingleQubitGate(state, K0, qubit, n);
  const s1 = applySingleQubitGate(state, K1, qubit, n);
  const dim = 1 << n;
  let n0 = 0, n1 = 0;
  for (let i = 0; i < dim; i++) { n0 += cAbs2(s0[i]); n1 += cAbs2(s1[i]); }
  if (Math.random() < n0) {
    const sc = 1 / Math.sqrt(n0);
    return s0.map(a => cScale(a, sc));
  } else {
    const sc = 1 / Math.sqrt(n1 || 1e-15);
    return s1.map(a => cScale(a, sc));
  }
};

export const flipReadout = (bit: number, err: number): number =>
  Math.random() < err ? 1 - bit : bit;