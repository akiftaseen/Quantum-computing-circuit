import { describe, expect, it } from 'vitest';
import type { CircuitState } from './circuitTypes';
import { parseCircuitMacro } from './circuitMacro';
import { runQasmRoundTrip } from './qasmRoundTrip';
import { generateRandomCircuit } from './qiskitOss';
import { routeCircuitForHardware } from './hardwareLayout';
import { optimizeSingleParameter } from './parameterOptimizer';
import { optimizeMultiObjective } from './multiObjectiveOptimizer';
import { initZeroState } from './simulator';
import type { HardwareProfile } from './hardwareProfiles';

const makeRng = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const randInt = (rng: () => number, maxExclusive: number): number => Math.floor(rng() * maxExclusive);

const lineProfile = (n: number): HardwareProfile => ({
  id: `line-${n}`,
  name: `Line ${n}`,
  basisGates: ['H', 'X', 'Rx', 'Ry', 'Rz', 'CNOT', 'CZ', 'SWAP', 'XX', 'YY', 'ZZ', 'M', 'Barrier'],
  couplingEdges: Array.from({ length: Math.max(0, n - 1) }, (_, i) => [i, i + 1]),
  t1Us: 100,
  t2Us: 80,
  readoutError: 0.02,
  cxError: 0.02,
});

const isTwoQubitGate = (gate: string): boolean => ['CNOT', 'CZ', 'SWAP', 'iSWAP', 'XX', 'YY', 'ZZ'].includes(gate);

const gateWires = (g: CircuitState['gates'][number]): number[] => [...g.controls, ...g.targets];

const isAdjacentOnLine = (a: number, b: number): boolean => Math.abs(a - b) === 1;

describe('property fuzz robustness', () => {
  it('fuzzes macro parser over randomized valid gate programs', () => {
    const rng = makeRng(0xC0FFEE);

    const oneQ = ['H', 'X', 'Y', 'Z', 'S', 'T'];
    const rot = ['Rx', 'Ry', 'Rz', 'P'];
    const twoQ = ['CNOT', 'CZ', 'SWAP', 'XX', 'YY', 'ZZ'];

    for (let sample = 0; sample < 40; sample += 1) {
      const n = 2 + randInt(rng, 3);
      const len = 8 + randInt(rng, 14);
      const lines: string[] = [];

      for (let i = 0; i < len; i += 1) {
        const pick = randInt(rng, 3);
        if (pick === 0) {
          const g = oneQ[randInt(rng, oneQ.length)];
          const q = randInt(rng, n);
          lines.push(`${g}(${q})`);
          continue;
        }
        if (pick === 1) {
          const g = rot[randInt(rng, rot.length)];
          const q = randInt(rng, n);
          const theta = ((rng() * 2 - 1) * Math.PI).toFixed(6);
          lines.push(`${g}(${q},${theta})`);
          continue;
        }

        const g = twoQ[randInt(rng, twoQ.length)];
        const a = randInt(rng, n);
        let b = randInt(rng, n - 1);
        if (b >= a) b += 1;
        if (g === 'CNOT' || g === 'CZ') {
          lines.push(`${g}(${a},${b})`);
        } else {
          const theta = ((rng() * 2 - 1) * Math.PI).toFixed(6);
          if (g === 'SWAP') lines.push(`SWAP(${a},${b})`);
          else lines.push(`${g}(${a},${b},${theta})`);
        }
      }

      const macro = lines.join(';\n');
      const parsed = parseCircuitMacro(macro, n);
      expect(parsed.valid).toBe(true);
      expect(parsed.circuit.numQubits).toBeGreaterThanOrEqual(n);
      expect(parsed.circuit.gates.length).toBe(lines.length);
    }
  });

  it('fuzzes OpenQASM round-trip stability on generated circuits', () => {
    for (let seed = 1; seed <= 24; seed += 1) {
      const n = 1 + (seed % 4);
      const depth = 8 + (seed % 11);
      const circuit = generateRandomCircuit(n, depth, seed);
      const report = runQasmRoundTrip(circuit);

      expect(report.valid).toBe(true);
      expect(report.diffSummary.changed).toBe(0);
      expect(report.diffSummary.added).toBe(0);
      expect(report.diffSummary.removed).toBe(0);
    }
  });

  it('fuzzes routing invariants on connected line topology', () => {
    for (let seed = 101; seed < 125; seed += 1) {
      const n = 3 + (seed % 3);
      const circuit = generateRandomCircuit(n, 10 + (seed % 7), seed);
      const report = routeCircuitForHardware(circuit, lineProfile(n));

      expect(report.unroutableGates).toBe(0);

      for (const gate of report.routedCircuit.gates) {
        if (!isTwoQubitGate(gate.gate)) continue;
        const wires = gateWires(gate);
        if (wires.length < 2) continue;
        expect(isAdjacentOnLine(wires[0], wires[1])).toBe(true);
      }
    }
  });

  it('fuzzes single-parameter optimizer trace invariants', () => {
    const rng = makeRng(0xBADC0DE);

    for (let i = 0; i < 30; i += 1) {
      const n = 1 + randInt(rng, 3);
      const depth = 6 + randInt(rng, 6);
      const circuit = generateRandomCircuit(n, depth, 500 + i);

      const paramGate = circuit.gates.find((g) => ['Rx', 'Ry', 'Rz', 'P'].includes(g.gate));
      if (!paramGate) continue;

      const steps = 1 + randInt(rng, 300);
      const basisBits = randInt(rng, 1 << n).toString(2).padStart(n, '0');

      const result = optimizeSingleParameter(
        circuit,
        paramGate.id,
        initZeroState(n),
        { kind: 'probability', basisBits },
        -Math.PI,
        Math.PI,
        steps,
      );

      const expectedSteps = Math.max(4, Math.min(256, Math.round(steps)));
      expect(result.trace).toHaveLength(expectedSteps);
      expect(Number.isFinite(result.bestTheta)).toBe(true);
      expect(Number.isFinite(result.bestValue)).toBe(true);
      expect(result.bestValue).toBeGreaterThanOrEqual(0);
      expect(result.bestValue).toBeLessThanOrEqual(1.0000001);
    }
  });

  it('fuzzes multi-objective optimizer score and probability bounds', () => {
    const rng = makeRng(0xFACE1234);

    for (let i = 0; i < 30; i += 1) {
      const n = 1 + randInt(rng, 3);
      const depth = 5 + randInt(rng, 8);
      const circuit = generateRandomCircuit(n, depth, 800 + i);

      const paramGate = circuit.gates.find((g) => ['Rx', 'Ry', 'Rz', 'P'].includes(g.gate));
      if (!paramGate) continue;

      const steps = 1 + randInt(rng, 300);
      const result = optimizeMultiObjective(circuit, initZeroState(n), {
        gateId: paramGate.id,
        basisBits: randInt(rng, 1 << n).toString(2).padStart(n, '0'),
        start: -Math.PI,
        end: Math.PI,
        steps,
        weightProbability: 0.5 + rng(),
        weightDepth: rng(),
        weightTwoQ: rng(),
      });

      const expectedSteps = Math.max(4, Math.min(256, Math.round(steps)));
      expect(result.trace).toHaveLength(expectedSteps);
      expect(Number.isFinite(result.bestTheta)).toBe(true);
      expect(Number.isFinite(result.bestScore)).toBe(true);
      expect(result.trace.every((p) => Number.isFinite(p.score))).toBe(true);
      expect(result.trace.every((p) => p.probability >= 0 && p.probability <= 1.0000001)).toBe(true);
    }
  });
});