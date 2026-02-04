import { type Complex, c } from './complex';

// 2x2 matrix, flattened row-major: [m00, m01, m10, m11]
export type Matrix2 = [Complex, Complex, Complex, Complex];

// Pauli-X
export const X_GATE: Matrix2 = [
  c(0), c(1),
  c(1), c(0),
];

// Pauli-Y: [[0, -i], [i, 0]]
export const Y_GATE: Matrix2 = [
  c(0), c(0, -1),
  c(0, 1), c(0),
];

// Pauli-Z
export const Z_GATE: Matrix2 = [
  c(1), c(0),
  c(0), c(-1),
];

// Hadamard
export const H_GATE: Matrix2 = [
  c(1 / Math.sqrt(2)), c(1 / Math.sqrt(2)),
  c(1 / Math.sqrt(2)), c(-1 / Math.sqrt(2)),
];

// Phase gate S: diag(1, i)
export const S_GATE: Matrix2 = [
  c(1), c(0),
  c(0), c(0, 1),
];

// T gate (pi/8 gate): diag(1, e^{iπ/4})
// e^{iπ/4} = (1/√2) + i(1/√2)
const INV_SQRT2 = 1 / Math.sqrt(2);
export const T_GATE: Matrix2 = [
  c(1),                    // m00
  c(0),                    // m01
  c(0),                    // m10
  c(INV_SQRT2, INV_SQRT2), // m11
];