import { type Complex, c, cAdd, cMul } from './complex';
import type { Matrix2 } from './gate';

// 初始化 n 个 qubit 的 |0...0⟩ 态
export const initZeroState = (numQubits: number): Complex[] => {
  const dim = 1 << numQubits; // 2^n
  const state: Complex[] = Array(dim)
    .fill(null)
    .map(() => c(0, 0));
  state[0] = c(1, 0); // |0...0⟩
  return state;
};

/**
 * 在 n-qubit 的 statevector 上作用一个单比特门
 *
 * @param state 当前 statevector（长度 2^n）
 * @param gate  2x2 单比特门矩阵
 * @param target 作用的 qubit 索引（0 表示最低位）
 * @param numQubits 总 qubit 数
 */
export const applySingleQubitGate = (
  state: Complex[],
  gate: Matrix2,
  target: number,
  numQubits: number,
): Complex[] => {
  const dim = 1 << numQubits;
  const newState: Complex[] = Array(dim)
    .fill(null)
    .map(() => c(0, 0));

  const mask = 1 << target;

  // gate:
  // [g00 g01
  //  g10 g11]
  const g00 = gate[0];
  const g01 = gate[1];
  const g10 = gate[2];
  const g11 = gate[3];

  // 遍历所有 basis，对每一对 (|...0...>, |...1...>) 成对更新
  for (let basis = 0; basis < dim; basis++) {
    const bit = (basis & mask) ? 1 : 0;
    const partner = basis ^ mask; // 翻转 target 位

    if (bit === 0) {
      // 只在 bit==0 时处理 pair（避免成对重复）
      const amp0 = state[basis];
      const amp1 = state[partner];

      // 新的幅度：
      // |0> -> g00 * amp0 + g01 * amp1
      // |1> -> g10 * amp0 + g11 * amp1
      const new0 = cAdd(cMul(g00, amp0), cMul(g01, amp1));
      const new1 = cAdd(cMul(g10, amp0), cMul(g11, amp1));

      newState[basis] = new0;
      newState[partner] = new1;
    }
  }

  return newState;
};