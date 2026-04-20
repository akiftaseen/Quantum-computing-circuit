import { describe, expect, it } from 'vitest';
import { c, cConj, cMul } from './complex';
import { runCircuit, runWithShots } from './circuitRunner';
import { partialTrace } from './simulator';
import type { CircuitState, GateName } from './circuitTypes';
import {
  TEMPLATES,
  bellPair,
  bernsteinVazirani,
  clusterState4,
  deutschJozsa,
  ghz3,
  groversSearch,
  ising2D,
  phaseKickback2,
  qaoaRing3,
  qft3,
  repetitionCode3,
  ringEntangler4,
  superposition4,
  swapDemo2,
  teleportation,
  vqeAnsatz,
} from './templates';

const buildTeleportInputState = (alpha: { re: number; im: number }, beta: { re: number; im: number }) => {
  const state = Array.from({ length: 8 }, () => c(0));
  // q0 carries |psi>, q1=q2 start in |0>.
  state[0] = c(alpha.re, alpha.im);
  state[1] = c(beta.re, beta.im);
  return state;
};

const bitOf = (key: string, qubit: number, numQubits: number): number =>
  Number(key[numQubits - 1 - qubit]);

const totalShots = (hist: Map<string, number>): number =>
  Array.from(hist.values()).reduce((sum, count) => sum + count, 0);

const singleQubitGates = new Set<GateName>(['I', 'H', 'X', 'Y', 'Z', 'S', 'Sdg', 'T', 'Tdg', 'Rx', 'Ry', 'Rz', 'P', 'M', 'Barrier']);
const twoQubitGates = new Set<GateName>(['CNOT', 'CZ', 'SWAP', 'iSWAP', 'XX', 'YY', 'ZZ']);

const validateTemplateStructure = (circuit: CircuitState) => {
  const seenMeasuredBits = new Set<number>();

  for (const gate of circuit.gates) {
    for (const q of [...gate.targets, ...gate.controls]) {
      expect(q).toBeGreaterThanOrEqual(0);
      expect(q).toBeLessThan(circuit.numQubits);
    }

    const touched = [...gate.targets, ...gate.controls];
    expect(new Set(touched).size).toBe(touched.length);

    if (singleQubitGates.has(gate.gate)) {
      if (gate.gate === 'M') {
        expect(gate.targets.length).toBe(1);
        expect(gate.controls.length).toBe(0);
        expect(gate.classicalBit).toBeDefined();
        if (gate.classicalBit !== undefined) {
          seenMeasuredBits.add(gate.classicalBit);
        }
      } else if (gate.gate === 'Barrier') {
        expect(gate.targets.length + gate.controls.length).toBeGreaterThanOrEqual(0);
      } else {
        expect(gate.targets.length).toBe(1);
      }
    }

    if (twoQubitGates.has(gate.gate)) {
      if (gate.gate === 'CNOT' || gate.gate === 'CZ') {
        expect(gate.controls.length).toBe(1);
        expect(gate.targets.length).toBe(1);
      } else {
        expect(gate.controls.length).toBe(0);
        expect(gate.targets.length).toBe(2);
      }
    }

    if (gate.gate === 'CCX') {
      expect(gate.controls.length).toBe(2);
      expect(gate.targets.length).toBe(1);
    }

    if (gate.condition !== undefined) {
      expect(seenMeasuredBits.has(gate.condition)).toBe(true);
    }
  }
};

describe('circuit templates', () => {
  it('all templates run and return normalized states', () => {
    for (const template of TEMPLATES) {
      const circuit = template.build();
      const { state } = runCircuit(circuit);
      const norm = state.reduce((sum, amp) => sum + amp.re * amp.re + amp.im * amp.im, 0);

      expect(state).toHaveLength(1 << circuit.numQubits);
      expect(norm).toBeCloseTo(1, 6);
    }
  });

  it('all templates satisfy structural gate constraints', () => {
    for (const template of TEMPLATES) {
      const circuit = template.build();
      expect(circuit.numQubits).toBe(template.qubits);
      validateTemplateStructure(circuit);
    }
  });

  it('teleportation reproduces the input state on receiver qubit', () => {
    const circuit = teleportation();
    const inputs = [
      { alpha: c(1, 0), beta: c(0, 0) },
      { alpha: c(0, 0), beta: c(1, 0) },
      { alpha: c(Math.SQRT1_2, 0), beta: c(Math.SQRT1_2, 0) },
      { alpha: c(Math.SQRT1_2, 0), beta: c(0, Math.SQRT1_2) },
    ];

    for (const sample of inputs) {
      const initial = buildTeleportInputState(sample.alpha, sample.beta);
      const { state } = runCircuit(circuit, undefined, false, initial, () => 0.37);
      const [r00, r01, r10, r11] = partialTrace(state, 2, 3);

      const expected00 = cMul(sample.alpha, cConj(sample.alpha));
      const expected01 = cMul(sample.alpha, cConj(sample.beta));
      const expected10 = cMul(sample.beta, cConj(sample.alpha));
      const expected11 = cMul(sample.beta, cConj(sample.beta));

      expect(r00.re).toBeCloseTo(expected00.re, 6);
      expect(r00.im).toBeCloseTo(expected00.im, 6);
      expect(r01.re).toBeCloseTo(expected01.re, 6);
      expect(r01.im).toBeCloseTo(expected01.im, 6);
      expect(r10.re).toBeCloseTo(expected10.re, 6);
      expect(r10.im).toBeCloseTo(expected10.im, 6);
      expect(r11.re).toBeCloseTo(expected11.re, 6);
      expect(r11.im).toBeCloseTo(expected11.im, 6);
    }
  });

  it('Bell pair template only produces |00> and |11>', () => {
    const hist = runWithShots(bellPair(), 4096, undefined, undefined, { seed: 17 });
    const allowed = new Set(['00', '11']);

    for (const key of hist.keys()) {
      expect(allowed.has(key)).toBe(true);
    }

    const p00 = (hist.get('00') ?? 0) / 4096;
    const p11 = (hist.get('11') ?? 0) / 4096;
    expect(p00).toBeGreaterThan(0.4);
    expect(p00).toBeLessThan(0.6);
    expect(p11).toBeGreaterThan(0.4);
    expect(p11).toBeLessThan(0.6);
  });

  it('GHZ template only produces |000> and |111>', () => {
    const hist = runWithShots(ghz3(), 4096, undefined, undefined, { seed: 23 });
    const allowed = new Set(['000', '111']);

    for (const key of hist.keys()) {
      expect(allowed.has(key)).toBe(true);
    }
  });

  it('Superposition template is approximately uniform', () => {
    const shots = 8192;
    const hist = runWithShots(superposition4(), shots, undefined, undefined, { seed: 29 });
    const expected = 1 / 16;

    for (const count of hist.values()) {
      const p = count / shots;
      expect(Math.abs(p - expected)).toBeLessThan(0.03);
    }
  });

  it('Swap demo transfers the deterministic 1-state to q1', () => {
    const shots = 4096;
    const hist = runWithShots(swapDemo2(), shots, undefined, undefined, { seed: 31 });

    let onesOnQ1 = 0;
    let onesOnQ0 = 0;
    for (const [key, count] of hist.entries()) {
      if (bitOf(key, 1, 2) === 1) onesOnQ1 += count;
      if (bitOf(key, 0, 2) === 1) onesOnQ0 += count;
    }

    expect(onesOnQ1).toBe(shots);
    const pQ0 = onesOnQ0 / shots;
    expect(pQ0).toBeGreaterThan(0.4);
    expect(pQ0).toBeLessThan(0.6);
  });

  it('Phase kickback leaves q0 in |1>', () => {
    const shots = 4096;
    const hist = runWithShots(phaseKickback2(), shots, undefined, undefined, { seed: 37 });

    let onesOnQ0 = 0;
    for (const [key, count] of hist.entries()) {
      if (bitOf(key, 0, 2) === 1) onesOnQ0 += count;
    }
    expect(onesOnQ0).toBe(shots);
  });

  it('Deutsch-Jozsa template encodes a balanced-oracle signature on q0,q1', () => {
    const shots = 4096;
    const hist = runWithShots(deutschJozsa(), shots, undefined, undefined, { seed: 41 });

    let valid = 0;
    for (const [key, count] of hist.entries()) {
      const q0 = bitOf(key, 0, 3);
      const q1 = bitOf(key, 1, 3);
      if (q0 === 1 && q1 === 1) valid += count;
    }
    expect(valid).toBe(shots);
  });

  it('Bernstein-Vazirani template recovers hidden string 11 on q0,q1', () => {
    const shots = 4096;
    const hist = runWithShots(bernsteinVazirani(), shots, undefined, undefined, { seed: 43 });

    let valid = 0;
    for (const [key, count] of hist.entries()) {
      const q0 = bitOf(key, 0, 3);
      const q1 = bitOf(key, 1, 3);
      if (q0 === 1 && q1 === 1) valid += count;
    }
    expect(valid).toBe(shots);
  });

  it('QFT template maps |000> to an approximately uniform distribution', () => {
    const shots = 8192;
    const hist = runWithShots(qft3(), shots, undefined, undefined, { seed: 47 });
    const expected = 1 / 8;

    for (const count of hist.values()) {
      const p = count / shots;
      expect(Math.abs(p - expected)).toBeLessThan(0.045);
    }
  });

  it('Grover template significantly amplifies one marked basis state', () => {
    const hist = runWithShots(groversSearch(), 4096, undefined, undefined, { seed: 53 });
    const shots = totalShots(hist);
    const top = Math.max(...hist.values());
    const topProb = top / shots;

    expect(topProb).toBeGreaterThan(0.45);
  });

  it('Cluster-state template remains approximately uniform in Z basis', () => {
    const shots = 8192;
    const hist = runWithShots(clusterState4(), shots, undefined, undefined, { seed: 59 });
    const expected = 1 / 16;

    for (const count of hist.values()) {
      const p = count / shots;
      expect(Math.abs(p - expected)).toBeLessThan(0.035);
    }
  });

  it('Ring entangler template remains approximately uniform in Z basis', () => {
    const shots = 8192;
    const hist = runWithShots(ringEntangler4(), shots, undefined, undefined, { seed: 61 });
    const expected = 1 / 16;

    for (const count of hist.values()) {
      const p = count / shots;
      expect(Math.abs(p - expected)).toBeLessThan(0.035);
    }
  });

  it('VQE ansatz template produces a non-trivial two-qubit distribution', () => {
    const shots = 4096;
    const hist = runWithShots(vqeAnsatz(), shots, undefined, undefined, { seed: 67 });
    const probs = Array.from(hist.values()).map((count) => count / shots).sort((a, b) => b - a);
    expect(probs[0]).toBeLessThan(0.9);
    expect(probs[1]).toBeGreaterThan(0.02);
  });

  it('Ising template produces finite normalized outcomes', () => {
    const shots = 4096;
    const hist = runWithShots(ising2D(), shots, undefined, undefined, { seed: 71 });
    const pTotal = totalShots(hist) / shots;
    expect(pTotal).toBeCloseTo(1, 10);
    expect(hist.size).toBeGreaterThan(1);
  });

  it('QAOA ring template amplifies at least one computational basis outcome', () => {
    const shots = 4096;
    const hist = runWithShots(qaoaRing3(), shots, undefined, undefined, { seed: 73 });
    const top = Math.max(...hist.values()) / shots;
    expect(top).toBeGreaterThan(0.2);
  });

  it('Repetition-code template includes explicit encode, injected error, and majority correction', () => {
    const circuit = repetitionCode3();
    const gates = circuit.gates;

    const hasEncodeCnotQ0ToQ1 = gates.some((g) => g.gate === 'CNOT' && g.controls[0] === 0 && g.targets[0] === 1);
    const hasEncodeCnotQ0ToQ2 = gates.some((g) => g.gate === 'CNOT' && g.controls[0] === 0 && g.targets[0] === 2);
    const hasInjectedError = gates.some((g) => g.gate === 'X' && g.targets[0] === 1);
    const correctionCcxs = gates.filter((g) => g.gate === 'CCX');

    expect(hasEncodeCnotQ0ToQ1).toBe(true);
    expect(hasEncodeCnotQ0ToQ2).toBe(true);
    expect(hasInjectedError).toBe(true);
    expect(correctionCcxs.length).toBeGreaterThanOrEqual(3);
  });
});
