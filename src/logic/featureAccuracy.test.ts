import { describe, expect, it } from 'vitest';
import type { CircuitState } from './circuitTypes';
import { analyzeCircuit, calculateCircuitCost, estimateGateCost, findOptimizations } from './circuitAnalysis';
import { validateCircuit, validateColumnCount, validateGate, validateQubitCount, sanitizeAngle } from './validation';
import { initZeroState, applySingleQubitGate } from './simulator';
import { H_GATE, X_GATE } from './gate';
import { axisMeasurementDistribution, marginalizeHistogram, normalizeHistogram } from './measurementInsights';
import { basisDistributionFromState, rotateStateForMeasurementBasis } from './measurementBasis';
import {
  bhattacharyyaCoefficient,
  hellingerDistance,
  histogramToProbArray,
  jensenShannonDivergence,
  klDivergence,
  perQubitMarginalError,
  stateFidelity,
  traceDistanceApprox,
} from './stateMetrics';
import {
  computeCHSHCanonical,
  computeConcurrence,
  computeSingleQubitEntropy,
  computeSubsystemEntropyProfile,
  findCorrelatedQubitPairs,
} from './entanglementAnalysis';
import { applyAmplitudeDamping, applyDepolarizing, applyPhaseFlip, flipReadout } from './noiseModel';
import { bellPair } from './templates';
import { runCircuit } from './circuitRunner';

const approxEq = (a: number, b: number, tol = 1e-6): boolean => Math.abs(a - b) <= tol;

describe('feature accuracy checks', () => {
  it('validation catches out-of-range and malformed gates', () => {
    const badCircuit: CircuitState = {
      numQubits: 1,
      numColumns: 2,
      gates: [
        { id: 'g1', gate: 'CNOT', column: 5, targets: [1], controls: [1], params: [] },
        { id: 'g2', gate: 'Rx', column: 0, targets: [0], controls: [], params: [] },
      ],
    };

    const errs = validateCircuit(badCircuit);
    expect(errs.length).toBeGreaterThanOrEqual(3);

    const gateErrs = validateGate(badCircuit.gates[0], badCircuit);
    expect(gateErrs.some((e) => e.type === 'column_out_of_range')).toBe(true);
    expect(gateErrs.some((e) => e.type === 'qubit_out_of_range')).toBe(true);
  });

  it('validation helpers and angle sanitation behave as expected', () => {
    expect(validateQubitCount(2)).toBe(true);
    expect(validateQubitCount(0)).toBe(false);
    expect(validateColumnCount(10)).toBe(true);
    expect(validateColumnCount(2.5)).toBe(false);

    expect(sanitizeAngle(Number.NaN)).toBe(0);
    expect(sanitizeAngle(1e9)).toBeLessThanOrEqual(100 * Math.PI);
    expect(sanitizeAngle(-1e9)).toBeGreaterThanOrEqual(-100 * Math.PI);
  });

  it('circuit analysis metrics and optimization hints are internally consistent', () => {
    const circuit: CircuitState = {
      numQubits: 2,
      numColumns: 5,
      gates: [
        { id: 'h0', gate: 'H', column: 0, targets: [0], controls: [], params: [] },
        { id: 'h1', gate: 'H', column: 1, targets: [0], controls: [], params: [] },
        { id: 'cx', gate: 'CNOT', column: 2, targets: [1], controls: [0], params: [] },
        { id: 'm0', gate: 'M', column: 4, targets: [0], controls: [], params: [], classicalBit: 0 },
      ],
    };

    const m = analyzeCircuit(circuit);
    expect(m.totalGates).toBe(4);
    expect(m.twoQubitGateCount).toBe(1);
    expect(m.circuitDepth).toBe(5);
    expect(m.estimatedQubits).toBe(2);

    const hints = findOptimizations(circuit);
    expect(hints.some((h) => h.includes('HH=I') || h.includes('H-H sequence'))).toBe(true);

    expect(estimateGateCost('CCX')).toBeGreaterThan(estimateGateCost('H'));
    expect(calculateCircuitCost(circuit)).toBeGreaterThan(0);
  });

  it('measurement-basis rotation and derived distributions are correct for |0>', () => {
    const state = initZeroState(1);

    const zDist = basisDistributionFromState(state, 1, ['Z']);
    expect(zDist[0].basis).toBe('0');
    expect(zDist[0].probability).toBeCloseTo(1, 8);

    const xDist = basisDistributionFromState(state, 1, ['X']);
    const p0 = xDist.find((d) => d.basis === '0')?.probability ?? 0;
    const p1 = xDist.find((d) => d.basis === '1')?.probability ?? 0;
    expect(p0).toBeCloseTo(0.5, 3);
    expect(p1).toBeCloseTo(0.5, 3);

    const rotated = rotateStateForMeasurementBasis(state, 1, ['X']);
    const norm = rotated.reduce((s, a) => s + a.re * a.re + a.im * a.im, 0);
    expect(norm).toBeCloseTo(1, 8);
  });

  it('measurement insights return expected axis and histogram transforms', () => {
    const state = initZeroState(1);
    const z = axisMeasurementDistribution(state, 1, 0, 'Z');
    const x = axisMeasurementDistribution(state, 1, 0, 'X');
    expect(z.plus).toBeCloseTo(1, 8);
    expect(z.minus).toBeCloseTo(0, 8);
    expect(x.plus).toBeCloseTo(0.5, 6);
    expect(x.minus).toBeCloseTo(0.5, 6);

    const hist = new Map<string, number>([
      ['00', 3],
      ['01', 1],
      ['10', 2],
      ['11', 2],
    ]);
    const marg = marginalizeHistogram(hist, [0], 2);
    expect(marg.get('0')).toBe(5);
    expect(marg.get('1')).toBe(3);

    const norm = normalizeHistogram(marg);
    expect(norm.get('0')).toBeCloseTo(5 / 8, 8);
    expect(norm.get('1')).toBeCloseTo(3 / 8, 8);
  });

  it('state metrics satisfy identity and bound properties', () => {
    const zero = initZeroState(1);
    const one = applySingleQubitGate(zero, X_GATE, 0, 1);

    expect(stateFidelity(zero, zero)).toBeCloseTo(1, 8);
    expect(stateFidelity(zero, one)).toBeCloseTo(0, 8);
    expect(traceDistanceApprox(zero, one)).toBeCloseTo(1, 8);

    const p = [0.5, 0.5];
    const q = [1, 0];
    const js1 = jensenShannonDivergence(p, q);
    const js2 = jensenShannonDivergence(q, p);
    expect(js1).toBeGreaterThan(0);
    expect(approxEq(js1, js2, 1e-12)).toBe(true);

    const bc = bhattacharyyaCoefficient(p, q);
    const h = hellingerDistance(p, q);
    expect(bc).toBeGreaterThanOrEqual(0);
    expect(bc).toBeLessThanOrEqual(1);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(1);

    const kl = klDivergence([0.5, 0.5], [0.5, 0.5]);
    expect(kl).toBeCloseTo(0, 8);

    const drift = perQubitMarginalError([0.5, 0.5, 0, 0], [0, 0.5, 0, 0.5], 2);
    expect(drift).toHaveLength(2);
    expect(drift[0].delta).toBeGreaterThanOrEqual(drift[1].delta);

    const hist = new Map<string, number>([['00', 2], ['11', 2]]);
    const arr = histogramToProbArray(hist, 2);
    expect(arr[0]).toBeCloseTo(0.5, 8);
    expect(arr[3]).toBeCloseTo(0.5, 8);
  });

  it('entanglement analysis matches Bell-state expectations', () => {
    const { state } = runCircuit(bellPair(), undefined, true);
    const entropyQ0 = computeSingleQubitEntropy(state, 2, 0);
    const entropyQ1 = computeSingleQubitEntropy(state, 2, 1);
    expect(entropyQ0).toBeCloseTo(1, 4);
    expect(entropyQ1).toBeCloseTo(1, 4);

    const conc = computeConcurrence(state, 2, 0, 1);
    expect(conc).not.toBeNull();
    expect(conc ?? 0).toBeCloseTo(1, 5);

    const chsh = computeCHSHCanonical(state, 0, 1);
    expect(chsh).toBeGreaterThan(2.0);

    const pairs = findCorrelatedQubitPairs(state, 2);
    expect(pairs[0].pair).toEqual([0, 1]);
    expect(pairs[0].strength).toBeGreaterThan(0.9);

    const profile = computeSubsystemEntropyProfile(state, 2);
    expect(profile[0]).toBeCloseTo(1, 4);
    expect(profile[1]).toBeCloseTo(1, 4);
  });

  it('noise primitives are deterministic with seeded randomSource in edge cases', () => {
    const zero = initZeroState(1);
    const one = applySingleQubitGate(zero, X_GATE, 0, 1);

    // p=1 with r<1/3 chooses X.
    const depX = applyDepolarizing(zero, 0, 1, 1, (() => {
      const seq = [0, 0.2];
      let i = 0;
      return () => seq[i++];
    })());
    expect(depX[0].re).toBeCloseTo(0, 8);
    expect(depX[1].re).toBeCloseTo(1, 8);

    // gamma=1 maps |1> -> |0>.
    const damped = applyAmplitudeDamping(one, 0, 1, 1, () => 0.9);
    expect(damped[0].re).toBeCloseTo(1, 8);
    expect(damped[1].re).toBeCloseTo(0, 8);

    // phase flip with p=1 on |+> turns into |-> (same probs but opposite relative phase).
    const plus = applySingleQubitGate(zero, H_GATE, 0, 1);
    const flipped = applyPhaseFlip(plus, 0, 1, 1, () => 0);
    expect(flipped[0].re).toBeCloseTo(plus[0].re, 8);
    expect(flipped[1].re).toBeCloseTo(-plus[1].re, 8);

    expect(flipReadout(0, 1, () => 0)).toBe(1);
    expect(flipReadout(1, 0, () => 0)).toBe(1);
  });
});
