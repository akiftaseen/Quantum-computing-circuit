import { describe, it, expect } from 'vitest';
import { c, cAdd, cMul, cConj, cAbs2, cAbs, cExp, formatComplex } from '../logic/complex';

describe('Complex Number Operations', () => {
  it('should create complex numbers', () => {
    const z1 = c(3, 4);
    expect(z1.re).toBe(3);
    expect(z1.im).toBe(4);

    const z2 = c(5);
    expect(z2.re).toBe(5);
    expect(z2.im).toBe(0);
  });

  it('should add complex numbers', () => {
    const z1 = c(1, 2);
    const z2 = c(3, 4);
    const sum = cAdd(z1, z2);
    expect(sum.re).toBe(4);
    expect(sum.im).toBe(6);
  });

  it('should multiply complex numbers', () => {
    const z1 = c(1, 2);
    const z2 = c(3, 4);
    const prod = cMul(z1, z2);
    expect(prod.re).toBe(-5); // (1+2i)(3+4i) = 3+4i+6i-8 = -5+10i
    expect(prod.im).toBe(10);
  });

  it('should compute conjugate', () => {
    const z = c(3, 4);
    const conj = cConj(z);
    expect(conj.re).toBe(3);
    expect(conj.im).toBe(-4);
  });

  it('should compute magnitude squared', () => {
    const z = c(3, 4);
    expect(cAbs2(z)).toBe(25);
  });

  it('should compute magnitude', () => {
    const z = c(3, 4);
    expect(cAbs(z)).toBe(5);
  });

  it('should compute exponential', () => {
    const z = cExp(Math.PI / 2);
    expect(z.re).toBeCloseTo(0, 10);
    expect(z.im).toBeCloseTo(1, 10);
  });

  it('should format complex numbers', () => {
    expect(formatComplex(c(1, 0))).toBe('1');
    expect(formatComplex(c(0, 1))).toBe('1i');
    expect(formatComplex(c(1, 1))).toContain('+');
    expect(formatComplex(c(0, 0))).toBe('0');
  });
});
