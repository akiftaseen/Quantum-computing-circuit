import type { CircuitState, GateName, PlacedGate } from './circuitTypes';
import { newGateId } from './circuitTypes';

export interface MacroParseResult {
  valid: boolean;
  message: string;
  circuit: CircuitState;
}

interface MacroGate {
  gate: GateName;
  targets: number[];
  controls: number[];
  params: number[];
}

const GATE_ALIASES: Record<string, GateName> = {
  H: 'H',
  X: 'X',
  Y: 'Y',
  Z: 'Z',
  S: 'S',
  SDG: 'Sdg',
  T: 'T',
  TDG: 'Tdg',
  RX: 'Rx',
  RY: 'Ry',
  RZ: 'Rz',
  P: 'P',
  CNOT: 'CNOT',
  CX: 'CNOT',
  CZ: 'CZ',
  SWAP: 'SWAP',
  CCX: 'CCX',
  ISWAP: 'iSWAP',
  XX: 'XX',
  YY: 'YY',
  ZZ: 'ZZ',
};

const splitArgs = (text: string): string[] => {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
};

const parseNumber = (raw: string): number | null => {
  const v = raw.trim().toLowerCase();
  if (v === 'pi') return Math.PI;
  if (v === 'tau') return Math.PI * 2;
  if (v === 'pi/2') return Math.PI / 2;
  if (v === '-pi/2') return -Math.PI / 2;
  if (v === 'pi/4') return Math.PI / 4;
  if (v === '-pi/4') return -Math.PI / 4;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const parseGateCall = (line: string): { gate: MacroGate | null; error?: string } => {
  const m = line.match(/^([A-Za-z][A-Za-z0-9]*)\s*\((.*)\)$/);
  if (!m) return { gate: null, error: `Invalid statement '${line}'` };

  const gateName = GATE_ALIASES[m[1].toUpperCase()];
  if (!gateName) return { gate: null, error: `Unknown gate '${m[1]}'` };

  const args = splitArgs(m[2]);
  const asNum = args.map(parseNumber);
  if (asNum.some((x) => x === null)) return { gate: null, error: `Invalid numeric argument in '${line}'` };
  const nums = asNum as number[];

  const intArg = (idx: number): number | null => {
    const v = nums[idx];
    return Number.isInteger(v) && v >= 0 ? v : null;
  };

  if (['H', 'X', 'Y', 'Z', 'S', 'Sdg', 'T', 'Tdg'].includes(gateName)) {
    const t = intArg(0);
    if (t === null || nums.length !== 1) return { gate: null, error: `${gateName} expects 1 integer qubit` };
    return { gate: { gate: gateName, targets: [t], controls: [], params: [] } };
  }

  if (['Rx', 'Ry', 'Rz', 'P'].includes(gateName)) {
    const t = intArg(0);
    if (t === null || nums.length !== 2) return { gate: null, error: `${gateName} expects (qubit, theta)` };
    return { gate: { gate: gateName, targets: [t], controls: [], params: [nums[1]] } };
  }

  if (['CNOT', 'CZ'].includes(gateName)) {
    const c = intArg(0);
    const t = intArg(1);
    if (c === null || t === null || nums.length !== 2 || c === t) return { gate: null, error: `${gateName} expects (control, target)` };
    return { gate: { gate: gateName, targets: [t], controls: [c], params: [] } };
  }

  if (['SWAP', 'iSWAP'].includes(gateName)) {
    const a = intArg(0);
    const b = intArg(1);
    if (a === null || b === null || nums.length !== 2 || a === b) return { gate: null, error: `${gateName} expects (q1, q2)` };
    return { gate: { gate: gateName, targets: [a, b], controls: [], params: [] } };
  }

  if (gateName === 'CCX') {
    const c1 = intArg(0);
    const c2 = intArg(1);
    const t = intArg(2);
    if (c1 === null || c2 === null || t === null || nums.length !== 3) return { gate: null, error: 'CCX expects (control1, control2, target)' };
    return { gate: { gate: 'CCX', targets: [t], controls: [c1, c2], params: [] } };
  }

  if (['XX', 'YY', 'ZZ'].includes(gateName)) {
    const a = intArg(0);
    const b = intArg(1);
    if (a === null || b === null || nums.length !== 3 || a === b) return { gate: null, error: `${gateName} expects (q1, q2, theta)` };
    return { gate: { gate: gateName, targets: [a, b], controls: [], params: [nums[2]] } };
  }

  return { gate: null, error: `Unsupported gate '${gateName}'` };
};

const findMatchingBrace = (text: string, openIdx: number): number => {
  let depth = 0;
  for (let i = openIdx; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
};

const expandRepeats = (source: string): { expanded: string | null; error?: string } => {
  let text = source;
  const repeatRe = /repeat\s*\(\s*(\d+)\s*\)\s*\{/i;

  while (true) {
    const m = repeatRe.exec(text);
    if (!m) return { expanded: text };

    const count = Number(m[1]);
    if (!Number.isInteger(count) || count < 0 || count > 128) {
      return { expanded: null, error: `Invalid repeat count '${m[1]}'` };
    }

    const open = (m.index ?? 0) + m[0].length - 1;
    const close = findMatchingBrace(text, open);
    if (close < 0) return { expanded: null, error: 'Unmatched brace in repeat block' };

    const body = text.slice(open + 1, close);
    const repeated = Array.from({ length: count }, () => body).join('\n');
    text = `${text.slice(0, m.index)}${repeated}${text.slice(close + 1)}`;
  }
};

export const parseCircuitMacro = (source: string, fallbackQubits = 2): MacroParseResult => {
  const trimmed = source.trim();
  if (!trimmed) {
    return {
      valid: false,
      message: 'Macro is empty',
      circuit: { numQubits: fallbackQubits, numColumns: 8, gates: [] },
    };
  }

  const expanded = expandRepeats(trimmed);
  if (!expanded.expanded) {
    return {
      valid: false,
      message: expanded.error ?? 'Unable to expand repeat blocks',
      circuit: { numQubits: fallbackQubits, numColumns: 8, gates: [] },
    };
  }

  const lines = expanded.expanded
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed: MacroGate[] = [];
  let maxQubit = fallbackQubits - 1;

  for (let i = 0; i < lines.length; i += 1) {
    const res = parseGateCall(lines[i]);
    if (!res.gate) {
      return {
        valid: false,
        message: `Line ${i + 1}: ${res.error ?? 'Invalid macro statement'}`,
        circuit: { numQubits: fallbackQubits, numColumns: 8, gates: [] },
      };
    }

    parsed.push(res.gate);
    const candidates = [...res.gate.targets, ...res.gate.controls];
    maxQubit = Math.max(maxQubit, ...candidates);
  }

  const gates: PlacedGate[] = parsed.map((g, idx) => ({
    id: newGateId(),
    gate: g.gate,
    column: idx,
    targets: g.targets,
    controls: g.controls,
    params: g.params,
  }));

  const numQubits = Math.max(1, maxQubit + 1);
  const numColumns = Math.max(8, gates.length + 2);
  return {
    valid: true,
    message: `Parsed ${gates.length} gates`,
    circuit: { numQubits, numColumns, gates },
  };
};
