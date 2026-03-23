import type { Complex } from './complex';
import { cAbs2 } from './complex';
import { buildInitialStateFromInput } from './initialQubitState';

export interface ReverseEngineeringSuggestion {
  valid: boolean;
  message: string;
  macro: string;
}

const phase = (re: number, im: number): number => Math.atan2(im, re);

const normalizeAngle = (x: number): number => {
  let v = x;
  while (v <= -Math.PI) v += 2 * Math.PI;
  while (v > Math.PI) v -= 2 * Math.PI;
  return v;
};

const formatAngle = (x: number): string => {
  if (Math.abs(x - Math.PI) < 1e-4) return 'pi';
  if (Math.abs(x + Math.PI) < 1e-4) return '-pi';
  if (Math.abs(x - Math.PI / 2) < 1e-4) return 'pi/2';
  if (Math.abs(x + Math.PI / 2) < 1e-4) return '-pi/2';
  return x.toFixed(6);
};

const suggestFromState = (state: Complex[], numQubits: number): ReverseEngineeringSuggestion => {
  const dim = 1 << numQubits;
  const probs = state.map(cAbs2);

  let top = 0;
  for (let i = 1; i < dim; i += 1) {
    if (probs[i] > probs[top]) top = i;
  }

  if (probs[top] > 0.999) {
    const bits = top.toString(2).padStart(numQubits, '0');
    const lines: string[] = [];
    for (let q = 0; q < numQubits; q += 1) {
      if (((top >> q) & 1) === 1) lines.push(`X(${q})`);
    }
    return {
      valid: true,
      message: `Target is near basis state |${bits}⟩`,
      macro: lines.length > 0 ? lines.join(';\n') : '// already |0...0⟩',
    };
  }

  if (numQubits === 1) {
    const a = state[0];
    const b = state[1];
    const magA = Math.sqrt(cAbs2(a));
    const theta = 2 * Math.acos(Math.min(1, Math.max(0, magA)));
    const phi = normalizeAngle(phase(b.re, b.im) - phase(a.re, a.im));

    return {
      valid: true,
      message: 'Single-qubit approximation using Rz(phi) then Ry(theta)',
      macro: `Rz(0, ${formatAngle(phi)});\nRy(0, ${formatAngle(theta)})`,
    };
  }

  if (numQubits === 2) {
    const p00 = probs[0];
    const p11 = probs[3];
    const p01 = probs[1];
    const p10 = probs[2];

    if (p00 + p11 > 0.98) {
      return {
        valid: true,
        message: 'Looks close to Bell subspace |00⟩/|11⟩',
        macro: 'H(0);\nCNOT(0,1)',
      };
    }

    if (p01 + p10 > 0.98) {
      return {
        valid: true,
        message: 'Looks close to Bell subspace |01⟩/|10⟩',
        macro: 'X(1);\nH(0);\nCNOT(0,1)',
      };
    }
  }

  return {
    valid: true,
    message: 'No compact heuristic found. Start from GHZ/W/Bell template and refine with parametric gates.',
    macro: 'H(0);\n// add entangling and rotation gates to fit target',
  };
};

export const suggestStatePrepMacro = (
  targetExpression: string,
  numQubits: number,
): ReverseEngineeringSuggestion => {
  const parsed = buildInitialStateFromInput(numQubits, 'statevector', [], targetExpression);
  if (!parsed.valid) {
    return {
      valid: false,
      message: parsed.message,
      macro: '',
    };
  }

  return suggestFromState(parsed.state, numQubits);
};
