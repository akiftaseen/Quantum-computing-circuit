import type { Complex } from './complex';
import type { CircuitState } from './circuitTypes';
import type { MeasurementBasisAxis } from './measurementBasis';
import type { NoiseConfig } from './noiseModel';
import { defaultNoise } from './noiseModel';
import { runWithNoiseShots } from './circuitRunner';
import { histogramToProbArray, klDivergence } from './stateMetrics';

export interface CalibrationResult {
  bestNoise: NoiseConfig;
  bestScore: number;
  tried: number;
}

export const parseHistogramText = (text: string): Map<string, number> => {
  const out = new Map<string, number>();
  const lines = text.split('\n').map((x) => x.trim()).filter(Boolean);

  for (const line of lines) {
    const m = line.match(/^([01]+)\s*[:=,\s]\s*(\d+)$/);
    if (!m) continue;
    out.set(m[1], Number(m[2]));
  }

  return out;
};

export const fitNoiseModelFromHistogram = (
  circuit: CircuitState,
  initialState: Complex[],
  observed: Map<string, number>,
  shotsBasisAxes: MeasurementBasisAxis[],
  numShots: number,
): CalibrationResult => {
  const dim = 1 << circuit.numQubits;
  if (observed.size === 0 || dim <= 1) {
    return {
      bestNoise: { ...defaultNoise },
      bestScore: Number.POSITIVE_INFINITY,
      tried: 0,
    };
  }

  const grid = [0, 0.01, 0.02, 0.04, 0.06, 0.1];
  let bestScore = Number.POSITIVE_INFINITY;
  let bestNoise: NoiseConfig = { ...defaultNoise };
  let tried = 0;

  const obs = histogramToProbArray(observed, circuit.numQubits);

  for (const depolarizing1q of grid) {
    for (const amplitudeDamping of grid) {
      for (const readoutError of grid) {
        const noise: NoiseConfig = {
          ...defaultNoise,
          enabled: depolarizing1q > 0 || amplitudeDamping > 0 || readoutError > 0,
          depolarizing1q,
          amplitudeDamping,
          bitFlip: depolarizing1q * 0.35,
          phaseFlip: amplitudeDamping * 0.4,
          readoutError,
        };

        const simHist = runWithNoiseShots(circuit, Math.max(512, Math.min(8192, numShots)), noise, initialState, shotsBasisAxes);
        const sim = histogramToProbArray(simHist, circuit.numQubits);
        const score = klDivergence(obs, sim);
        tried += 1;

        if (score < bestScore) {
          bestScore = score;
          bestNoise = noise;
        }
      }
    }
  }

  return {
    bestNoise,
    bestScore,
    tried,
  };
};
