import { describe, expect, it } from 'vitest';
import type { CircuitState } from './circuitTypes';
import { routeCircuitForHardware } from './hardwareLayout';
import { HARDWARE_PROFILES, evaluateCircuitAgainstHardware, type HardwareProfile } from './hardwareProfiles';
import { buildLiveTranspileHints } from './transpileHints';
import { optimizeSingleParameter } from './parameterOptimizer';
import { optimizeMultiObjective } from './multiObjectiveOptimizer';
import { initZeroState } from './simulator';

const line3: HardwareProfile = {
  id: 'line3',
  name: 'Line 3',
  basisGates: ['H', 'Rx', 'CNOT', 'SWAP', 'M', 'Barrier'],
  couplingEdges: [[0, 1], [1, 2]],
  t1Us: 100,
  t2Us: 80,
  readoutError: 0.02,
  cxError: 0.02,
};

describe('routing and hardware compatibility robustness', () => {
  it('does not route on all-to-all backend', () => {
    const circuit: CircuitState = {
      numQubits: 2,
      numColumns: 8,
      gates: [{ id: 'g1', gate: 'CNOT', column: 0, targets: [1], controls: [0], params: [] }],
    };

    const report = routeCircuitForHardware(circuit, HARDWARE_PROFILES[0]);
    expect(report.swapInserted).toBe(0);
    expect(report.unroutableGates).toBe(0);
    expect(report.depthAfter).toBe(report.depthBefore);
  });

  it('inserts SWAP chain for non-adjacent 2-qubit gate on a line', () => {
    const circuit: CircuitState = {
      numQubits: 3,
      numColumns: 8,
      gates: [{ id: 'g1', gate: 'CNOT', column: 0, targets: [2], controls: [0], params: [] }],
    };

    const report = routeCircuitForHardware(circuit, line3);
    expect(report.swapInserted).toBe(2);
    expect(report.unroutableGates).toBe(0);
    expect(report.routedCircuit.gates.map((g) => g.gate)).toEqual(['SWAP', 'CNOT', 'SWAP']);
  });

  it('marks disconnected gates as unroutable', () => {
    const disconnected: HardwareProfile = {
      ...line3,
      couplingEdges: [[0, 1]],
    };
    const circuit: CircuitState = {
      numQubits: 3,
      numColumns: 8,
      gates: [{ id: 'g1', gate: 'CNOT', column: 0, targets: [2], controls: [0], params: [] }],
    };

    const report = routeCircuitForHardware(circuit, disconnected);
    expect(report.unroutableGates).toBe(1);
    expect(report.swapInserted).toBe(0);
  });

  it('computes unsupported-gate and connectivity violations', () => {
    const circuit: CircuitState = {
      numQubits: 3,
      numColumns: 8,
      gates: [
        { id: 'a', gate: 'H', column: 0, targets: [0], controls: [], params: [] },
        { id: 'b', gate: 'CNOT', column: 1, targets: [2], controls: [0], params: [] },
      ],
    };

    const report = evaluateCircuitAgainstHardware(circuit, HARDWARE_PROFILES[1]);
    expect(report.unsupportedTotal).toBeGreaterThan(0);
    expect(report.edgeViolations).toBe(1);
    expect(report.compatibilityScore).toBeLessThan(100);
  });
});

describe('transpile hints and optimizers robustness', () => {
  it('produces cancellation, merge, and decomposition hints together', () => {
    const circuit: CircuitState = {
      numQubits: 2,
      numColumns: 8,
      gates: [
        { id: 'h1', gate: 'H', column: 0, targets: [0], controls: [], params: [] },
        { id: 'h2', gate: 'H', column: 1, targets: [0], controls: [], params: [] },
        { id: 'r1', gate: 'Rx', column: 2, targets: [1], controls: [], params: [0.1] },
        { id: 'r2', gate: 'Rx', column: 3, targets: [1], controls: [], params: [0.2] },
      ],
    };

    const hints = buildLiveTranspileHints(circuit, HARDWARE_PROFILES[1]);
    const joined = hints.map((h) => `${h.title} ${h.detail}`).join(' | ');

    expect(joined).toContain('cancellation');
    expect(joined).toContain('fusion');
    expect(joined).toContain('non-native');
  });

  it('optimizes single-parameter probability objective near expected angle', () => {
    const circuit: CircuitState = {
      numQubits: 1,
      numColumns: 8,
      gates: [{ id: 'rx', gate: 'Rx', column: 0, targets: [0], controls: [], params: [0] }],
    };

    const result = optimizeSingleParameter(
      circuit,
      'rx',
      initZeroState(1),
      { kind: 'probability', basisBits: '1' },
      0,
      2 * Math.PI,
      33,
    );

    expect(result.trace).toHaveLength(33);
    expect(result.bestValue).toBeCloseTo(1, 3);
    expect(Math.abs(result.bestTheta - Math.PI)).toBeLessThan(0.25);
  });

  it('optimizes observable objective and keeps traces finite', () => {
    const circuit: CircuitState = {
      numQubits: 1,
      numColumns: 8,
      gates: [{ id: 'rx', gate: 'Rx', column: 0, targets: [0], controls: [], params: [0] }],
    };

    const result = optimizeSingleParameter(
      circuit,
      'rx',
      initZeroState(1),
      { kind: 'observable', expr: 'Z0' },
      -Math.PI,
      Math.PI,
      41,
    );

    expect(result.bestValue).toBeGreaterThan(0.95);
    expect(result.trace.every((p) => Number.isFinite(p.value))).toBe(true);
  });

  it('multi-objective optimizer respects step clamping and returns bounded probabilities', () => {
    const circuit: CircuitState = {
      numQubits: 1,
      numColumns: 8,
      gates: [{ id: 'rx', gate: 'Rx', column: 0, targets: [0], controls: [], params: [0] }],
    };

    const result = optimizeMultiObjective(circuit, initZeroState(1), {
      gateId: 'rx',
      basisBits: '1',
      start: 0,
      end: 2 * Math.PI,
      steps: 1,
      weightProbability: 1,
      weightDepth: 0,
      weightTwoQ: 0,
    });

    expect(result.trace).toHaveLength(4);
    expect(result.trace.every((p) => p.probability >= 0 && p.probability <= 1)).toBe(true);
    expect(result.bestScore).toBeGreaterThanOrEqual(0);
  });
});