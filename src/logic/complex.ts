// 复数与基本运算

export interface Complex {
    re: number;
    im: number;
  }
  
  // 构造一个复数
  export const c = (re: number, im = 0): Complex => ({ re, im });
  
  // 复数加法
  export const cAdd = (a: Complex, b: Complex): Complex => ({
    re: a.re + b.re,
    im: a.im + b.im,
  });
  
  // 复数乘法
  export const cMul = (a: Complex, b: Complex): Complex => ({
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  });
  
  // 复数模长平方 |a|^2
  export const cAbs2 = (a: Complex): number => a.re * a.re + a.im * a.im;
  
  // 把复数格式化为字符串，方便展示
  export const formatComplex = (z: Complex, digits = 3): string => {
    const r = Number(z.re.toFixed(digits));
    const i = Number(z.im.toFixed(digits));
    if (Math.abs(i) < 1e-10) return `${r}`;
    if (Math.abs(r) < 1e-10) return `${i}i`;
    const sign = i >= 0 ? '+' : '-';
    return `${r} ${sign} ${Math.abs(i)}i`;
  };