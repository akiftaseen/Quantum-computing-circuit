import { type Complex, c, cAdd, cMul, cAbs2, cConj, cScale } from './complex';
import type { Matrix2 } from './gate';

export const initZeroState = (n: number): Complex[] => {
  const dim = 1 << n;
  const s: Complex[] = Array(dim).fill(null).map(() => c(0));
  s[0] = c(1);
  return s;
};

export const applySingleQubitGate = (
  state: Complex[], gate: Matrix2, target: number, n: number,
): Complex[] => {
  const dim = 1 << n;
  const ns: Complex[] = Array(dim).fill(null).map(() => c(0));
  const mask = 1 << target;
  const [g00, g01, g10, g11] = gate;
  for (let i = 0; i < dim; i++) {
    if ((i & mask) === 0) {
      const j = i | mask;
      ns[i] = cAdd(cMul(g00, state[i]), cMul(g01, state[j]));
      ns[j] = cAdd(cMul(g10, state[i]), cMul(g11, state[j]));
    }
  }
  return ns;
};

export const applyControlledGate = (
  state: Complex[], gate: Matrix2, controls: number[], target: number, n: number,
): Complex[] => {
  const dim = 1 << n;
  const ns = state.slice();
  const tMask = 1 << target;
  const cMask = controls.reduce((m, q) => m | (1 << q), 0);
  const [g00, g01, g10, g11] = gate;
  for (let i = 0; i < dim; i++) {
    if ((i & tMask) !== 0) continue;
    if ((i & cMask) !== cMask) continue;
    const j = i | tMask;
    const a0 = state[i], a1 = state[j];
    ns[i] = cAdd(cMul(g00, a0), cMul(g01, a1));
    ns[j] = cAdd(cMul(g10, a0), cMul(g11, a1));
  }
  return ns;
};

export const applySWAP = (
  state: Complex[], q1: number, q2: number, n: number,
): Complex[] => {
  const dim = 1 << n;
  const ns = state.slice();
  const m1 = 1 << q1, m2 = 1 << q2;
  for (let i = 0; i < dim; i++) {
    const b1 = (i & m1) ? 1 : 0;
    const b2 = (i & m2) ? 1 : 0;
    if (b1 !== b2) {
      const sw = i ^ m1 ^ m2;
      if (i < sw) { const t = ns[i]; ns[i] = ns[sw]; ns[sw] = t; }
    }
  }
  return ns;
};

export const apply2QubitGate = (
  state: Complex[], gate: Complex[], q1: number, q2: number, n: number,
): Complex[] => {
  const dim = 1 << n;
  const ns: Complex[] = Array(dim).fill(null).map(() => c(0));
  const m1 = 1 << q1, m2 = 1 << q2;
  
  for (let i = 0; i < dim; i++) {
    const b1 = (i & m1) ? 1 : 0;
    const b2 = (i & m2) ? 1 : 0;
    
    for (let j = 0; j < 4; j++) {
      const jb1 = (j & 2) >> 1;
      const jb2 = (j & 1);
      const idx = (i & ~m1 & ~m2) | (jb1 << q1) | (jb2 << q2);
      const g_idx = (b1 << 1 | b2) * 4 + j;
      ns[idx] = cAdd(ns[idx], cMul(gate[g_idx], state[i]));
    }
  }
  return ns;
};

export const apply3QubitGate = (
  state: Complex[], gate: Complex[], q1: number, q2: number, q3: number, n: number,
): Complex[] => {
  const dim = 1 << n;
  const ns: Complex[] = Array(dim).fill(null).map(() => c(0));
  const m1 = 1 << q1, m2 = 1 << q2, m3 = 1 << q3;
  
  for (let i = 0; i < dim; i++) {
    const b1 = (i & m1) ? 1 : 0;
    const b2 = (i & m2) ? 1 : 0;
    const b3 = (i & m3) ? 1 : 0;
    
    for (let j = 0; j < 8; j++) {
      const jb1 = (j & 4) >> 2;
      const jb2 = (j & 2) >> 1;
      const jb3 = (j & 1);
      const idx = (i & ~m1 & ~m2 & ~m3) | (jb1 << q1) | (jb2 << q2) | (jb3 << q3);
      const g_idx = (b1 << 2 | b2 << 1 | b3) * 8 + j;
      ns[idx] = cAdd(ns[idx], cMul(gate[g_idx], state[i]));
    }
  }
  return ns;
};

export const measureQubit = (
  state: Complex[], qubit: number, n: number, forced?: number, randomSource?: () => number,
): { state: Complex[]; outcome: number; prob: number } => {
  const dim = 1 << n;
  const mask = 1 << qubit;
  let p0 = 0;
  for (let i = 0; i < dim; i++) if ((i & mask) === 0) p0 += cAbs2(state[i]);
  const rand = randomSource ?? Math.random;
  const outcome = forced !== undefined ? forced : (rand() < p0 ? 0 : 1);
  const prob = outcome === 0 ? p0 : 1 - p0;
  const norm = 1 / Math.sqrt(prob || 1e-15);
  const ns: Complex[] = Array(dim).fill(null).map(() => c(0));
  for (let i = 0; i < dim; i++) {
    if (((i & mask) ? 1 : 0) === outcome) ns[i] = cScale(state[i], norm);
  }
  return { state: ns, outcome, prob };
};

export const partialTrace = (
  state: Complex[], qubit: number, n: number,
): [Complex, Complex, Complex, Complex] => {
  const dim = 1 << n;
  const mask = 1 << qubit;
  let r00 = c(0), r01 = c(0), r10 = c(0), r11 = c(0);
  for (let i = 0; i < dim; i++) {
    if ((i & mask) !== 0) continue;
    const j = i | mask;
    r00 = cAdd(r00, cMul(state[i], cConj(state[i])));
    r01 = cAdd(r01, cMul(state[i], cConj(state[j])));
    r10 = cAdd(r10, cMul(state[j], cConj(state[i])));
    r11 = cAdd(r11, cMul(state[j], cConj(state[j])));
  }
  return [r00, r01, r10, r11];
};

export const getBlochVector = (
  state: Complex[], qubit: number, n: number,
): [number, number, number] => {
  const [r00, r01, , r11] = partialTrace(state, qubit, n);
  return [2 * r01.re, -2 * r01.im, r00.re - r11.re];
};