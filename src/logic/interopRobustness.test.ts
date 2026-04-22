import { describe, expect, it } from 'vitest';
import { parseCircuitMacro } from './circuitMacro';
import { parseOpenQasmLite } from './openqasmLite';
import { diffCircuits } from './circuitDiff';
import { runQasmRoundTrip } from './qasmRoundTrip';
import { applySymbolBindings } from './symbolBindings';
import type { CircuitState } from './circuitTypes';

describe('interop and parser robustness', () => {
  it('expands repeat blocks and preserves ordering', () => {
    const parsed = parseCircuitMacro('repeat(2){ H(0); CNOT(0,1); }', 2);
    expect(parsed.valid).toBe(true);
    expect(parsed.circuit.gates.map((g) => g.gate)).toEqual(['H', 'CNOT', 'H', 'CNOT']);
    expect(parsed.circuit.gates.map((g) => g.column)).toEqual([0, 1, 2, 3]);
  });

  it('rejects malformed repeat blocks', () => {
    const parsed = parseCircuitMacro('repeat(3){ H(0);', 2);
    expect(parsed.valid).toBe(false);
    expect(parsed.message.toLowerCase()).toContain('unmatched brace');
  });

  it('parses representative OpenQASM lines into known gate forms', () => {
    const source = [
      'OPENQASM 2.0;',
      'include "qelib1.inc";',
      'qreg q[2];',
      'creg c[2];',
      'h q[0];',
      'cx q[0],q[1];',
      'rzz(pi/2) q[0],q[1];',
      'measure q[1] -> c[1];',
    ].join('\n');

    const parsed = parseOpenQasmLite(source, 2);
    expect(parsed.valid).toBe(true);
    expect(parsed.circuit.gates.map((g) => g.gate)).toEqual(['H', 'CNOT', 'ZZ']);
  });

  it('round-trips a mixed circuit through OpenQASM lite parser', () => {
    const circuit: CircuitState = {
      numQubits: 3,
      numColumns: 10,
      gates: [
        { id: 'a', gate: 'H', column: 0, targets: [0], controls: [], params: [] },
        { id: 'b', gate: 'CNOT', column: 1, targets: [1], controls: [0], params: [] },
        { id: 'c', gate: 'CCX', column: 2, targets: [2], controls: [0, 1], params: [] },
        { id: 'd', gate: 'Rz', column: 3, targets: [2], controls: [], params: [Math.PI / 4] },
        { id: 'e', gate: 'SWAP', column: 4, targets: [0, 2], controls: [], params: [] },
      ],
    };

    const report = runQasmRoundTrip(circuit);
    expect(report.valid).toBe(true);
    expect(report.diffSummary).toEqual({ changed: 0, added: 0, removed: 0, depthDelta: 0 });
  });

  it('diff is stable for semantically identical same-column gates with different ids', () => {
    const left: CircuitState = {
      numQubits: 2,
      numColumns: 8,
      gates: [
        { id: 'left-z', gate: 'Z', column: 0, targets: [1], controls: [], params: [] },
        { id: 'left-h', gate: 'H', column: 0, targets: [0], controls: [], params: [] },
      ],
    };

    const right: CircuitState = {
      numQubits: 2,
      numColumns: 8,
      gates: [
        { id: 'right-h', gate: 'H', column: 0, targets: [0], controls: [], params: [] },
        { id: 'right-z', gate: 'Z', column: 0, targets: [1], controls: [], params: [] },
      ],
    };

    const diff = diffCircuits(left, right);
    expect(diff.changed).toBe(0);
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
  });

  it('applies symbol bindings safely when symbol names include regex characters', () => {
    const source = 'alpha+beta + alpha+beta^2';
    const replaced = applySymbolBindings(source, [{ name: 'alpha+beta', value: 'pi/2' }]);
    expect(replaced).toContain('(pi/2)');
    expect(replaced).not.toContain('alpha+beta');
  });

  it('replaces identifier symbols without mutating larger identifier tokens', () => {
    const source = 'theta + theta1 + sin(theta)';
    const replaced = applySymbolBindings(source, [{ name: 'theta', value: 'pi/2' }]);

    expect(replaced).toContain('(pi/2) + theta1 + sin((pi/2))');
    expect(replaced).toContain('theta1');
  });
});
