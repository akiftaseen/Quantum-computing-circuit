import { parseCircuitMacro } from './circuitMacro';
import type { CircuitState } from './circuitTypes';

export interface QasmInteropReport {
  supported: boolean;
  warnings: string[];
  suggestions: string[];
}

const angleToMacro = (raw: string): string => raw.replace(/\s+/g, '').replace(/\bpi\b/gi, 'pi');

const q = String.raw`([A-Za-z_][A-Za-z0-9_]*)\[(\d+)\]`;

const parseIndex = (value: string): string => `${Number(value)}`;

export const parseOpenQasmLite = (source: string, fallbackQubits = 2): { valid: boolean; message: string; circuit: CircuitState } => {
  const lines = source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/g, '').trim())
    .filter((line) => line && !/^OPENQASM/i.test(line) && !/^include/i.test(line) && !/^qreg/i.test(line) && !/^creg/i.test(line));

  const macroLines: string[] = [];

  for (const line of lines) {
    const clean = line.endsWith(';') ? line.slice(0, -1).trim() : line;

    // Ignore non-unitary directives in lite mode.
    if (/^(barrier|reset)\b/i.test(clean)) continue;

    let m = clean.match(new RegExp(`^h\\s+${q}$`, 'i'));
    if (m) { macroLines.push(`H(${parseIndex(m[2])})`); continue; }

    m = clean.match(new RegExp(`^x\\s+${q}$`, 'i'));
    if (m) { macroLines.push(`X(${parseIndex(m[2])})`); continue; }

    m = clean.match(new RegExp(`^y\\s+${q}$`, 'i'));
    if (m) { macroLines.push(`Y(${parseIndex(m[2])})`); continue; }

    m = clean.match(new RegExp(`^z\\s+${q}$`, 'i'));
    if (m) { macroLines.push(`Z(${parseIndex(m[2])})`); continue; }

    m = clean.match(new RegExp(`^s\\s+${q}$`, 'i'));
    if (m) { macroLines.push(`S(${parseIndex(m[2])})`); continue; }

    m = clean.match(new RegExp(`^sdg\\s+${q}$`, 'i'));
    if (m) { macroLines.push(`Sdg(${parseIndex(m[2])})`); continue; }

    m = clean.match(new RegExp(`^t\\s+${q}$`, 'i'));
    if (m) { macroLines.push(`T(${parseIndex(m[2])})`); continue; }

    m = clean.match(new RegExp(`^tdg\\s+${q}$`, 'i'));
    if (m) { macroLines.push(`Tdg(${parseIndex(m[2])})`); continue; }

    m = clean.match(new RegExp(`^id\\s+${q}$`, 'i'));
    if (m) { macroLines.push(`I(${parseIndex(m[2])})`); continue; }

    m = clean.match(new RegExp(`^sx\\s+${q}$`, 'i'));
    if (m) { macroLines.push(`Rx(${parseIndex(m[2])},pi/2)`); continue; }

    m = clean.match(new RegExp(`^sxdg\\s+${q}$`, 'i'));
    if (m) { macroLines.push(`Rx(${parseIndex(m[2])},-pi/2)`); continue; }

    m = clean.match(new RegExp(`^cx\\s+${q}\\s*,\\s*${q}$`, 'i'));
    if (m) { macroLines.push(`CNOT(${parseIndex(m[2])},${parseIndex(m[4])})`); continue; }

    m = clean.match(new RegExp(`^cz\\s+${q}\\s*,\\s*${q}$`, 'i'));
    if (m) { macroLines.push(`CZ(${parseIndex(m[2])},${parseIndex(m[4])})`); continue; }

    m = clean.match(new RegExp(`^cp\\(([^)]+)\\)\\s+${q}\\s*,\\s*${q}$`, 'i'));
    if (m) { macroLines.push(`P(${parseIndex(m[4])},${angleToMacro(m[1])})`); continue; }

    m = clean.match(new RegExp(`^swap\\s+${q}\\s*,\\s*${q}$`, 'i'));
    if (m) { macroLines.push(`SWAP(${parseIndex(m[2])},${parseIndex(m[4])})`); continue; }

    m = clean.match(new RegExp(`^ccx\\s+${q}\\s*,\\s*${q}\\s*,\\s*${q}$`, 'i'));
    if (m) {
      macroLines.push(`CCX(${parseIndex(m[2])},${parseIndex(m[4])},${parseIndex(m[6])})`);
      continue;
    }

    m = clean.match(new RegExp(`^rxx\\(([^)]+)\\)\\s+${q}\\s*,\\s*${q}$`, 'i'));
    if (m) { macroLines.push(`XX(${parseIndex(m[2])},${parseIndex(m[4])},${angleToMacro(m[1])})`); continue; }

    m = clean.match(new RegExp(`^ryy\\(([^)]+)\\)\\s+${q}\\s*,\\s*${q}$`, 'i'));
    if (m) { macroLines.push(`YY(${parseIndex(m[2])},${parseIndex(m[4])},${angleToMacro(m[1])})`); continue; }

    m = clean.match(new RegExp(`^rzz\\(([^)]+)\\)\\s+${q}\\s*,\\s*${q}$`, 'i'));
    if (m) { macroLines.push(`ZZ(${parseIndex(m[2])},${parseIndex(m[4])},${angleToMacro(m[1])})`); continue; }

    m = clean.match(new RegExp(`^rx\\(([^)]+)\\)\\s+${q}$`, 'i'));
    if (m) { macroLines.push(`Rx(${parseIndex(m[2])},${angleToMacro(m[1])})`); continue; }

    m = clean.match(new RegExp(`^ry\\(([^)]+)\\)\\s+${q}$`, 'i'));
    if (m) { macroLines.push(`Ry(${parseIndex(m[2])},${angleToMacro(m[1])})`); continue; }

    m = clean.match(new RegExp(`^rz\\(([^)]+)\\)\\s+${q}$`, 'i'));
    if (m) { macroLines.push(`Rz(${parseIndex(m[2])},${angleToMacro(m[1])})`); continue; }

    m = clean.match(new RegExp(`^p\\(([^)]+)\\)\\s+${q}$`, 'i'));
    if (m) { macroLines.push(`P(${parseIndex(m[2])},${angleToMacro(m[1])})`); continue; }

    // OpenQASM 2.0 U3(theta,phi,lambda) decomposition
    m = clean.match(new RegExp(`^u3?\\(([^,]+),([^,]+),([^)]+)\\)\\s+${q}$`, 'i'));
    if (m) {
      const qi = parseIndex(m[4]);
      macroLines.push(`Rz(${qi},${angleToMacro(m[3])})`);
      macroLines.push(`Ry(${qi},${angleToMacro(m[1])})`);
      macroLines.push(`Rz(${qi},${angleToMacro(m[2])})`);
      continue;
    }

    m = clean.match(new RegExp(`^u2\\(([^,]+),([^)]+)\\)\\s+${q}$`, 'i'));
    if (m) {
      const qi = parseIndex(m[3]);
      macroLines.push(`Rz(${qi},${angleToMacro(m[2])})`);
      macroLines.push(`Ry(${qi},pi/2)`);
      macroLines.push(`Rz(${qi},${angleToMacro(m[1])})`);
      continue;
    }

    m = clean.match(new RegExp(`^u1\\(([^)]+)\\)\\s+${q}$`, 'i'));
    if (m) { macroLines.push(`P(${parseIndex(m[2])},${angleToMacro(m[1])})`); continue; }

    m = clean.match(new RegExp(`^measure\\s+${q}\\s*->\\s*([A-Za-z_][A-Za-z0-9_]*)\\[(\\d+)\\]$`, 'i'));
    if (m) {
      macroLines.push(`// measure ${m[1]}[${m[2]}] -> ${m[3]}[${m[4]}] ignored in lite mode`);
      continue;
    }

    return {
      valid: false,
      message: `Unsupported QASM line: '${clean}'`,
      circuit: { numQubits: fallbackQubits, numColumns: 8, gates: [] },
    };
  }

  return parseCircuitMacro(macroLines.join(';\n'), fallbackQubits);
};

export const analyzeOpenQasmInterop = (source: string): QasmInteropReport => {
  const lines = source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/g, '').trim())
    .filter(Boolean);

  const warnings: string[] = [];
  const suggestions: string[] = [];

  for (const line of lines) {
    const clean = line.endsWith(';') ? line.slice(0, -1).trim() : line;
    if (/^gate\s+/i.test(clean)) {
      warnings.push(`Custom gate definitions are not executed in lite mode: '${clean}'`);
      suggestions.push('Decompose custom gates into standard instructions before import.');
    }
    if (/^opaque\s+/i.test(clean)) {
      warnings.push(`Opaque gate not supported: '${clean}'`);
      suggestions.push('Replace opaque declarations with explicit primitive gate sequences.');
    }
    if (/^if\s*\(/i.test(clean)) {
      warnings.push(`Classical conditionals are not supported: '${clean}'`);
      suggestions.push('Convert conditional branches into separate circuits for educational simulation.');
    }
    if (/^u\(/i.test(clean)) {
      suggestions.push('u(theta,phi,lambda) is best normalized to u3(theta,phi,lambda) for portability.');
    }
    if (/\bcswap\b/i.test(clean) || /\bcu\d\b/i.test(clean)) {
      warnings.push(`Controlled composite gate may fail in lite mode: '${clean}'`);
      suggestions.push('Decompose advanced controlled gates to CX/CZ and single-qubit rotations.');
    }
  }

  return {
    supported: warnings.length === 0,
    warnings,
    suggestions: Array.from(new Set(suggestions)),
  };
};
