import type { Complex } from './complex';
import { cAbs2 } from './complex';

const innerProduct = (a: Complex[], b: Complex[]): Complex => {
  let re = 0;
  let im = 0;
  const dim = Math.min(a.length, b.length);
  for (let i = 0; i < dim; i += 1) {
    const ar = a[i].re;
    const ai = a[i].im;
    const br = b[i].re;
    const bi = b[i].im;
    re += ar * br + ai * bi;
    im += ar * bi - ai * br;
  }
  return { re, im };
};

const probs = (state: Complex[]): number[] => {
  const p = state.map(cAbs2);
  const total = p.reduce((s, v) => s + v, 0) || 1;
  return p.map((v) => v / total);
};

export const stateFidelity = (a: Complex[], b: Complex[]): number => {
  const ip = innerProduct(a, b);
  return Math.max(0, Math.min(1, ip.re * ip.re + ip.im * ip.im));
};

export const traceDistanceApprox = (a: Complex[], b: Complex[]): number => {
  const pa = probs(a);
  const pb = probs(b);
  const dim = Math.min(pa.length, pb.length);
  let sum = 0;
  for (let i = 0; i < dim; i += 1) sum += Math.abs(pa[i] - pb[i]);
  return 0.5 * sum;
};

export const klDivergence = (pRaw: number[], qRaw: number[]): number => {
  const eps = 1e-12;
  const pSum = pRaw.reduce((s, v) => s + v, 0) || 1;
  const qSum = qRaw.reduce((s, v) => s + v, 0) || 1;
  const dim = Math.min(pRaw.length, qRaw.length);

  let kl = 0;
  for (let i = 0; i < dim; i += 1) {
    const p = Math.max(eps, pRaw[i] / pSum);
    const q = Math.max(eps, qRaw[i] / qSum);
    kl += p * Math.log(p / q);
  }
  return kl;
};

export const histogramToProbArray = (hist: Map<string, number>, numQubits: number): number[] => {
  const dim = 1 << numQubits;
  const out = Array(dim).fill(0);
  for (const [basis, count] of hist.entries()) {
    const idx = Number.parseInt(basis, 2);
    if (Number.isInteger(idx) && idx >= 0 && idx < dim) out[idx] = count;
  }
  const total = out.reduce((s, v) => s + v, 0) || 1;
  return out.map((v) => v / total);
};
