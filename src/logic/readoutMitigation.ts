export const clampReadoutError = (p: number): number => {
  if (!Number.isFinite(p)) return 0;
  return Math.max(0, Math.min(0.49, p));
};

export const histogramToProbabilityVector = (hist: Map<string, number>, numQubits: number): number[] => {
  const dim = 1 << numQubits;
  const vec = Array(dim).fill(0);
  let total = 0;
  for (const v of hist.values()) total += v;
  const norm = total > 0 ? total : 1;

  for (let i = 0; i < dim; i += 1) {
    const bits = i.toString(2).padStart(numQubits, '0');
    vec[i] = (hist.get(bits) ?? 0) / norm;
  }
  return vec;
};

export const probabilityVectorToHistogram = (vec: number[], numQubits: number): Map<string, number> => {
  const out = new Map<string, number>();
  const dim = 1 << numQubits;
  for (let i = 0; i < dim; i += 1) {
    const bits = i.toString(2).padStart(numQubits, '0');
    out.set(bits, vec[i] ?? 0);
  }
  return out;
};

const applySingleQubitInverse = (vec: number[], qubit: number, inv: [number, number, number, number]): number[] => {
  const out = Array(vec.length).fill(0);
  const mask = 1 << qubit;
  const [a, b, c, d] = inv;

  for (let base = 0; base < vec.length; base += 1) {
    if ((base & mask) !== 0) continue;
    const i0 = base;
    const i1 = base | mask;
    const v0 = vec[i0] ?? 0;
    const v1 = vec[i1] ?? 0;
    out[i0] = a * v0 + b * v1;
    out[i1] = c * v0 + d * v1;
  }
  return out;
};

const renormalizeNonnegative = (vec: number[]): number[] => {
  const clipped = vec.map((v) => (v < 0 ? 0 : v));
  const sum = clipped.reduce((acc, v) => acc + v, 0);
  if (sum <= 0) return clipped.map(() => 0);
  return clipped.map((v) => v / sum);
};

export const mitigateReadoutProbabilityVector = (observed: number[], numQubits: number, readoutError: number): number[] => {
  const p = clampReadoutError(readoutError);
  const denom = 1 - 2 * p;
  if (denom <= 1e-9) return renormalizeNonnegative(observed);

  const inv: [number, number, number, number] = [
    (1 - p) / denom,
    -p / denom,
    -p / denom,
    (1 - p) / denom,
  ];

  let corrected = [...observed];
  for (let q = 0; q < numQubits; q += 1) {
    corrected = applySingleQubitInverse(corrected, q, inv);
  }

  return renormalizeNonnegative(corrected);
};

export const mitigateReadoutHistogram = (hist: Map<string, number>, numQubits: number, readoutError: number): Map<string, number> => {
  const observed = histogramToProbabilityVector(hist, numQubits);
  const corrected = mitigateReadoutProbabilityVector(observed, numQubits, readoutError);
  return probabilityVectorToHistogram(corrected, numQubits);
};
