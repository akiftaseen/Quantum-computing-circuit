export interface AdaptiveDomainOptions {
  defaultDomain?: [number, number];
  clampMin?: number;
  clampMax?: number;
  flatPad?: number;
  padRatio?: number;
  minPad?: number;
}

export const computeAdaptiveDomain = (
  values: number[],
  options: AdaptiveDomainOptions = {},
): [number, number] => {
  const {
    defaultDomain = [0, 1],
    clampMin,
    clampMax,
    flatPad = 0.05,
    padRatio = 0.16,
    minPad = 0.01,
  } = options;

  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return defaultDomain;

  let min = Math.min(...finite);
  let max = Math.max(...finite);

  if (Math.abs(max - min) < 1e-9) {
    min -= flatPad;
    max += flatPad;
  } else {
    const pad = Math.max(minPad, (max - min) * padRatio);
    min -= pad;
    max += pad;
  }

  if (clampMin !== undefined) {
    min = Math.max(clampMin, min);
    max = Math.max(clampMin, max);
  }
  if (clampMax !== undefined) {
    min = Math.min(clampMax, min);
    max = Math.min(clampMax, max);
  }

  if (max - min < 1e-6) {
    if (clampMin !== undefined && clampMax !== undefined) {
      const center = Math.max(clampMin, Math.min(clampMax, (min + max) / 2));
      const tiny = Math.max(1e-4, (clampMax - clampMin) * 0.02);
      return [Math.max(clampMin, center - tiny), Math.min(clampMax, center + tiny)];
    }
    return [min - 1e-4, max + 1e-4];
  }

  return [min, max];
};
