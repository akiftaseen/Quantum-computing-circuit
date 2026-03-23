import { describe, expect, it } from 'vitest';
import {
  clampReadoutError,
  histogramToProbabilityVector,
  mitigateReadoutHistogram,
  mitigateReadoutProbabilityVector,
} from './readoutMitigation';

describe('readoutMitigation', () => {
  it('clamps invalid readout probability range', () => {
    expect(clampReadoutError(-1)).toBe(0);
    expect(clampReadoutError(0.51)).toBe(0.49);
  });

  it('returns normalized observed vector from histogram', () => {
    const hist = new Map<string, number>([['00', 3], ['01', 1]]);
    const vec = histogramToProbabilityVector(hist, 2);
    expect(vec[0]).toBeCloseTo(0.75, 8);
    expect(vec[1]).toBeCloseTo(0.25, 8);
  });

  it('pulls single-qubit outcomes toward original distribution', () => {
    const observed = [0.82, 0.18];
    const corrected = mitigateReadoutProbabilityVector(observed, 1, 0.1);
    expect(corrected[0]).toBeGreaterThan(observed[0]);
    expect(corrected[1]).toBeLessThan(observed[1]);
    expect(corrected[0] + corrected[1]).toBeCloseTo(1, 8);
  });

  it('keeps distribution normalized and nonnegative', () => {
    const observed = [0.1, 0.2, 0.3, 0.4];
    const corrected = mitigateReadoutProbabilityVector(observed, 2, 0.2);
    expect(corrected.every((v) => v >= 0)).toBe(true);
    expect(corrected.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 8);
  });

  it('returns same keys as input basis space', () => {
    const hist = new Map<string, number>([['00', 50], ['01', 30], ['10', 10], ['11', 10]]);
    const corrected = mitigateReadoutHistogram(hist, 2, 0.12);
    expect(corrected.has('00')).toBe(true);
    expect(corrected.has('01')).toBe(true);
    expect(corrected.has('10')).toBe(true);
    expect(corrected.has('11')).toBe(true);
  });
});
