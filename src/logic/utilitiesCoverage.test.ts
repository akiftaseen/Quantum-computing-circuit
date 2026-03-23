import { describe, expect, it } from 'vitest';
import { computeAdaptiveDomain } from './chartDomains';
import { diffCircuits } from './circuitDiff';
import type { CircuitState } from './circuitTypes';
import { buildDensityMatrix, densityMatrixFromPureState, reduceToSingleQubit } from './densityMatrix';
import { initZeroState } from './simulator';
import { evaluateObservableExpressions, evaluateSingleObservable } from './observableLab';
import { bellPair } from './templates';
import { runCircuit } from './circuitRunner';

describe('utility coverage', () => {
  it('computes adaptive domains for empty, flat, and clamped values', () => {
    expect(computeAdaptiveDomain([])).toEqual([0, 1]);

    const flat = computeAdaptiveDomain([3, 3, 3], { clampMin: 2.95, clampMax: 3.05 });
    expect(flat[0]).toBeGreaterThanOrEqual(2.95);
    expect(flat[1]).toBeLessThanOrEqual(3.05);
    expect(flat[1]).toBeGreaterThan(flat[0]);

    const spread = computeAdaptiveDomain([0.2, 0.8], { padRatio: 0.1, minPad: 0.01 });
    expect(spread[0]).toBeLessThan(0.2);
    expect(spread[1]).toBeGreaterThan(0.8);
  });

  it('reports changed, added, removed and depth delta in circuit diffs', () => {
    const left: CircuitState = {
      numQubits: 2,
      numColumns: 8,
      gates: [
        { id: 'a', gate: 'H', column: 0, targets: [0], controls: [], params: [] },
        { id: 'b', gate: 'X', column: 1, targets: [1], controls: [], params: [] },
      ],
    };

    const right: CircuitState = {
      numQubits: 2,
      numColumns: 8,
      gates: [
        { id: 'x', gate: 'H', column: 0, targets: [0], controls: [], params: [] },
        { id: 'y', gate: 'Z', column: 2, targets: [1], controls: [], params: [] },
        { id: 'z', gate: 'CNOT', column: 3, targets: [1], controls: [0], params: [] },
      ],
    };

    const diff = diffCircuits(left, right);
    expect(diff.changed).toBe(1);
    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(0);
    expect(diff.depthDelta).toBe(2);
  });

  it('builds pure-state density matrices with expected purity and entropy', () => {
    const zero = initZeroState(1);
    const rho = densityMatrixFromPureState(zero);
    expect(rho[0][0].re).toBeCloseTo(1, 10);
    expect(rho[1][1].re).toBeCloseTo(0, 10);

    const dm = buildDensityMatrix(zero);
    expect(dm.purity).toBeCloseTo(1, 10);
    expect(dm.entropy).toBeCloseTo(0, 10);
  });

  it('reduces Bell state to maximally mixed single-qubit state', () => {
    const bellState = runCircuit(bellPair(), undefined, true).state;
    const full = densityMatrixFromPureState(bellState);
    const reduced = reduceToSingleQubit(full, 0, 2);

    expect(reduced[0][0].re).toBeCloseTo(0.5, 5);
    expect(reduced[1][1].re).toBeCloseTo(0.5, 5);
    expect(Math.abs(reduced[0][1].re)).toBeLessThan(1e-6);
    expect(Math.abs(reduced[0][1].im)).toBeLessThan(1e-6);
  });

  it('evaluates valid observables and returns diagnostics for invalid ones', () => {
    const zero = initZeroState(1);
    const valid = evaluateSingleObservable('Z0', 1, zero);
    expect(valid.valid).toBe(true);
    expect(valid.value).toBeCloseTo(1, 10);

    const rows = evaluateObservableExpressions('X0; Z0*Z0; Z2', 1, zero);
    expect(rows[0].valid).toBe(true);
    expect(rows[0].value).toBeCloseTo(0, 10);
    expect(rows[1].valid).toBe(false);
    expect(rows[1].message.toLowerCase()).toContain('appears multiple times');
    expect(rows[2].valid).toBe(false);
    expect(rows[2].message.toLowerCase()).toContain('out of range');
  });
});