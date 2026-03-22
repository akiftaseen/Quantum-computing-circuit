import type { Complex } from './complex';
import { getMagnitude } from './amplitudeAnalysis';
import { c } from './complex';

const zeroState = (dim: number): Complex[] => Array.from({ length: dim }, () => c(0));

/**
 * Perform partial measurement on specific qubits and return collapsed state.
 * Returns { collapsedState, measuredOutcome, probability }.
 */
export const partialMeasure = (
  state: Complex[],
  numQubits: number,
  qubitsToMeasure: number[]
): {
  collapsedState: Complex[];
  measuredOutcome: string;
  probability: number;
} => {
  const dim = 1 << numQubits;

  // Compute probability for each possible outcome on measured qubits
  const outcomeProbs = new Map<number, number>();

  for (let i = 0; i < dim; i += 1) {
    const mag = getMagnitude(state[i]);
    const prob = mag * mag;

    if (prob > 1e-10) {
      // Extract bits for measured qubits
      let outcomeKey = 0;
      for (let k = 0; k < qubitsToMeasure.length; k += 1) {
        const bit = (i >> qubitsToMeasure[k]) & 1;
        outcomeKey |= bit << k;
      }

      outcomeProbs.set(outcomeKey, (outcomeProbs.get(outcomeKey) ?? 0) + prob);
    }
  }

  // Pick a random outcome weighted by probabilities
  const rand = Math.random();
  let cumProb = 0;
  let selectedOutcome = 0;

  for (const [outcome, prob] of outcomeProbs.entries()) {
    cumProb += prob;
    if (rand <= cumProb) {
      selectedOutcome = outcome;
      break;
    }
  }

  const collapseProbability = outcomeProbs.get(selectedOutcome) ?? 0;

  // Build collapsed state (renormalized)
  const collapsedState: Complex[] = zeroState(dim);

  for (let i = 0; i < dim; i += 1) {
    // Check if this basis state matches the measured outcome
    let matches = true;
    for (let k = 0; k < qubitsToMeasure.length; k += 1) {
      const bit = (i >> qubitsToMeasure[k]) & 1;
      const outcomeBit = (selectedOutcome >> k) & 1;
      if (bit !== outcomeBit) {
        matches = false;
        break;
      }
    }

    if (matches) {
      collapsedState[i] = state[i];
    }
  }

  // Renormalize
  const norm = Math.sqrt(collapseProbability);
  if (norm > 1e-10) {
    for (let i = 0; i < dim; i += 1) {
      const val = collapsedState[i];
      collapsedState[i] = { re: val.re / norm, im: val.im / norm };
    }
  }

  const measuredBits = qubitsToMeasure.map((q) => (selectedOutcome >> (qubitsToMeasure.indexOf(q))) & 1).join('');

  return {
    collapsedState,
    measuredOutcome: measuredBits,
    probability: collapseProbability,
  };
};

/**
 * Get conditional probabilities after partial measurement.
 * Returns P(unmeasured qubits | measured outcome).
 */
export const getConditionalProbabilities = (
  state: Complex[],
  numQubits: number,
  measureQubits: number[],
  measureOutcome: string
): Map<string, number> => {
  const dim = 1 << numQubits;
  const probs = new Map<string, number>();

  let totalProb = 0;

  for (let i = 0; i < dim; i += 1) {
    // Check if basis state matches measurement
    let matches = true;
    for (let k = 0; k < measureQubits.length; k += 1) {
      const bit = (i >> measureQubits[k]) & 1;
      const outcomeBit = parseInt(measureOutcome[k], 10);
      if (bit !== outcomeBit) {
        matches = false;
        break;
      }
    }

    if (matches) {
      const mag = getMagnitude(state[i]);
      const prob = mag * mag;
      totalProb += prob;

      // Build unmeasured qubit basis
      const unmeasuredQubits = Array.from({ length: numQubits }, (_, j) => j).filter(
        (q) => !measureQubits.includes(q)
      );

      const unmeasuredKey = unmeasuredQubits.map((q) => (i >> q) & 1).join('');
      probs.set(unmeasuredKey, (probs.get(unmeasuredKey) ?? 0) + prob);
    }
  }

  // Normalize
  if (totalProb > 1e-10) {
    for (const [key, prob] of probs.entries()) {
      probs.set(key, prob / totalProb);
    }
  }

  return probs;
};

export interface MeasurementOutcome {
  qubits: number[];
  outcome: string;
  probability: number;
  collapsedState: Complex[];
}

/**
 * Compute all possible measurement outcomes for a subset of qubits.
 */
export const allMeasurementOutcomes = (
  state: Complex[],
  numQubits: number,
  measureQubits: number[]
): MeasurementOutcome[] => {
  const dim = 1 << numQubits;
  const outcomes = new Map<string, { prob: number; state: Complex[] }>();

  for (let i = 0; i < dim; i += 1) {
    const mag = getMagnitude(state[i]);
    const prob = mag * mag;

    if (prob > 1e-10) {
      const outcomeKey = measureQubits.map((q) => (i >> q) & 1).join('');
      if (!outcomes.has(outcomeKey)) {
        outcomes.set(outcomeKey, { prob: 0, state: zeroState(dim) });
      }

      const entry = outcomes.get(outcomeKey)!;
      entry.prob += prob;
      entry.state[i] = state[i];
    }
  }

  // Renormalize and return
  const result: MeasurementOutcome[] = [];
  for (const [outcome, { prob, state: collapsedState }] of outcomes.entries()) {
    if (prob > 1e-10) {
      const norm = Math.sqrt(prob);
      const normalizedState: Complex[] = collapsedState.map((val) => ({ re: val.re / norm, im: val.im / norm }));

      result.push({
        qubits: measureQubits,
        outcome,
        probability: prob,
        collapsedState: normalizedState,
      });
    }
  }

  return result.sort((a, b) => b.probability - a.probability);
};
