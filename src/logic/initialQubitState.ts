import type { Complex } from './complex';
import { c, cAbs2 } from './complex';

type SingleQubitState = [Complex, Complex];
type TokenType = 'number' | 'ident' | 'op' | 'lparen' | 'rparen' | 'comma' | 'eof';

interface Token {
  type: TokenType;
  value: string;
}

export type InitialStateInputMode = 'qubit' | 'statevector' | 'basis';

export interface InitialQubitStateParse {
  state: SingleQubitState;
  label: string;
  valid: boolean;
  message: string;
}

export interface InitialStateBuildResult {
  state: Complex[];
  qubitLabels: string[];
  valid: boolean;
  message: string;
}

export type StatevectorTemplateKind =
  | 'basis0'
  | 'basis1'
  | 'bell'
  | 'ghz'
  | 'w'
  | 'uniform'
  | 'cluster'
  | 'stabilizer'
  | 'haar';

const formatAmplitudeList = (amps: Complex[]): string => amps
  .map((a) => `${a.re.toFixed(5)}${a.im >= 0 ? '+' : '-'}${Math.abs(a.im).toFixed(5)}*i`)
  .join(', ');

export const getDickeTemplateExpression = (numQubits: number, excitations: number): string => {
  const k = Math.max(0, Math.min(numQubits, Math.round(excitations)));
  const dim = 1 << numQubits;
  const basis: number[] = [];

  for (let i = 0; i < dim; i += 1) {
    let ones = 0;
    for (let q = 0; q < numQubits; q += 1) ones += (i >> q) & 1;
    if (ones === k) basis.push(i);
  }

  if (basis.length === 0) return `|${'0'.repeat(numQubits)}⟩`;

  const weight = 1 / Math.sqrt(basis.length);
  const amps = Array.from({ length: dim }, () => c(0, 0));
  for (const idx of basis) amps[idx] = c(weight, 0);
  return formatAmplitudeList(amps);
};

export interface StatevectorDiagnostic {
  valid: boolean;
  message: string;
  position?: number;
  hint?: string;
}

const SQRT1_2 = 1 / Math.sqrt(2);
const EPS = 1e-10;

const PRESETS: Record<string, { state: SingleQubitState; label: string }> = {
  '0': { state: [c(1), c(0)], label: '|0⟩' },
  '|0>': { state: [c(1), c(0)], label: '|0⟩' },
  '|0⟩': { state: [c(1), c(0)], label: '|0⟩' },
  '1': { state: [c(0), c(1)], label: '|1⟩' },
  '|1>': { state: [c(0), c(1)], label: '|1⟩' },
  '|1⟩': { state: [c(0), c(1)], label: '|1⟩' },
  '+': { state: [c(SQRT1_2), c(SQRT1_2)], label: '|+⟩' },
  '|+>': { state: [c(SQRT1_2), c(SQRT1_2)], label: '|+⟩' },
  '|+⟩': { state: [c(SQRT1_2), c(SQRT1_2)], label: '|+⟩' },
  '-': { state: [c(SQRT1_2), c(-SQRT1_2)], label: '|−⟩' },
  '|->': { state: [c(SQRT1_2), c(-SQRT1_2)], label: '|−⟩' },
  '|−⟩': { state: [c(SQRT1_2), c(-SQRT1_2)], label: '|−⟩' },
  'i': { state: [c(SQRT1_2), c(0, SQRT1_2)], label: '|i⟩' },
  '+i': { state: [c(SQRT1_2), c(0, SQRT1_2)], label: '|i⟩' },
  '-i': { state: [c(SQRT1_2), c(0, -SQRT1_2)], label: '|−i⟩' },
};

const normalizeKey = (raw: string): string => raw.trim().toLowerCase();

const add = (a: Complex, b: Complex): Complex => c(a.re + b.re, a.im + b.im);
const sub = (a: Complex, b: Complex): Complex => c(a.re - b.re, a.im - b.im);
const mul = (a: Complex, b: Complex): Complex => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);

const div = (a: Complex, b: Complex): Complex | null => {
  const den = b.re * b.re + b.im * b.im;
  if (den < EPS) return null;
  return c((a.re * b.re + a.im * b.im) / den, (a.im * b.re - a.re * b.im) / den);
};

const expC = (z: Complex): Complex => {
  const er = Math.exp(z.re);
  return c(er * Math.cos(z.im), er * Math.sin(z.im));
};

const logC = (z: Complex): Complex | null => {
  const mag = Math.hypot(z.re, z.im);
  if (mag < EPS) return null;
  return c(Math.log(mag), Math.atan2(z.im, z.re));
};

const sqrtC = (z: Complex): Complex => {
  const r = Math.hypot(z.re, z.im);
  const t = Math.atan2(z.im, z.re) / 2;
  return c(Math.sqrt(r) * Math.cos(t), Math.sqrt(r) * Math.sin(t));
};

const sinC = (z: Complex): Complex => c(Math.sin(z.re) * Math.cosh(z.im), Math.cos(z.re) * Math.sinh(z.im));
const cosC = (z: Complex): Complex => c(Math.cos(z.re) * Math.cosh(z.im), -Math.sin(z.re) * Math.sinh(z.im));

const tokenize = (src: string): Token[] | null => {
  const s = src.trim();
  const out: Token[] = [];
  let i = 0;

  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i + 1;
      while (j < s.length && /[0-9._]/.test(s[j])) j += 1;
      const num = s.slice(i, j).replace(/_/g, '');
      if (!/^\d*\.?\d+$/.test(num)) return null;
      out.push({ type: 'number', value: num });
      i = j;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let j = i + 1;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j += 1;
      out.push({ type: 'ident', value: s.slice(i, j) });
      i = j;
      continue;
    }
    if ('+-*/^'.includes(ch)) {
      out.push({ type: 'op', value: ch });
      i += 1;
      continue;
    }
    if (ch === '(') {
      out.push({ type: 'lparen', value: ch });
      i += 1;
      continue;
    }
    if (ch === ')') {
      out.push({ type: 'rparen', value: ch });
      i += 1;
      continue;
    }
    if (ch === ',') {
      out.push({ type: 'comma', value: ch });
      i += 1;
      continue;
    }
    return null;
  }

  out.push({ type: 'eof', value: '' });
  return out;
};

class Parser {
  private readonly tokens: Token[];
  private idx = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): Complex | null {
    const v = this.parseExpression();
    if (!v) return null;
    if (this.peek().type !== 'eof') return null;
    return v;
  }

  private parseExpression(): Complex | null {
    let left = this.parseTerm();
    if (!left) return null;

    while (this.peek().type === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.next().value;
      const right = this.parseTerm();
      if (!right) return null;
      left = op === '+' ? add(left, right) : sub(left, right);
    }
    return left;
  }

  private parseTerm(): Complex | null {
    let left = this.parsePower();
    if (!left) return null;

    while (this.peek().type === 'op' && (this.peek().value === '*' || this.peek().value === '/')) {
      const op = this.next().value;
      const right = this.parsePower();
      if (!right) return null;
      if (op === '*') {
        left = mul(left, right);
      } else {
        const q = div(left, right);
        if (!q) return null;
        left = q;
      }
    }
    return left;
  }

  private parsePower(): Complex | null {
    let left = this.parseUnary();
    if (!left) return null;

    if (this.peek().type === 'op' && this.peek().value === '^') {
      this.next();
      const right = this.parsePower();
      if (!right) return null;
      const logv = logC(left);
      if (!logv) return null;
      left = expC(mul(right, logv));
    }
    return left;
  }

  private parseUnary(): Complex | null {
    const t = this.peek();
    if (t.type === 'op' && (t.value === '+' || t.value === '-')) {
      this.next();
      const v = this.parseUnary();
      if (!v) return null;
      return t.value === '+' ? v : c(-v.re, -v.im);
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Complex | null {
    const t = this.peek();

    if (t.type === 'number') {
      this.next();
      return c(Number(t.value), 0);
    }

    if (t.type === 'ident') {
      const name = this.next().value.toLowerCase();
      if (name === 'pi') return c(Math.PI, 0);
      if (name === 'e') return c(Math.E, 0);
      if (name === 'i') return c(0, 1);

      if (this.peek().type !== 'lparen') return null;
      this.next();

      const args: Complex[] = [];
      if (this.peek().type !== 'rparen') {
        while (true) {
          const arg = this.parseExpression();
          if (!arg) return null;
          args.push(arg);
          if (this.peek().type === 'comma') {
            this.next();
            continue;
          }
          break;
        }
      }

      if (this.peek().type !== 'rparen') return null;
      this.next();
      return this.evalFunction(name, args);
    }

    if (t.type === 'lparen') {
      this.next();
      const v = this.parseExpression();
      if (!v || this.peek().type !== 'rparen') return null;
      this.next();
      return v;
    }

    return null;
  }

  private evalFunction(name: string, args: Complex[]): Complex | null {
    const a0 = args[0];
    if (!a0) return null;

    switch (name) {
      case 'sin': return args.length === 1 ? sinC(a0) : null;
      case 'cos': return args.length === 1 ? cosC(a0) : null;
      case 'tan': {
        if (args.length !== 1) return null;
        const d = cosC(a0);
        return div(sinC(a0), d);
      }
      case 'sqrt': return args.length === 1 ? sqrtC(a0) : null;
      case 'exp': return args.length === 1 ? expC(a0) : null;
      case 'log': return args.length === 1 ? logC(a0) : null;
      case 'abs': return args.length === 1 ? c(Math.hypot(a0.re, a0.im), 0) : null;
      case 're': return args.length === 1 ? c(a0.re, 0) : null;
      case 'im': return args.length === 1 ? c(a0.im, 0) : null;
      case 'conj': return args.length === 1 ? c(a0.re, -a0.im) : null;
      default: return null;
    }
  }

  private peek(): Token {
    return this.tokens[this.idx];
  }

  private next(): Token {
    const t = this.tokens[this.idx];
    this.idx += 1;
    return t;
  }
}

const parseComplexExpression = (raw: string): Complex | null => {
  const expr = (raw ?? '').trim();
  if (!expr) return null;
  const tokens = tokenize(expr);
  if (!tokens) return null;
  return new Parser(tokens).parse();
};

export interface BoundedIntegerExpressionParse {
  valid: boolean;
  value: number;
  message: string;
}

export const parseBoundedIntegerExpression = (
  raw: string,
  min: number,
  max: number,
): BoundedIntegerExpressionParse => {
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  const expr = (raw ?? '').trim();

  if (!expr) {
    return {
      valid: false,
      value: lower,
      message: 'Enter an integer expression',
    };
  }

  const allowedIdentifiers = new Set([
    'pi', 'e', 'i',
    'sin', 'cos', 'tan',
    'sqrt', 'exp', 'log',
    'abs', 're', 'im', 'conj',
  ]);
  const unresolved = Array.from(expr.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)).find(
    (m) => !allowedIdentifiers.has((m[0] ?? '').toLowerCase()),
  )?.[0];
  if (unresolved) {
    return {
      valid: false,
      value: lower,
      message: `Undefined symbol '${unresolved}'`,
    };
  }

  const parsed = parseComplexExpression(expr);
  if (!parsed) {
    return {
      valid: false,
      value: lower,
      message: 'Invalid integer expression',
    };
  }

  if (Math.abs(parsed.im) > 1e-9) {
    return {
      valid: false,
      value: lower,
      message: 'Expression must evaluate to a real number',
    };
  }

  if (!Number.isFinite(parsed.re)) {
    return {
      valid: false,
      value: lower,
      message: 'Expression must evaluate to a finite number',
    };
  }

  const rounded = Math.round(parsed.re);
  const clamped = Math.max(lower, Math.min(upper, rounded));
  const roundedChanged = Math.abs(parsed.re - rounded) > 1e-9;
  const clampedChanged = clamped !== rounded;

  if (roundedChanged && clampedChanged) {
    return {
      valid: true,
      value: clamped,
      message: `Rounded to ${rounded} and clamped to ${clamped}`,
    };
  }

  if (roundedChanged) {
    return {
      valid: true,
      value: clamped,
      message: `Rounded to ${clamped}`,
    };
  }

  if (clampedChanged) {
    return {
      valid: true,
      value: clamped,
      message: `Clamped to ${clamped}`,
    };
  }

  return {
    valid: true,
    value: clamped,
    message: 'Expression evaluated',
  };
};

const splitTopLevel = (raw: string, separator: ',' | '+' | '-'): string[] => {
  const out: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);

    if (depth === 0 && ch === separator) {
      out.push(raw.slice(start, i));
      start = i + 1;
    }
  }

  out.push(raw.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
};

const parseCustomPair = (raw: string): SingleQubitState | null => {
  const parts = splitTopLevel(raw, ',');
  if (parts.length !== 2) return null;

  const a = parseComplexExpression(parts[0]);
  const b = parseComplexExpression(parts[1]);
  if (!a || !b) return null;

  const norm = Math.sqrt(cAbs2(a) + cAbs2(b));
  if (!Number.isFinite(norm) || norm < EPS) return null;

  return [c(a.re / norm, a.im / norm), c(b.re / norm, b.im / norm)];
};

const parseSingleQubitKet = (raw: string): SingleQubitState | null => {
  const expr = (raw ?? '').trim();
  if (!expr.includes('|')) return null;

  const terms: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && i > start && (ch === '+' || ch === '-')) {
      terms.push(expr.slice(start, i).trim());
      start = i;
    }
  }
  terms.push(expr.slice(start).trim());

  let amp0 = c(0, 0);
  let amp1 = c(0, 0);

  for (const term of terms) {
    if (!term) continue;
    const match = term.match(/\|\s*([01])\s*(?:>|⟩)/);
    if (!match) return null;

    const bit = match[1];
    let coeffStr = term.slice(0, match.index).trim();
    if (!coeffStr || coeffStr === '+') coeffStr = '1';
    if (coeffStr === '-') coeffStr = '-1';
    if (coeffStr.endsWith('*')) coeffStr = coeffStr.slice(0, -1).trim();

    const coeff = parseComplexExpression(coeffStr);
    if (!coeff) return null;

    if (bit === '0') amp0 = add(amp0, coeff);
    else amp1 = add(amp1, coeff);
  }

  const norm = Math.sqrt(cAbs2(amp0) + cAbs2(amp1));
  if (!Number.isFinite(norm) || norm < EPS) return null;

  return [c(amp0.re / norm, amp0.im / norm), c(amp1.re / norm, amp1.im / norm)];
};

export const parseInitialQubitStateDetailed = (raw: string): InitialQubitStateParse => {
  const cleaned = (raw ?? '').trim();
  const key = normalizeKey(cleaned || '0');
  if (PRESETS[key]) {
    const parsed = PRESETS[key];
    return { ...parsed, valid: true, message: `Preset ${parsed.label}` };
  }

  // 先试 ket 格式（如 0.1|0⟩+0.9|1⟩）
  const ket = parseSingleQubitKet(raw);
  if (ket) return { state: ket, label: '|ψ⟩', valid: true, message: 'Ket expression normalized' };

  // 再试逗号对格式（如 0.1, 0.9）
  const custom = parseCustomPair(raw);
  if (custom) return { state: custom, label: '|ψ⟩', valid: true, message: 'Custom amplitudes normalized' };

  const fallback = PRESETS['0'];
  return {
    ...fallback,
    valid: false,
    message: "Invalid qubit expression. ...",
  };
};

const initZeroState = (numQubits: number): Complex[] => {
  const dim = 1 << numQubits;
  const state: Complex[] = Array(dim).fill(null).map(() => c(0));
  state[0] = c(1);
  return state;
};

const randomInt = (maxExclusive: number): number => Math.floor(Math.random() * Math.max(1, maxExclusive));

const applyHadamard = (state: Complex[], qubit: number): void => {
  const bit = 1 << qubit;
  for (let i = 0; i < state.length; i += 1) {
    if ((i & bit) !== 0) continue;
    const j = i | bit;
    const a = state[i];
    const b = state[j];
    state[i] = c((a.re + b.re) * SQRT1_2, (a.im + b.im) * SQRT1_2);
    state[j] = c((a.re - b.re) * SQRT1_2, (a.im - b.im) * SQRT1_2);
  }
};

const applyPhaseS = (state: Complex[], qubit: number): void => {
  const bit = 1 << qubit;
  for (let i = 0; i < state.length; i += 1) {
    if ((i & bit) === 0) continue;
    const a = state[i];
    state[i] = c(-a.im, a.re);
  }
};

const applyCnot = (state: Complex[], control: number, target: number): void => {
  if (control === target) return;
  const cBit = 1 << control;
  const tBit = 1 << target;
  for (let i = 0; i < state.length; i += 1) {
    if ((i & cBit) === 0 || (i & tBit) !== 0) continue;
    const j = i | tBit;
    const tmp = state[i];
    state[i] = state[j];
    state[j] = tmp;
  }
};

const randomStabilizerState = (numQubits: number): Complex[] => {
  const state = initZeroState(numQubits);
  if (numQubits <= 0) return state;

  // Random single-qubit Clifford dressing.
  for (let q = 0; q < numQubits; q += 1) {
    if (Math.random() < 0.6) applyHadamard(state, q);
    const sPowers = randomInt(4);
    for (let k = 0; k < sPowers; k += 1) applyPhaseS(state, q);
  }

  // Entangling layer for non-product stabilizer states.
  if (numQubits > 1) {
    const entanglingDepth = Math.max(2, numQubits * 2);
    for (let step = 0; step < entanglingDepth; step += 1) {
      const control = randomInt(numQubits);
      let target = randomInt(numQubits - 1);
      if (target >= control) target += 1;
      applyCnot(state, control, target);
      if (Math.random() < 0.35) applyHadamard(state, randomInt(numQubits));
      if (Math.random() < 0.45) applyPhaseS(state, randomInt(numQubits));
    }
  }

  return state;
};

const normalizeState = (state: Complex[]): { normalized: Complex[]; norm: number } | null => {
  let norm2 = 0;
  for (const amp of state) norm2 += cAbs2(amp);
  if (!Number.isFinite(norm2) || norm2 < EPS) return null;
  const norm = Math.sqrt(norm2);
  if (Math.abs(norm - 1) < 1e-8) return { normalized: state, norm };
  return { normalized: state.map((a) => c(a.re / norm, a.im / norm)), norm };
};

const parseKetSuperposition = (raw: string, numQubits: number): { state: Complex[]; message: string } | null => {
  const expr = raw.trim();
  if (!expr.includes('|')) return null;

  const terms: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);

    if (depth === 0 && i > start && (ch === '+' || ch === '-')) {
      terms.push(expr.slice(start, i).trim());
      start = i;
    }
  }
  terms.push(expr.slice(start).trim());

  const state = Array(1 << numQubits).fill(null).map(() => c(0));

  for (const term of terms) {
    if (!term) continue;
    const match = term.match(/\|\s*([01]+)\s*(?:>|⟩)/);
    if (!match) return null;

    const bits = match[1];
    if (bits.length !== numQubits) return null;

    const idx = parseInt(bits, 2);
    const coeffPart = term.slice(0, match.index).trim();
    let coeffStr = coeffPart;
    if (!coeffStr || coeffStr === '+') coeffStr = '1';
    if (coeffStr === '-') coeffStr = '-1';
    if (coeffStr.endsWith('*')) coeffStr = coeffStr.slice(0, -1).trim();

    const coeff = parseComplexExpression(coeffStr);
    if (!coeff) return null;

    state[idx] = add(state[idx], coeff);
  }

  const normalized = normalizeState(state);
  if (!normalized) return null;

  const msg = Math.abs(normalized.norm - 1) < 1e-8
    ? 'Statevector expression accepted'
    : `Statevector normalized (norm was ${normalized.norm.toFixed(3)})`;
  return { state: normalized.normalized, message: msg };
};

const parseAmplitudeList = (raw: string, numQubits: number): { state: Complex[]; message: string } | null => {
  const parts = splitTopLevel(raw, ',');
  const dim = 1 << numQubits;
  if (parts.length !== dim) return null;

  const state: Complex[] = [];
  for (const part of parts) {
    const amp = parseComplexExpression(part);
    if (!amp) return null;
    state.push(amp);
  }

  const normalized = normalizeState(state);
  if (!normalized) return null;

  const msg = Math.abs(normalized.norm - 1) < 1e-8
    ? 'Amplitude list accepted'
    : `Amplitude list normalized (norm was ${normalized.norm.toFixed(3)})`;
  return { state: normalized.normalized, message: msg };
};

const getStatevectorDiagnostics = (raw: string, numQubits: number): StatevectorDiagnostic => {
  const expr = raw.trim();
  if (!expr) {
    return {
      valid: true,
      message: `Using default |${'0'.repeat(numQubits)}⟩`,
    };
  }

  let depth = 0;
  for (let i = 0; i < expr.length; i += 1) {
    if (expr[i] === '(') depth += 1;
    if (expr[i] === ')') depth -= 1;
    if (depth < 0) {
      return { valid: false, message: `Unexpected ')' at position ${i + 1}`, position: i, hint: 'Remove extra closing parenthesis' };
    }
  }
  if (depth !== 0) {
    return { valid: false, message: 'Unbalanced parentheses in statevector expression', hint: 'Check matching parentheses in coefficients' };
  }

  const unsupported = expr.match(/[^0-9A-Za-z_\s+\-*/^(),.|<>⟩]/);
  if (unsupported?.index !== undefined) {
    return {
      valid: false,
      message: `Unsupported token '${unsupported[0]}' at position ${unsupported.index + 1}`,
      position: unsupported.index,
      hint: 'Use numbers, operators, functions, commas, and kets like |010⟩',
    };
  }

  const kets = Array.from(expr.matchAll(/\|\s*([01]+)\s*(?:>|⟩)/g));
  for (const m of kets) {
    const bits = m[1] ?? '';
    if (bits.length !== numQubits) {
      return {
        valid: false,
        message: `Ket |${bits}⟩ has ${bits.length} bits but circuit has ${numQubits} qubits`,
        position: m.index,
        hint: `Use ${numQubits}-bit kets, e.g. |${'0'.repeat(numQubits)}⟩`,
      };
    }
  }

  const names = Array.from(expr.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)).map((m) => (m[1] ?? '').toLowerCase());
  const allowed = new Set(['sin', 'cos', 'tan', 'sqrt', 'exp', 'log', 'abs', 're', 'im', 'conj']);
  const typoMap: Record<string, string> = { squareroot: 'sqrt', sqt: 'sqrt', cosine: 'cos', sine: 'sin', ln: 'log' };
  for (const fn of names) {
    if (!allowed.has(fn)) {
      return {
        valid: false,
        message: `Unsupported function '${fn}'`,
        hint: `Try '${typoMap[fn] ?? 'sqrt'}' or one of: sin, cos, tan, sqrt, exp, log, abs, re, im, conj`,
      };
    }
  }

  if (expr.includes(',') && !expr.includes('|')) {
    const dim = 1 << numQubits;
    const parts = splitTopLevel(expr, ',');
    if (parts.length !== dim) {
      return {
        valid: false,
        message: `Amplitude list has ${parts.length} entries, expected ${dim}`,
        hint: `Provide exactly ${dim} amplitudes for ${numQubits} qubits`,
      };
    }
  }

  return {
    valid: false,
    message: 'Could not parse statevector expression',
    hint: `Try '(1/sqrt(2))*|${'0'.repeat(numQubits)}⟩ + (1/sqrt(2))*|${'1'.repeat(numQubits)}⟩' or a comma-separated amplitude list`,
  };
};

export const getStatevectorTemplateExpression = (kind: StatevectorTemplateKind, numQubits: number): string => {
  const zeroKet = `|${'0'.repeat(numQubits)}⟩`;
  const oneKet = `|${'1'.repeat(numQubits)}⟩`;

  switch (kind) {
    case 'basis0':
      return zeroKet;
    case 'basis1':
      return oneKet;
    case 'bell':
      if (numQubits < 2) return '(1/sqrt(2))*|0⟩ + (1/sqrt(2))*|1⟩';
      return `(1/sqrt(2))*|${'0'.repeat(numQubits)}⟩ + (1/sqrt(2))*|${'1'.repeat(numQubits)}⟩`;
    case 'ghz':
      return `(1/sqrt(2))*${zeroKet} + (1/sqrt(2))*${oneKet}`;
    case 'w': {
      const basis = Array.from({ length: numQubits }, (_, q) => {
        const bits = Array(numQubits).fill('0');
        bits[q] = '1';
        return `|${bits.join('')}⟩`;
      });
      return basis.map((b) => `(1/sqrt(${numQubits}))*${b}`).join(' + ');
    }
    case 'uniform': {
      const dim = 1 << numQubits;
      const amp = 1 / Math.sqrt(dim);
      return formatAmplitudeList(Array.from({ length: dim }, () => c(amp, 0)));
    }
    case 'cluster': {
      const dim = 1 << numQubits;
      const norm = 1 / Math.sqrt(dim);
      const amps = Array.from({ length: dim }, (_, x) => {
        let parity = 0;
        for (let q = 0; q < numQubits - 1; q += 1) {
          const bq = (x >> q) & 1;
          const bNext = (x >> (q + 1)) & 1;
          parity ^= (bq & bNext);
        }
        return c(parity ? -norm : norm, 0);
      });
      return formatAmplitudeList(amps);
    }
    case 'stabilizer': {
      return formatAmplitudeList(randomStabilizerState(numQubits));
    }
    case 'haar': {
      const dim = 1 << numQubits;
      const amps = Array.from({ length: dim }, () => ({ re: Math.random() * 2 - 1, im: Math.random() * 2 - 1 }));
      const norm = Math.sqrt(amps.reduce((sum, a) => sum + a.re * a.re + a.im * a.im, 0)) || 1;
      return formatAmplitudeList(amps.map((a) => c(a.re / norm, a.im / norm)));
    }
    default:
      return zeroKet;
  }
};



export const parseInitialQubitState = (raw: string): { state: SingleQubitState; label: string } => {
  const { state, label } = parseInitialQubitStateDetailed(raw);
  return { state, label };
};

export const getInitialQubitLabels = (numQubits: number, expressions: string[]): string[] => {
  return Array.from({ length: numQubits }, (_, q) => parseInitialQubitState(expressions[q] ?? '0').label);
};

export const buildInitialState = (numQubits: number, expressions: string[]): Complex[] => {
  const dim = 1 << numQubits;
  const single = Array.from({ length: numQubits }, (_, q) => parseInitialQubitState(expressions[q] ?? '0').state);

  const state: Complex[] = Array(dim).fill(null).map(() => c(0));
  for (let i = 0; i < dim; i++) {
    let amp = c(1, 0);

    for (let q = 0; q < numQubits; q++) {
      const bit = (i >> q) & 1;
      const qamp = bit === 0 ? single[q][0] : single[q][1];
      amp = mul(amp, qamp);
    }

    state[i] = amp;
  }

  return state;
};

export const buildInitialStateFromInput = (
  numQubits: number,
  mode: InitialStateInputMode,
  qubitExpressions: string[],
  statevectorExpression: string,
): InitialStateBuildResult => {
  if (mode === 'statevector') {
    const expr = statevectorExpression.trim();
    const zeroKet = `|${'0'.repeat(numQubits)}⟩`;

    if (!expr) {
      return {
        state: initZeroState(numQubits),
        qubitLabels: Array(numQubits).fill('|0⟩'),
        valid: true,
        message: `Using default ${zeroKet}. Enter a superposition or amplitude list to override.`,
      };
    }

    const ket = parseKetSuperposition(statevectorExpression, numQubits);
    if (ket) {
      return {
        state: ket.state,
        qubitLabels: Array(numQubits).fill('|ψ⟩'),
        valid: true,
        message: ket.message,
      };
    }

    const list = parseAmplitudeList(statevectorExpression, numQubits);
    if (list) {
      return {
        state: list.state,
        qubitLabels: Array(numQubits).fill('|ψ⟩'),
        valid: true,
        message: list.message,
      };
    }

    return {
      state: initZeroState(numQubits),
      qubitLabels: Array(numQubits).fill('|0⟩'),
      valid: false,
      message: (() => {
        const diag = getStatevectorDiagnostics(statevectorExpression, numQubits);
        return diag.hint ? `${diag.message}. ${diag.hint}.` : diag.message;
      })(),
    };
  }

  // mode === 'qubit' or mode === 'basis' (basis is converted to qubit expressions by the caller)
  const parsed = Array.from({ length: numQubits }, (_, q) => parseInitialQubitStateDetailed(qubitExpressions[q] ?? '0'));
  const valid = parsed.every((p) => p.valid);

  return {
    state: buildInitialState(numQubits, qubitExpressions),
    qubitLabels: parsed.map((p) => p.label),
    valid,
    message: valid ? 'Per-qubit initialization ready' : 'Some qubits are invalid and defaulted to |0⟩',
  };
};