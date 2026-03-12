import { type Complex, c, cExp, cMul, cAdd } from './complex';

export type Matrix2 = [Complex, Complex, Complex, Complex];
export type Matrix4 = Complex[]; // length 16, row-major

const S2 = 1 / Math.sqrt(2);

export const I_GATE: Matrix2 = [c(1), c(0), c(0), c(1)];
export const X_GATE: Matrix2 = [c(0), c(1), c(1), c(0)];
export const Y_GATE: Matrix2 = [c(0), c(0, -1), c(0, 1), c(0)];
export const Z_GATE: Matrix2 = [c(1), c(0), c(0), c(-1)];
export const H_GATE: Matrix2 = [c(S2), c(S2), c(S2), c(-S2)];
export const S_GATE: Matrix2 = [c(1), c(0), c(0), c(0, 1)];
export const SDG_GATE: Matrix2 = [c(1), c(0), c(0), c(0, -1)];
export const T_GATE: Matrix2 = [c(1), c(0), c(0), c(S2, S2)];
export const TDG_GATE: Matrix2 = [c(1), c(0), c(0), c(S2, -S2)];

export const Rx = (t: number): Matrix2 => [c(Math.cos(t / 2)), c(0, -Math.sin(t / 2)), c(0, -Math.sin(t / 2)), c(Math.cos(t / 2))];
export const Ry = (t: number): Matrix2 => [c(Math.cos(t / 2)), c(-Math.sin(t / 2)), c(Math.sin(t / 2)), c(Math.cos(t / 2))];
export const Rz = (t: number): Matrix2 => [cExp(-t / 2), c(0), c(0), cExp(t / 2)];
export const PGate = (p: number): Matrix2 => [c(1), c(0), c(0), cExp(p)];

export const CNOT_GATE: Matrix4 = [
  c(1),c(0),c(0),c(0), c(0),c(1),c(0),c(0),
  c(0),c(0),c(0),c(1), c(0),c(0),c(1),c(0),
];
export const CZ_GATE: Matrix4 = [
  c(1),c(0),c(0),c(0), c(0),c(1),c(0),c(0),
  c(0),c(0),c(1),c(0), c(0),c(0),c(0),c(-1),
];
export const SWAP_GATE: Matrix4 = [
  c(1),c(0),c(0),c(0), c(0),c(0),c(1),c(0),
  c(0),c(1),c(0),c(0), c(0),c(0),c(0),c(1),
];

export const tensorProduct2x2 = (a: Matrix2, b: Matrix2): Matrix4 => {
  const r: Complex[] = new Array(16);
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++)
      for (let k = 0; k < 2; k++)
        for (let l = 0; l < 2; l++)
          r[(i * 2 + k) * 4 + (j * 2 + l)] = cMul(a[i * 2 + j], b[k * 2 + l]);
  return r;
};

export const matMul4 = (a: Matrix4, b: Matrix4): Matrix4 => {
  const r: Complex[] = new Array(16);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      let s = c(0);
      for (let k = 0; k < 4; k++) s = cAdd(s, cMul(a[i * 4 + k], b[k * 4 + j]));
      r[i * 4 + j] = s;
    }
  return r;
};

export const matMul2 = (a: Matrix2, b: Matrix2): Matrix2 => [
  cAdd(cMul(a[0], b[0]), cMul(a[1], b[2])),
  cAdd(cMul(a[0], b[1]), cMul(a[1], b[3])),
  cAdd(cMul(a[2], b[0]), cMul(a[3], b[2])),
  cAdd(cMul(a[2], b[1]), cMul(a[3], b[3])),
];