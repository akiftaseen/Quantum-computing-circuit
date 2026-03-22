import type { Complex } from './complex';
import { getMagnitude } from './amplitudeAnalysis';
import { c, cAdd, cMul, cConj } from './complex';

/**
 * Compute Shannon entropy of a probability distribution.
 * 0 = pure state, log(dim) = maximally mixed.
 */
export const shannonEntropy = (probs: number[]): number => {
  let entropy = 0;
  for (const p of probs) {
    if (p > 1e-10) {
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
};

/**
 * Compute reduced density matrix for a single qubit.
 * Returned as 2x2 matrix [ρ00, ρ01; ρ10, ρ11] flattened to [ρ00, ρ01, ρ10, ρ11].
 */
export const reducedDensity1Q = (state: Complex[], qubit: number): Complex[] => {
  const numQubits = Math.log2(state.length);
  const dim = 1 << numQubits;
  const rho: Complex[] = [c(0), c(0), c(0), c(0)];

  for (let i = 0; i < dim; i += 1) {
    for (let j = 0; j < dim; j += 1) {
      // Check if i and j differ only in position `qubit`
      const iOther = i & ~(1 << qubit);
      const jOther = j & ~(1 << qubit);

      if (iOther === jOther) {
        const iBit = (i >> qubit) & 1;
        const jBit = (j >> qubit) & 1;
        const idx = iBit * 2 + jBit;

        const amp_i = state[i];
        const amp_j = state[j];
        const conj_j = cConj(amp_j);
        const product = cMul(amp_i, conj_j);

        rho[idx] = cAdd(rho[idx], product);
      }
    }
  }

  return rho;
};

/**
 * Compute concurrence between two qubits (measure of entanglement).
 * 0 = separable, 1 = maximally entangled.
 * Simplified version for 2Q sub-state.
 */
export const concurrence2Q = (state: Complex[], qubit1: number, qubit2: number): number => {
  const numQubits = Math.log2(state.length);
  const dim = 1 << numQubits;

  let rho00 = c(0), rho01 = c(0), rho10 = c(0), rho11 = c(0);

  // Extract 2Q sub-density matrix (traced over other qubits)
  for (let i = 0; i < dim; i += 1) {
    for (let j = 0; j < dim; j += 1) {
      const iOtherMask = ~((1 << qubit1) | (1 << qubit2));
      const jOtherMask = iOtherMask;

      if ((i & iOtherMask) === (j & jOtherMask)) {
        const iBit1 = (i >> qubit1) & 1;
        const iBit2 = (i >> qubit2) & 1;
        const jBit1 = (j >> qubit1) & 1;
        const jBit2 = (j >> qubit2) & 1;

        const amp_i = state[i];
        const amp_j = state[j];
        const conj_j = cConj(amp_j);
        const product = cMul(amp_i, conj_j);

        if (iBit1 === 0 && iBit2 === 0 && jBit1 === 0 && jBit2 === 0) {
          rho00 = cAdd(rho00, product);
        } else if (iBit1 === 0 && iBit2 === 1 && jBit1 === 0 && jBit2 === 1) {
          rho01 = cAdd(rho01, product);
        } else if (iBit1 === 1 && iBit2 === 0 && jBit1 === 1 && jBit2 === 0) {
          rho10 = cAdd(rho10, product);
        } else if (iBit1 === 1 && iBit2 === 1 && jBit1 === 1 && jBit2 === 1) {
          rho11 = cAdd(rho11, product);
        }
      }
    }
  }

  // Simplified concurrence estimate
  const trace = rho00.re + rho11.re;
  if (Math.abs(trace) < 1e-10) return 0;

  const off_diag_mag = getMagnitude(rho01);
  return Math.max(0, 2 * off_diag_mag - Math.abs(rho00.re) - Math.abs(rho11.re));
};

/**
 * Compute Bell parameter (S = E(a,b) + E(a,b') + E(a',b) - E(a',b')).
 * Values: -2 ≤ S ≤ 2 (classical), |S| > 2 (quantum/violates Bell inequality).
 * Simplified version measuring correlation.
 */
export const bellParameter2Q = (probabilities: Map<string, number>, totalShots: number): number => {
  const pp = (probabilities.get('00') ?? 0) / totalShots;
  const pm = (probabilities.get('01') ?? 0) / totalShots;
  const mp = (probabilities.get('10') ?? 0) / totalShots;
  const mm = (probabilities.get('11') ?? 0) / totalShots;

  // Simplified: correlation coefficient
  const correlation = pp + mm - pm - mp;
  return Math.abs(correlation);
};

/**
 * Entanglement summary for a circuit state.
 */
export interface EntanglementMetrics {
  globalEntropy: number;
  pairwiseEntanglement: Array<{
    qubits: [number, number];
    concurrence: number;
  }>;
  maxEntanglement: number;
}

export const computeEntanglementMetrics = (
  state: Complex[],
  numQubits: number,
): EntanglementMetrics => {
  // Compute probability distribution
  const probs = state.map((z) => {
    const mag = getMagnitude(z);
    return mag * mag;
  });

  const globalEntropy = shannonEntropy(probs);

  // Compute pairwise concurrence
  const pairwiseEntanglement: EntanglementMetrics['pairwiseEntanglement'] = [];
  let maxEntanglement = 0;

  for (let q1 = 0; q1 < numQubits; q1 += 1) {
    for (let q2 = q1 + 1; q2 < numQubits; q2 += 1) {
      const conc = concurrence2Q(state, q1, q2);
      pairwiseEntanglement.push({ qubits: [q1, q2], concurrence: conc });
      maxEntanglement = Math.max(maxEntanglement, conc);
    }
  }

  return {
    globalEntropy,
    pairwiseEntanglement,
    maxEntanglement,
  };
};
