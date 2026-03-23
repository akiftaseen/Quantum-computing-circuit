import type { Complex } from './complex';
import { c, cAbs2, cAdd, cMul } from './complex';

export type MeasurementBasisAxis = 'X' | 'Y' | 'Z';

const SQRT1_2 = Math.SQRT1_2;

const applySingleQubitUnitary = (
  state: Complex[],
  numQubits: number,
  qubit: number,
  m00: Complex,
  m01: Complex,
  m10: Complex,
  m11: Complex,
): Complex[] => {
  const out = state.slice();
  const mask = 1 << qubit;
  const dim = 1 << numQubits;

  for (let i = 0; i < dim; i += 1) {
    if ((i & mask) !== 0) continue;
    const j = i | mask;
    const a = out[i];
    const b = out[j];
    out[i] = cAdd(cMul(m00, a), cMul(m01, b));
    out[j] = cAdd(cMul(m10, a), cMul(m11, b));
  }

  return out;
};

export const rotateStateForMeasurementBasis = (
  state: Complex[],
  numQubits: number,
  bases?: MeasurementBasisAxis[],
): Complex[] => {
  if (!bases || bases.length === 0) return state;

  let rotated = state.slice();
  for (let q = 0; q < numQubits; q += 1) {
    const basis = bases[q] ?? 'Z';
    if (basis === 'Z') continue;

    if (basis === 'X') {
      rotated = applySingleQubitUnitary(
        rotated,
        numQubits,
        q,
        c(SQRT1_2, 0),
        c(SQRT1_2, 0),
        c(SQRT1_2, 0),
        c(-SQRT1_2, 0),
      );
      continue;
    }

    // Y-basis measurement via U = H * S†
    rotated = applySingleQubitUnitary(
      rotated,
      numQubits,
      q,
      c(SQRT1_2, 0),
      c(0, -SQRT1_2),
      c(SQRT1_2, 0),
      c(0, SQRT1_2),
    );
  }

  return rotated;
};

export const basisDistributionFromState = (
  state: Complex[],
  numQubits: number,
  bases?: MeasurementBasisAxis[],
): Array<{ basis: string; probability: number }> => {
  const rotated = rotateStateForMeasurementBasis(state, numQubits, bases);
  const dim = 1 << numQubits;

  const entries = Array.from({ length: dim }, (_, i) => ({
    basis: i.toString(2).padStart(numQubits, '0'),
    probability: cAbs2(rotated[i]),
  }));

  const total = entries.reduce((sum, e) => sum + e.probability, 0);
  const norm = total > 1e-12 ? total : 1;

  return entries
    .map((entry) => ({ ...entry, probability: entry.probability / norm }))
    .sort((a, b) => b.probability - a.probability);
};
