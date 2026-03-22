import type { Complex } from './complex';
import { cAbs, cConj, cMul } from './complex';
import { getBlochVector } from './simulator';

type Axis = 'X' | 'Y' | 'Z';

export interface PairCorrelation {
  pair: [number, number];
  connectedZZ: number;
  strength: number;
}

const expectationZ = (state: Complex[], qubit: number): number => {
  let sum = 0;
  for (let i = 0; i < state.length; i += 1) {
    const prob = state[i].re * state[i].re + state[i].im * state[i].im;
    sum += (((i >> qubit) & 1) === 0 ? 1 : -1) * prob;
  }
  return sum;
};

const shannonEntropy2 = (p: number): number => {
  if (p < 1e-10 || p > 1 - 1e-10) return 0;
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
};

const pauliAction = (index: number, qubit: number, axis: Axis): { next: number; phaseRe: number; phaseIm: number } => {
  const bit = (index >> qubit) & 1;
  if (axis === 'X') {
    return { next: index ^ (1 << qubit), phaseRe: 1, phaseIm: 0 };
  }
  if (axis === 'Z') {
    return { next: index, phaseRe: bit === 0 ? 1 : -1, phaseIm: 0 };
  }

  // Y|0> = i|1>, Y|1> = -i|0>
  return {
    next: index ^ (1 << qubit),
    phaseRe: 0,
    phaseIm: bit === 0 ? 1 : -1,
  };
};

const expectationPauliPair = (
  state: Complex[],
  qA: number,
  axisA: Axis,
  qB: number,
  axisB: Axis,
): number => {
  let real = 0;

  for (let i = 0; i < state.length; i += 1) {
    const a = pauliAction(i, qA, axisA);
    const b = pauliAction(a.next, qB, axisB);

    const ampIConj = cConj(state[i]);
    const transformed = cMul({ re: a.phaseRe, im: a.phaseIm }, { re: b.phaseRe, im: b.phaseIm });
    const target = cMul(transformed, state[b.next]);
    const contrib = cMul(ampIConj, target);
    real += contrib.re;
  }

  return real;
};

export const computeSingleQubitEntropy = (
  state: Complex[],
  numQubits: number,
  qubit: number,
): number => {
  const [x, y, z] = getBlochVector(state, qubit, numQubits);
  const r = Math.min(1, Math.sqrt(x * x + y * y + z * z));
  const lambdaMax = (1 + r) / 2;
  return shannonEntropy2(lambdaMax);
};

export const computeConcurrence = (
  state: Complex[],
  numQubits: number,
  qubitA: number,
  qubitB: number,
): number | null => {
  if (numQubits !== 2) return null;

  const idx00 = 0;
  const idx01 = 1 << qubitB;
  const idx10 = 1 << qubitA;
  const idx11 = idx10 | idx01;

  const a = state[idx00];
  const b = state[idx01];
  const c = state[idx10];
  const d = state[idx11];

  const ad = cMul(a, d);
  const bc = cMul(b, c);
  return Math.min(1, 2 * cAbs({ re: ad.re - bc.re, im: ad.im - bc.im }));
};

export const computeCHSHCanonical = (
  state: Complex[],
  qubitA: number,
  qubitB: number,
): number => {
  const eZZ = expectationPauliPair(state, qubitA, 'Z', qubitB, 'Z');
  const eXX = expectationPauliPair(state, qubitA, 'X', qubitB, 'X');
  return Math.abs(Math.SQRT2 * (eZZ + eXX));
};

export const findCorrelatedQubitPairs = (
  state: Complex[],
  numQubits: number,
): PairCorrelation[] => {
  const zExp = Array.from({ length: numQubits }, (_, q) => expectationZ(state, q));
  const pairs: PairCorrelation[] = [];

  for (let a = 0; a < numQubits; a += 1) {
    for (let b = a + 1; b < numQubits; b += 1) {
      const zz = expectationPauliPair(state, a, 'Z', b, 'Z');
      const connected = zz - zExp[a] * zExp[b];
      pairs.push({ pair: [a, b], connectedZZ: connected, strength: Math.abs(connected) });
    }
  }

  return pairs.sort((x, y) => y.strength - x.strength);
};

export const computeSubsystemEntropyProfile = (
  state: Complex[],
  numQubits: number,
): number[] => {
  return Array.from({ length: numQubits }, (_, q) => computeSingleQubitEntropy(state, numQubits, q));
};
