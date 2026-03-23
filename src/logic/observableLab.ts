import type { Complex } from './complex';
import { c, cConj, cMul } from './complex';
import { basisDistributionFromState, type MeasurementBasisAxis } from './measurementBasis';

export type BasisAxis = MeasurementBasisAxis;

type PauliAxis = 'I' | 'X' | 'Y' | 'Z';

export interface ParsedObservable {
  raw: string;
  normalized: string;
  sign: 1 | -1;
  terms: Array<{ qubit: number; axis: Exclude<PauliAxis, 'I'> }>;
}

export interface ObservableEvaluation {
  raw: string;
  normalized: string;
  value: number | null;
  valid: boolean;
  message: string;
}

const parseObservable = (raw: string, numQubits: number): { parsed: ParsedObservable | null; error?: string } => {
  const input = raw.replace(/\s+/g, '');
  if (!input) return { parsed: null, error: 'Empty observable expression' };

  let sign: 1 | -1 = 1;
  let body = input;
  if (body.startsWith('+')) body = body.slice(1);
  if (body.startsWith('-')) {
    sign = -1;
    body = body.slice(1);
  }

  if (!body || body === 'I') {
    return {
      parsed: {
        raw,
        normalized: sign === -1 ? '-I' : 'I',
        sign,
        terms: [],
      },
    };
  }

  const pieces = body.split('*').filter(Boolean);
  if (pieces.length === 0) return { parsed: null, error: 'Expected Pauli terms like Z0 or X1*Y2' };

  const termsMap = new Map<number, Exclude<PauliAxis, 'I'>>();
  for (const piece of pieces) {
    const m = piece.match(/^([IXYZ])(\d+)$/i);
    if (!m) return { parsed: null, error: `Invalid term '${piece}'. Use X0, Y1, Z2, or I.` };

    const axis = m[1].toUpperCase() as PauliAxis;
    const qubit = Number(m[2]);

    if (!Number.isInteger(qubit) || qubit < 0 || qubit >= numQubits) {
      return { parsed: null, error: `Qubit index ${qubit} is out of range for ${numQubits} qubits` };
    }

    if (axis === 'I') continue;

    if (termsMap.has(qubit)) {
      return { parsed: null, error: `Qubit q${qubit} appears multiple times` };
    }
    termsMap.set(qubit, axis);
  }

  const terms = Array.from(termsMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([qubit, axis]) => ({ qubit, axis }));

  const normalizedBody = terms.length > 0
    ? terms.map((t) => `${t.axis}${t.qubit}`).join('*')
    : 'I';

  return {
    parsed: {
      raw,
      normalized: sign === -1 ? `-${normalizedBody}` : normalizedBody,
      sign,
      terms,
    },
  };
};

const pauliAction = (
  index: number,
  qubit: number,
  axis: Exclude<PauliAxis, 'I'>,
): { next: number; phase: Complex } => {
  const bit = (index >> qubit) & 1;
  if (axis === 'X') {
    return { next: index ^ (1 << qubit), phase: c(1, 0) };
  }
  if (axis === 'Z') {
    return { next: index, phase: c(bit === 0 ? 1 : -1, 0) };
  }

  return {
    next: index ^ (1 << qubit),
    phase: c(0, bit === 0 ? 1 : -1),
  };
};

const expectationObservable = (state: Complex[], observable: ParsedObservable): number => {
  let real = 0;

  for (let i = 0; i < state.length; i += 1) {
    let next = i;
    let phase = c(1, 0);

    for (const term of observable.terms) {
      const action = pauliAction(next, term.qubit, term.axis);
      next = action.next;
      phase = cMul(phase, action.phase);
    }

    const contrib = cMul(cConj(state[i]), cMul(phase, state[next]));
    real += contrib.re;
  }

  return observable.sign * real;
};

export const evaluateObservableExpressions = (
  source: string,
  numQubits: number,
  state: Complex[],
): ObservableEvaluation[] => {
  const rawLines = source
    .split(/\n|,|;/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (rawLines.length === 0) {
    return [{ raw: '', normalized: '', value: null, valid: false, message: 'Enter one or more observables' }];
  }

  return rawLines.map((raw) => {
    const parsed = parseObservable(raw, numQubits);
    if (!parsed.parsed) {
      return {
        raw,
        normalized: raw,
        value: null,
        valid: false,
        message: parsed.error ?? 'Invalid observable',
      };
    }

    const value = expectationObservable(state, parsed.parsed);
    return {
      raw,
      normalized: parsed.parsed.normalized,
      value,
      valid: true,
      message: 'ok',
    };
  });
};

export const evaluateSingleObservable = (
  source: string,
  numQubits: number,
  state: Complex[],
): ObservableEvaluation => {
  const rows = evaluateObservableExpressions(source, numQubits, state);
  return rows[0] ?? { raw: '', normalized: '', value: null, valid: false, message: 'Enter one observable' };
};

export const computeBasisDistribution = (
  state: Complex[],
  numQubits: number,
  bases: BasisAxis[],
): Array<{ basis: string; probability: number }> => {
  return basisDistributionFromState(state, numQubits, bases);
};
