import { describe, expect, it } from 'vitest';
import type { CircuitState } from './circuitTypes';
import {
  exportOpenQasm2,
  isCliffordLikeCircuit,
  transpileLikePreset,
  transpileLikePresetReport,
} from './qiskitOss';

describe('qiskit-style interop and transpile robustness', () => {
  it('level 0 transpile preserves gate count and gate kinds', () => {
    const circuit: CircuitState = {
      numQubits: 2,
      numColumns: 8,
      gates: [
        { id: 'a', gate: 'H', column: 0, targets: [0], controls: [], params: [] },
        { id: 'b', gate: 'CNOT', column: 1, targets: [1], controls: [0], params: [] },
      ],
    };

    const out = transpileLikePreset(circuit, 0);
    expect(out.gates).toHaveLength(2);
    expect(out.gates.map((g) => g.gate)).toEqual(['H', 'CNOT']);
  });

  it('level 1 cancels adjacent inverse/self-inverse pairs', () => {
    const circuit: CircuitState = {
      numQubits: 2,
      numColumns: 8,
      gates: [
        { id: 'h1', gate: 'H', column: 0, targets: [0], controls: [], params: [] },
        { id: 'h2', gate: 'H', column: 1, targets: [0], controls: [], params: [] },
        { id: 'cx1', gate: 'CNOT', column: 2, targets: [1], controls: [0], params: [] },
        { id: 'cx2', gate: 'CNOT', column: 3, targets: [1], controls: [0], params: [] },
      ],
    };

    const report = transpileLikePresetReport(circuit, 1);
    expect(report.afterGateCount).toBe(0);
    expect(report.fusedOrCancelled).toBe(4);
  });

  it('level 2 fuses parametric rotations on same wires', () => {
    const circuit: CircuitState = {
      numQubits: 1,
      numColumns: 8,
      gates: [
        { id: 'r1', gate: 'Rz', column: 0, targets: [0], controls: [], params: [Math.PI / 4] },
        { id: 'r2', gate: 'Rz', column: 1, targets: [0], controls: [], params: [Math.PI / 4] },
      ],
    };

    const out = transpileLikePreset(circuit, 2);
    expect(out.gates).toHaveLength(1);
    expect(out.gates[0].gate).toBe('Rz');
    expect(out.gates[0].params[0]).toBeCloseTo(Math.PI / 2, 8);
  });

  it('level 3 compacts sparse columns for independent gates', () => {
    const circuit: CircuitState = {
      numQubits: 2,
      numColumns: 16,
      gates: [
        { id: 'a', gate: 'H', column: 0, targets: [0], controls: [], params: [] },
        { id: 'b', gate: 'X', column: 9, targets: [1], controls: [], params: [] },
      ],
    };

    const report = transpileLikePresetReport(circuit, 3);
    expect(report.afterDepth).toBeLessThanOrEqual(report.beforeDepth);
    expect(report.circuit.gates[0].column).toBe(0);
    expect(report.circuit.gates[1].column).toBe(0);
  });

  it('correctly classifies Clifford-like circuits with angle checks', () => {
    const clifford: CircuitState = {
      numQubits: 1,
      numColumns: 8,
      gates: [{ id: 'a', gate: 'Rz', column: 0, targets: [0], controls: [], params: [Math.PI / 2] }],
    };
    const nonClifford: CircuitState = {
      numQubits: 1,
      numColumns: 8,
      gates: [{ id: 'a', gate: 'Rz', column: 0, targets: [0], controls: [], params: [Math.PI / 3] }],
    };

    expect(isCliffordLikeCircuit(clifford).isClifford).toBe(true);
    expect(isCliffordLikeCircuit(nonClifford).isClifford).toBe(false);
  });

  it('exports representative gates to OpenQASM 2 text', () => {
    const circuit: CircuitState = {
      numQubits: 3,
      numColumns: 8,
      gates: [
        { id: 'h', gate: 'H', column: 0, targets: [0], controls: [], params: [] },
        { id: 'cx', gate: 'CNOT', column: 1, targets: [1], controls: [0], params: [] },
        { id: 'ccx', gate: 'CCX', column: 2, targets: [2], controls: [0, 1], params: [] },
      ],
    };

    const qasm = exportOpenQasm2(circuit);
    expect(qasm).toContain('OPENQASM 2.0;');
    expect(qasm).toContain('qreg q[3];');
    expect(qasm).toContain('h q[0];');
    expect(qasm).toContain('cx q[0],q[1];');
    expect(qasm).toContain('ccx q[0],q[1],q[2];');
  });
});