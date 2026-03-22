import type { Complex } from './complex';
import { getBlochVector } from './simulator';

export type MeasurementAxis = 'X' | 'Y' | 'Z';

export interface AxisDistribution {
  plus: number;
  minus: number;
}

export const axisMeasurementDistribution = (
  state: Complex[],
  numQubits: number,
  qubit: number,
  axis: MeasurementAxis,
): AxisDistribution => {
  const [x, y, z] = getBlochVector(state, qubit, numQubits);
  const axisProjection = axis === 'X' ? x : axis === 'Y' ? y : z;
  const plus = Math.max(0, Math.min(1, (1 + axisProjection) / 2));
  return { plus, minus: 1 - plus };
};

export const marginalizeHistogram = (
  histogram: Map<string, number> | null,
  measureQubits: number[],
  numQubits: number,
): Map<string, number> => {
  const result = new Map<string, number>();
  if (!histogram || measureQubits.length === 0) return result;

  for (const [bitstring, count] of histogram.entries()) {
    // bitstring is msb..lsb; convert index-style qubit to string index.
    const subset = measureQubits
      .map((q) => bitstring[numQubits - 1 - q])
      .join('');
    result.set(subset, (result.get(subset) ?? 0) + count);
  }

  return result;
};

export const normalizeHistogram = (histogram: Map<string, number>): Map<string, number> => {
  const total = Array.from(histogram.values()).reduce((acc, n) => acc + n, 0);
  const normalized = new Map<string, number>();
  if (total <= 0) return normalized;

  for (const [key, count] of histogram.entries()) {
    normalized.set(key, count / total);
  }
  return normalized;
};
