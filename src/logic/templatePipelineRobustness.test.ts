import { describe, expect, it } from 'vitest';
import { computeUnitary, runCircuit, runWithNoiseShots, runWithShots } from './circuitRunner';
import type { CircuitState } from './circuitTypes';
import { defaultNoise } from './noiseModel';
import { TEMPLATES } from './templates';

const toObject = (hist: Map<string, number>): Record<string, number> =>
  Object.fromEntries([...hist.entries()].sort((a, b) => a[0].localeCompare(b[0])));

const totalCount = (hist: Map<string, number>): number =>
  Array.from(hist.values()).reduce((sum, value) => sum + value, 0);

const hasMidMeasurementOrClassicalControl = (circuit: CircuitState): boolean => {
  const maxNonMeasureCol = Math.max(
    -1,
    ...circuit.gates.filter((g) => g.gate !== 'M' && g.gate !== 'Barrier').map((g) => g.column),
  );
  const minMeasureCol = Math.min(
    Number.POSITIVE_INFINITY,
    ...circuit.gates.filter((g) => g.gate === 'M').map((g) => g.column),
  );
  const hasConditional = circuit.gates.some((g) => g.condition !== undefined);
  return hasConditional || minMeasureCol <= maxNonMeasureCol;
};

const tvDistance = (a: number[], b: number[]): number => {
  let sum = 0;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  }
  return 0.5 * sum;
};

describe('template pipeline robustness', () => {
  it('all templates are reproducible with fixed shot seed', () => {
    for (const template of TEMPLATES) {
      const circuit = template.build();
      const shotsA = runWithShots(circuit, 2048, undefined, undefined, { seed: 2026 });
      const shotsB = runWithShots(circuit, 2048, undefined, undefined, { seed: 2026 });
      expect(toObject(shotsA)).toEqual(toObject(shotsB));
    }
  });

  it('all templates conserve shot count and key width', () => {
    for (const template of TEMPLATES) {
      const circuit = template.build();
      const shots = runWithShots(circuit, 1536, undefined, undefined, { seed: 77 });

      expect(totalCount(shots)).toBe(1536);
      for (const key of shots.keys()) {
        expect(key).toHaveLength(circuit.numQubits);
      }
    }
  });

  it('disabled-noise pipeline matches ideal shot engine for all templates', () => {
    const noise = { ...defaultNoise, enabled: false };
    for (const template of TEMPLATES) {
      const circuit = template.build();
      const ideal = runWithShots(circuit, 2048, undefined, undefined, { seed: 31415 });
      const viaNoisePath = runWithNoiseShots(circuit, 2048, noise, undefined, undefined, { seed: 31415 });
      expect(toObject(viaNoisePath)).toEqual(toObject(ideal));
    }
  });

  it('terminal-measurement templates agree with amplitude-derived probabilities', () => {
    for (const template of TEMPLATES) {
      const circuit = template.build();
      if (hasMidMeasurementOrClassicalControl(circuit)) continue;

      const shots = 12000;
      const hist = runWithShots(circuit, shots, undefined, undefined, { seed: 9001 });
      const measured = Array.from({ length: 1 << circuit.numQubits }, (_, idx) => (hist.get(idx.toString(2).padStart(circuit.numQubits, '0')) ?? 0) / shots);

      const { state } = runCircuit(circuit, undefined, true);
      const expected = state.map((a) => a.re * a.re + a.im * a.im);

      // Monte Carlo tolerance for multi-outcome distributions.
      expect(tvDistance(measured, expected)).toBeLessThan(0.08);
    }
  });

  it('unitary simulator path matches state-vector evolution for no-measure templates', () => {
    for (const template of TEMPLATES) {
      const circuit = template.build();
      const hasMeasure = circuit.gates.some((g) => g.gate === 'M');
      if (hasMeasure) continue;

      const U = computeUnitary(circuit);
      expect(U).not.toBeNull();
      if (!U) continue;

      const { state } = runCircuit(circuit, undefined, true);
      // First column of U equals evolution of |0...0>.
      for (let i = 0; i < state.length; i += 1) {
        expect(U[i][0].re).toBeCloseTo(state[i].re, 8);
        expect(U[i][0].im).toBeCloseTo(state[i].im, 8);
      }
    }
  });
});
