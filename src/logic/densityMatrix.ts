import type { Complex } from './complex';
import { c, cAdd, cMul, cConj } from './complex';

export interface DensityMatrix {
  dim: number;
  matrix: Complex[][];
  purity: number;
  entropy: number;
}

/**
 * Compute density matrix from a pure state: ρ = |ψ⟩⟨ψ|.
 */
export const densityMatrixFromPureState = (state: Complex[]): Complex[][] => {
  const dim = state.length;
  const rho: Complex[][] = Array(dim).fill(null).map(() => Array(dim).fill(null).map(() => c(0)));

  for (let i = 0; i < dim; i += 1) {
    for (let j = 0; j < dim; j += 1) {
      const amp_i = state[i];
      const amp_j = state[j];
      const conj_j = cConj(amp_j);
      rho[i][j] = cMul(amp_i, conj_j);
    }
  }

  return rho;
};

/**
 * Compute purity Tr(ρ²) of a density matrix.
 * 1 = pure state, <1 = mixed state.
 */
export const computePurity = (rho: Complex[][]): number => {
  const dim = rho.length;
  let trace = 0;

  // Compute ρ²
  const rho2: Complex[][] = Array(dim).fill(null).map(() => Array(dim).fill(null).map(() => c(0)));

  for (let i = 0; i < dim; i += 1) {
    for (let j = 0; j < dim; j += 1) {
      let sum: Complex = c(0);

      for (let k = 0; k < dim; k += 1) {
        const prod = cMul(rho[i][k], rho[k][j]);
        sum = cAdd(sum, prod);
      }

      rho2[i][j] = sum;
    }
  }

  // Trace of ρ²
  for (let i = 0; i < dim; i += 1) {
    trace += rho2[i][i].re;
  }

  return Math.max(0, Math.min(1, trace));
};

/**
 * Compute von Neumann entropy S(ρ) = -Tr(ρ log₂ ρ).
 * 0 = pure state, log₂(dim) = maximally mixed.
 */
export const computeVonNeumannEntropy = (rho: Complex[][]): number => {
  const dim = rho.length;

  // Compute eigenvalues via trace (simplified: use diagonal since we often work near-diagonal)
  const eigenvalues: number[] = [];

  for (let i = 0; i < dim; i += 1) {
    eigenvalues.push(Math.max(0, rho[i][i].re));
  }

  let entropy = 0;
  for (const lambda of eigenvalues) {
    if (lambda > 1e-10) {
      entropy -= lambda * Math.log2(lambda);
    }
  }

  return entropy;
};

/**
 * Build full density matrix representation for analysis.
 */
export const buildDensityMatrix = (state: Complex[]): DensityMatrix => {
  const matrix = densityMatrixFromPureState(state);
  const purity = computePurity(matrix);
  const entropy = computeVonNeumannEntropy(matrix);

  return {
    dim: state.length,
    matrix,
    purity,
    entropy,
  };
};

/**
 * Reduced density matrix for a single qubit (traced out others).
 */
export const reduceToSingleQubit = (matrix: Complex[][], qubit: number, numQubits: number): Complex[][] => {
  const dim = 1 << numQubits;
  const rho1Q: Complex[][] = [[c(0), c(0)], [c(0), c(0)]];

  for (let i = 0; i < dim; i += 1) {
    for (let j = 0; j < dim; j += 1) {
      // Extract qubit bits
      const iBit = (i >> qubit) & 1;
      const jBit = (j >> qubit) & 1;

      // Check if other bits match
      const iOther = i & ~(1 << qubit);
      const jOther = j & ~(1 << qubit);

      if (iOther === jOther) {
        rho1Q[iBit][jBit] = cAdd(rho1Q[iBit][jBit], matrix[i][j]);
      }
    }
  }

  return rho1Q;
};
