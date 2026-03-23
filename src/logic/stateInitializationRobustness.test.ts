import { describe, expect, it } from 'vitest';
import {
  buildInitialState,
  buildInitialStateFromInput,
  getDickeTemplateExpression,
  parseInitialQubitStateDetailed,
} from './initialQubitState';
import { allMeasurementOutcomes, getConditionalProbabilities } from './measurementCollapse';

const prob = (z: { re: number; im: number }): number => z.re * z.re + z.im * z.im;

describe('initial state robustness', () => {
  it('accepts complex-valued per-qubit expressions and normalizes them', () => {
    const parsed = parseInitialQubitStateDetailed('1+i, 1-i');
    expect(parsed.valid).toBe(true);

    const p0 = prob(parsed.state[0]);
    const p1 = prob(parsed.state[1]);
    expect(p0 + p1).toBeCloseTo(1, 10);
  });

  it('provides clear invalid diagnostics for malformed qubit expressions', () => {
    const parsed = parseInitialQubitStateDetailed('sqrt(, 1');
    expect(parsed.valid).toBe(false);
    expect(parsed.message.toLowerCase()).toContain('invalid qubit expression');
  });

  it('builds product states consistently with per-qubit labels', () => {
    const built = buildInitialStateFromInput(2, 'qubit', ['0', '1'], '');
    expect(built.valid).toBe(true);
    expect(built.qubitLabels).toEqual(['|0⟩', '|1⟩']);

    // Qubit 0 is LSB: |q1 q0> = |10> has basis index 2.
    const probs = built.state.map(prob);
    expect(probs[2]).toBeCloseTo(1, 10);
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('normalizes amplitude-list statevector input automatically', () => {
    const built = buildInitialStateFromInput(2, 'statevector', ['0', '0'], '1,1,0,0');
    expect(built.valid).toBe(true);
    expect(built.message.toLowerCase()).toContain('normalized');

    const probs = built.state.map(prob);
    expect(probs[0]).toBeCloseTo(0.5, 10);
    expect(probs[1]).toBeCloseTo(0.5, 10);
    expect(probs[2]).toBeCloseTo(0, 10);
    expect(probs[3]).toBeCloseTo(0, 10);
  });

  it('generates Dicke template amplitudes that are parseable and normalized', () => {
    const expr = getDickeTemplateExpression(3, 1);
    const built = buildInitialStateFromInput(3, 'statevector', ['0', '0', '0'], expr);
    expect(built.valid).toBe(true);
    expect(built.state.map(prob).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 8);

    const nonZero = built.state.map(prob).filter((p) => p > 1e-12);
    expect(nonZero).toHaveLength(3);
  });
});

describe('measurement collapse robustness', () => {
  it('returns normalized collapse branches whose probabilities sum to one', () => {
    const plusState = buildInitialState(2, ['+', '+']);
    const outcomes = allMeasurementOutcomes(plusState, 2, [0]);
    expect(outcomes).toHaveLength(2);

    const pSum = outcomes.reduce((acc, o) => acc + o.probability, 0);
    expect(pSum).toBeCloseTo(1, 10);

    for (const outcome of outcomes) {
      const collapsedNorm = outcome.collapsedState.map(prob).reduce((a, b) => a + b, 0);
      expect(collapsedNorm).toBeCloseTo(1, 10);
    }
  });

  it('computes conditional probabilities on unmeasured qubits correctly', () => {
    // Bell pair (|00> + |11>) / sqrt(2)
    const bell = buildInitialStateFromInput(2, 'statevector', ['0', '0'], '(1/sqrt(2))*|00⟩ + (1/sqrt(2))*|11⟩').state;
    const cond0 = getConditionalProbabilities(bell, 2, [0], '0');
    const cond1 = getConditionalProbabilities(bell, 2, [0], '1');

    expect(cond0.get('0') ?? 0).toBeCloseTo(1, 10);
    expect(cond0.get('1') ?? 0).toBeCloseTo(0, 10);
    expect(cond1.get('0') ?? 0).toBeCloseTo(0, 10);
    expect(cond1.get('1') ?? 0).toBeCloseTo(1, 10);
  });
});