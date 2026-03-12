export interface Complex {
  re: number;
  im: number;
}

export const c = (re: number, im = 0): Complex => ({ re, im });
export const ZERO: Complex = { re: 0, im: 0 };
export const ONE: Complex = { re: 1, im: 0 };
export const IM: Complex = { re: 0, im: 1 };

export const cAdd = (a: Complex, b: Complex): Complex => ({
  re: a.re + b.re,
  im: a.im + b.im,
});

export const cSub = (a: Complex, b: Complex): Complex => ({
  re: a.re - b.re,
  im: a.im - b.im,
});

export const cMul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});

export const cConj = (a: Complex): Complex => ({ re: a.re, im: -a.im });

export const cScale = (a: Complex, s: number): Complex => ({
  re: a.re * s,
  im: a.im * s,
});

export const cAbs2 = (a: Complex): number => a.re * a.re + a.im * a.im;
export const cAbs = (a: Complex): number => Math.sqrt(cAbs2(a));
export const cPhase = (a: Complex): number => Math.atan2(a.im, a.re);

export const cExp = (theta: number): Complex => ({
  re: Math.cos(theta),
  im: Math.sin(theta),
});

export const formatComplex = (z: Complex, digits = 3): string => {
  const r = Number(z.re.toFixed(digits));
  const i = Number(z.im.toFixed(digits));
  if (Math.abs(i) < 1e-10 && Math.abs(r) < 1e-10) return '0';
  if (Math.abs(i) < 1e-10) return `${r}`;
  if (Math.abs(r) < 1e-10) return `${i}i`;
  const sign = i >= 0 ? '+' : '−';
  return `${r} ${sign} ${Math.abs(i)}i`;
};