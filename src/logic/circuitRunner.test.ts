import { describe, expect, it } from 'vitest';
import { runWithNoiseShots, runWithShots } from './circuitRunner';
import type { CircuitState } from './circuitTypes';
import { defaultNoise, type NoiseConfig } from './noiseModel';

const toObject = (hist: Map<string, number>): Record<string, number> =>
  Object.fromEntries([...hist.entries()].sort((a, b) => a[0].localeCompare(b[0])));

describe('circuitRunner shot engine', () => {
  it('produces reproducible ideal shot histograms with a fixed seed', () => {
    const circuit: CircuitState = {
      numQubits: 1,
      numColumns: 2,
      gates: [
        { id: 'g1', gate: 'H', column: 0, targets: [0], controls: [], params: [] },
      ],
    };

    const first = runWithShots(circuit, 512, undefined, undefined, { seed: 12345 });
    const second = runWithShots(circuit, 512, undefined, undefined, { seed: 12345 });
    const third = runWithShots(circuit, 512, undefined, undefined, { seed: 54321 });

    expect(toObject(second)).toEqual(toObject(first));
    expect(toObject(third)).not.toEqual(toObject(first));
  });

  it('keeps mid-circuit measurement stochastic across shots', () => {
    const circuit: CircuitState = {
      numQubits: 1,
      numColumns: 4,
      gates: [
        { id: 'g1', gate: 'H', column: 0, targets: [0], controls: [], params: [] },
        { id: 'g2', gate: 'M', column: 1, targets: [0], controls: [], params: [], classicalBit: 0 },
        { id: 'g3', gate: 'Z', column: 2, targets: [0], controls: [], params: [], condition: 0 },
      ],
    };

    const hist = runWithShots(circuit, 256, undefined, undefined, { seed: 42 });

    expect((hist.get('0') ?? 0)).toBeGreaterThan(0);
    expect((hist.get('1') ?? 0)).toBeGreaterThan(0);
  });

  it('produces reproducible noisy shot histograms with a fixed seed', () => {
    const circuit: CircuitState = {
      numQubits: 1,
      numColumns: 2,
      gates: [
        { id: 'g1', gate: 'H', column: 0, targets: [0], controls: [], params: [] },
      ],
    };

    const noise: NoiseConfig = {
      ...defaultNoise,
      enabled: true,
      depolarizing1q: 0.05,
      amplitudeDamping: 0.03,
      bitFlip: 0.02,
      phaseFlip: 0.01,
      readoutError: 0.02,
    };

    const first = runWithNoiseShots(circuit, 512, noise, undefined, undefined, { seed: 999 });
    const second = runWithNoiseShots(circuit, 512, noise, undefined, undefined, { seed: 999 });

    expect(toObject(second)).toEqual(toObject(first));
  });

  it('matches exact damping limit for |1> with gamma=1', () => {
    const circuit: CircuitState = {
      numQubits: 1,
      numColumns: 2,
      gates: [
        { id: 'g1', gate: 'X', column: 0, targets: [0], controls: [], params: [] },
      ],
    };

    const noise: NoiseConfig = {
      ...defaultNoise,
      enabled: true,
      amplitudeDamping: 1,
    };

    const hist = runWithNoiseShots(circuit, 512, noise, undefined, undefined, { seed: 7 });
    expect(hist.get('0') ?? 0).toBe(512);
    expect(hist.get('1') ?? 0).toBe(0);
  });

  it('handles mid-circuit measurement + classical feed-forward exactly in noisy path', () => {
    const circuit: CircuitState = {
      numQubits: 1,
      numColumns: 5,
      gates: [
        { id: 'g1', gate: 'H', column: 0, targets: [0], controls: [], params: [] },
        { id: 'g2', gate: 'M', column: 1, targets: [0], controls: [], params: [], classicalBit: 0 },
        { id: 'g3', gate: 'X', column: 2, targets: [0], controls: [], params: [], condition: 0 },
      ],
    };

    const noise: NoiseConfig = {
      ...defaultNoise,
      enabled: true,
    };

    const hist = runWithNoiseShots(circuit, 256, noise, undefined, undefined, { seed: 101 });
    expect(hist.get('0') ?? 0).toBe(256);
    expect(hist.get('1') ?? 0).toBe(0);
  });

  it('accumulates T1 damping over circuit depth', () => {
    const circuit: CircuitState = {
      numQubits: 1,
      numColumns: 3,
      gates: [
        { id: 'g1', gate: 'X', column: 0, targets: [0], controls: [], params: [] },
      ],
    };

    const noise: NoiseConfig = {
      ...defaultNoise,
      enabled: true,
      t1Microseconds: 1,
      gateTime1qNs: 1000,
      idleTimeNs: 1000,
    };

    const shots = 4096;
    const hist = runWithNoiseShots(circuit, shots, noise, undefined, undefined, { seed: 2026 });
    const p1 = (hist.get('1') ?? 0) / shots;

    // With T1=1us and 1us per layer for 3 layers, expected excited-state population is exp(-3) ~ 0.0498.
    expect(p1).toBeGreaterThan(0.03);
    expect(p1).toBeLessThan(0.07);
  });
});
