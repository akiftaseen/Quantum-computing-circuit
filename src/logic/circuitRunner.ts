import type { CircuitState, GateName, PlacedGate } from './circuitTypes';
import type { Complex } from './complex';
import { c, cAdd, cConj, cMul, cScale } from './complex';
import {
  initZeroState, applySingleQubitGate, applyControlledGate,
  applySWAP, measureQubit, apply2QubitGate, apply3QubitGate,
} from './simulator';
import {
  I_GATE, H_GATE, X_GATE, Y_GATE, Z_GATE,
  S_GATE, SDG_GATE, T_GATE, TDG_GATE, Rx, Ry, Rz, PGate,
  iSWAP_GATE, CCX_GATE, XX, YY, ZZ,
} from './gate';
import { CIRCUIT_CONSTRAINTS } from './constants';
import type { NoiseConfig } from './noiseModel';
import type { Matrix2 } from './gate';
import { rotateStateForMeasurementBasis, type MeasurementBasisAxis } from './measurementBasis';
import { densityMatrixFromPureState } from './densityMatrix';

export const getMatrix = (g: GateName, p: number[]): Matrix2 => {
  switch (g) {
    case 'I': return I_GATE; case 'H': return H_GATE;
    case 'X': return X_GATE; case 'Y': return Y_GATE; case 'Z': return Z_GATE;
    case 'S': return S_GATE; case 'Sdg': return SDG_GATE;
    case 'T': return T_GATE; case 'Tdg': return TDG_GATE;
    case 'Rx': return Rx(p[0] ?? 0); case 'Ry': return Ry(p[0] ?? 0);
    case 'Rz': return Rz(p[0] ?? 0); case 'P': return PGate(p[0] ?? 0);
    default: return I_GATE;
  }
};

export interface StepResult {
  state: Complex[];
  classicalBits: Map<number, number>;
}

export interface ShotSamplingOptions {
  seed?: number;
}

interface CompiledCircuitPlan {
  columns: PlacedGate[][];
  hasMidMeasure: boolean;
  signature: string;
}

type ComplexMatrix = Complex[][];
type ClassicalBranch = { rho: ComplexMatrix; classicalBits: Map<number, number> };
type ActiveArityPerQubit = number[];

const RUN_CACHE_LIMIT = 256;
const runCache = new Map<string, StepResult>();
const compiledCircuitCache = new WeakMap<CircuitState, CompiledCircuitPlan>();
const singleQubitOperatorCache = new Map<string, ComplexMatrix>();
const gateOperatorCache = new Map<string, ComplexMatrix>();
const projectorOperatorCache = new Map<string, ComplexMatrix>();

const cloneStepResult = (result: StepResult): StepResult => ({
  state: result.state.map((amp) => ({ re: amp.re, im: amp.im })),
  classicalBits: new Map(result.classicalBits),
});

const stateSignature = (state?: Complex[]): string => {
  if (!state) return 'default';
  return state.map((z) => `${z.re.toFixed(8)},${z.im.toFixed(8)}`).join('|');
};

const createRandomSource = (seed?: number): (() => number) => {
  if (!Number.isFinite(seed)) return Math.random;

  let a = (Math.floor(seed as number) >>> 0);
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const sanitizeProbabilities = (probs: number[]): number[] => {
  const clean = probs.map((p) => (Number.isFinite(p) && p > 0 ? p : 0));
  const sum = clean.reduce((acc, p) => acc + p, 0);
  if (sum <= 1e-15) return clean;
  return clean.map((p) => p / sum);
};

const createAliasSampler = (probabilities: number[]): ((rand: () => number) => number) => {
  const n = probabilities.length;
  if (n === 0) {
    return () => 0;
  }

  const probs = sanitizeProbabilities(probabilities);
  const scaled = probs.map((p) => p * n);
  const alias = Array(n).fill(0);
  const threshold = Array(n).fill(0);
  const small: number[] = [];
  const large: number[] = [];

  for (let i = 0; i < n; i++) {
    if (scaled[i] < 1) {
      small.push(i);
    } else {
      large.push(i);
    }
  }

  while (small.length > 0 && large.length > 0) {
    const l = small.pop() as number;
    const g = large.pop() as number;
    threshold[l] = scaled[l];
    alias[l] = g;
    scaled[g] = scaled[g] + scaled[l] - 1;
    if (scaled[g] < 1) {
      small.push(g);
    } else {
      large.push(g);
    }
  }

  while (large.length > 0) {
    threshold[large.pop() as number] = 1;
  }
  while (small.length > 0) {
    threshold[small.pop() as number] = 1;
  }

  return (rand: () => number) => {
    const col = Math.min(n - 1, Math.floor(rand() * n));
    return rand() < threshold[col] ? col : alias[col];
  };
};

const zeroMatrix = (dim: number): ComplexMatrix =>
  Array.from({ length: dim }, () => Array.from({ length: dim }, () => c(0)));

const matrixMul = (a: ComplexMatrix, b: ComplexMatrix): ComplexMatrix => {
  const dim = a.length;
  const out = zeroMatrix(dim);
  for (let i = 0; i < dim; i++) {
    for (let k = 0; k < dim; k++) {
      const aik = a[i][k];
      if (Math.abs(aik.re) < 1e-15 && Math.abs(aik.im) < 1e-15) continue;
      for (let j = 0; j < dim; j++) {
        out[i][j] = cAdd(out[i][j], cMul(aik, b[k][j]));
      }
    }
  }
  return out;
};

const matrixDagger = (m: ComplexMatrix): ComplexMatrix => {
  const dim = m.length;
  const out = zeroMatrix(dim);
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      out[j][i] = cConj(m[i][j]);
    }
  }
  return out;
};

const matrixAddScaled = (base: ComplexMatrix, add: ComplexMatrix, scale = 1): ComplexMatrix => {
  const dim = base.length;
  const out = zeroMatrix(dim);
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      out[i][j] = cAdd(base[i][j], cScale(add[i][j], scale));
    }
  }
  return out;
};

const gateMatrixKey = (m: Matrix2): string =>
  m.map((z) => `${z.re.toFixed(12)},${z.im.toFixed(12)}`).join('|');

const buildSingleQubitOperator = (numQubits: number, target: number, gate: Matrix2): ComplexMatrix => {
  const cacheKey = `${numQubits}:${target}:${gateMatrixKey(gate)}`;
  const cached = singleQubitOperatorCache.get(cacheKey);
  if (cached) return cached;

  const dim = 1 << numQubits;
  const op = zeroMatrix(dim);

  for (let col = 0; col < dim; col++) {
    const basis: Complex[] = Array.from({ length: dim }, (_, idx) => (idx === col ? c(1) : c(0)));
    const out = applySingleQubitGate(basis, gate, target, numQubits);
    for (let row = 0; row < dim; row++) {
      op[row][col] = out[row];
    }
  }

  singleQubitOperatorCache.set(cacheKey, op);
  return op;
};

const buildSingleQubitProjector = (numQubits: number, target: number, outcome: 0 | 1): ComplexMatrix => {
  const cacheKey = `${numQubits}:${target}:${outcome}`;
  const cached = projectorOperatorCache.get(cacheKey);
  if (cached) return cached;

  const dim = 1 << numQubits;
  const proj = zeroMatrix(dim);
  const mask = 1 << target;
  for (let i = 0; i < dim; i++) {
    const bit = ((i & mask) !== 0 ? 1 : 0) as 0 | 1;
    if (bit === outcome) {
      proj[i][i] = c(1);
    }
  }

  projectorOperatorCache.set(cacheKey, proj);
  return proj;
};

const buildGateOperator = (gate: PlacedGate, numQubits: number): ComplexMatrix | null => {
  if (gate.gate === 'Barrier' || gate.gate === 'M') return null;

  const gateKey = `${numQubits}:${gate.gate}:t${gate.targets.join(',')}:c${gate.controls.join(',')}:p${gate.params.map((p) => p.toFixed(12)).join(',')}`;
  const cached = gateOperatorCache.get(gateKey);
  if (cached) return cached;

  const dim = 1 << numQubits;
  const op = zeroMatrix(dim);

  for (let col = 0; col < dim; col++) {
    const basis: Complex[] = Array.from({ length: dim }, (_, idx) => (idx === col ? c(1) : c(0)));
    let out = basis;

    if (gate.gate === 'SWAP') {
      out = applySWAP(basis, gate.targets[0], gate.targets[1], numQubits);
    } else if (gate.gate === 'iSWAP') {
      out = apply2QubitGate(basis, iSWAP_GATE, gate.targets[0], gate.targets[1], numQubits);
    } else if (gate.gate === 'XX') {
      out = apply2QubitGate(basis, XX(gate.params[0] ?? 0), gate.targets[0], gate.targets[1], numQubits);
    } else if (gate.gate === 'YY') {
      out = apply2QubitGate(basis, YY(gate.params[0] ?? 0), gate.targets[0], gate.targets[1], numQubits);
    } else if (gate.gate === 'ZZ') {
      out = apply2QubitGate(basis, ZZ(gate.params[0] ?? 0), gate.targets[0], gate.targets[1], numQubits);
    } else if (gate.gate === 'CCX') {
      out = apply3QubitGate(basis, CCX_GATE, gate.controls[0], gate.controls[1], gate.targets[0], numQubits);
    } else if (gate.gate === 'CNOT') {
      out = applyControlledGate(basis, X_GATE, gate.controls, gate.targets[0], numQubits);
    } else if (gate.gate === 'CZ') {
      out = applyControlledGate(basis, Z_GATE, gate.controls, gate.targets[0], numQubits);
    } else {
      const mat = getMatrix(gate.gate, gate.params);
      out = gate.controls.length > 0
        ? applyControlledGate(basis, mat, gate.controls, gate.targets[0], numQubits)
        : applySingleQubitGate(basis, mat, gate.targets[0], numQubits);
    }

    for (let row = 0; row < dim; row++) {
      op[row][col] = out[row];
    }
  }

  gateOperatorCache.set(gateKey, op);
  return op;
};

const applyUnitaryToDensity = (rho: ComplexMatrix, U: ComplexMatrix): ComplexMatrix => {
  const Ud = matrixDagger(U);
  return matrixMul(matrixMul(U, rho), Ud);
};

const applyKrausChannel = (rho: ComplexMatrix, krausOps: ComplexMatrix[]): ComplexMatrix => {
  const dim = rho.length;
  let acc = zeroMatrix(dim);
  for (const k of krausOps) {
    const kd = matrixDagger(k);
    const term = matrixMul(matrixMul(k, rho), kd);
    acc = matrixAddScaled(acc, term, 1);
  }
  return acc;
};

const densityToProbabilities = (rho: ComplexMatrix): number[] => {
  const dim = rho.length;
  const probs = Array(dim).fill(0);
  let sum = 0;
  for (let i = 0; i < dim; i++) {
    const p = Math.max(0, rho[i][i].re);
    probs[i] = p;
    sum += p;
  }
  if (sum <= 1e-15) return probs;
  return probs.map((p) => p / sum);
};

const traceDensity = (rho: ComplexMatrix): number => {
  let sum = 0;
  for (let i = 0; i < rho.length; i++) {
    sum += rho[i][i].re;
  }
  return sum;
};

const addDensityMatrices = (a: ComplexMatrix, b: ComplexMatrix): ComplexMatrix => {
  const dim = a.length;
  const out = zeroMatrix(dim);
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      out[i][j] = cAdd(a[i][j], b[i][j]);
    }
  }
  return out;
};

const applyReadoutErrorToProbabilities = (probs: number[], numQubits: number, err: number): number[] => {
  if (err <= 0) return probs;
  let current = probs.slice();
  const dim = 1 << numQubits;
  for (let q = 0; q < numQubits; q++) {
    const mask = 1 << q;
    const next = Array(dim).fill(0);
    for (let i = 0; i < dim; i++) {
      const p = current[i];
      if (p <= 0) continue;
      next[i] += p * (1 - err);
      next[i ^ mask] += p * err;
    }
    current = next;
  }
  return current;
};

const applyNoiseChannelsToDensity = (
  initialRho: ComplexMatrix,
  numQubits: number,
  noise: NoiseConfig,
  activeArityPerQubit: ActiveArityPerQubit,
): ComplexMatrix => {
  let rho = initialRho;
  const dim = 1 << numQubits;

  const t1 = Math.max(0, noise.t1Microseconds);
  const t2 = Math.max(0, noise.t2Microseconds);

  const clampProb = (v: number): number => Math.max(0, Math.min(1, v));

  for (let q = 0; q < numQubits; q++) {
    const arity = activeArityPerQubit[q] ?? 0;
    const isActive = arity > 0;
    const isTwoQOrMore = arity >= 2;

    if (isActive) {
      const depProb = clampProb(isTwoQOrMore ? noise.depolarizing2q : noise.depolarizing1q);
      if (depProb > 0) {
        const I = buildSingleQubitOperator(numQubits, q, I_GATE);
        const X = buildSingleQubitOperator(numQubits, q, X_GATE);
        const Y = buildSingleQubitOperator(numQubits, q, Y_GATE);
        const Z = buildSingleQubitOperator(numQubits, q, Z_GATE);

        const termI = applyUnitaryToDensity(rho, I);
        const termX = applyUnitaryToDensity(rho, X);
        const termY = applyUnitaryToDensity(rho, Y);
        const termZ = applyUnitaryToDensity(rho, Z);

        let mixed = zeroMatrix(dim);
        mixed = matrixAddScaled(mixed, termI, 1 - depProb);
        mixed = matrixAddScaled(mixed, termX, depProb / 3);
        mixed = matrixAddScaled(mixed, termY, depProb / 3);
        mixed = matrixAddScaled(mixed, termZ, depProb / 3);
        rho = mixed;
      }

      if (noise.amplitudeDamping > 0) {
        const gamma = clampProb(noise.amplitudeDamping);
        const K0: Matrix2 = [c(1), c(0), c(0), c(Math.sqrt(1 - gamma))];
        const K1: Matrix2 = [c(0), c(Math.sqrt(gamma)), c(0), c(0)];
        const opK0 = buildSingleQubitOperator(numQubits, q, K0);
        const opK1 = buildSingleQubitOperator(numQubits, q, K1);
        rho = applyKrausChannel(rho, [opK0, opK1]);
      }

      if (noise.bitFlip > 0) {
        const p = clampProb(noise.bitFlip);
        const I = buildSingleQubitOperator(numQubits, q, I_GATE);
        const X = buildSingleQubitOperator(numQubits, q, X_GATE);
        const termI = applyUnitaryToDensity(rho, I);
        const termX = applyUnitaryToDensity(rho, X);
        let mixed = zeroMatrix(dim);
        mixed = matrixAddScaled(mixed, termI, 1 - p);
        mixed = matrixAddScaled(mixed, termX, p);
        rho = mixed;
      }

      if (noise.phaseFlip > 0) {
        const p = clampProb(noise.phaseFlip);
        const I = buildSingleQubitOperator(numQubits, q, I_GATE);
        const Z = buildSingleQubitOperator(numQubits, q, Z_GATE);
        const termI = applyUnitaryToDensity(rho, I);
        const termZ = applyUnitaryToDensity(rho, Z);
        let mixed = zeroMatrix(dim);
        mixed = matrixAddScaled(mixed, termI, 1 - p);
        mixed = matrixAddScaled(mixed, termZ, p);
        rho = mixed;
      }
    }

    const dtNs = isTwoQOrMore
      ? Math.max(1, noise.gateTime2qNs)
      : (isActive ? Math.max(1, noise.gateTime1qNs) : Math.max(1, noise.idleTimeNs));
    const dtUs = dtNs / 1000;

    if (t1 > 0) {
      const gammaT1 = clampProb(1 - Math.exp(-dtUs / t1));
      if (gammaT1 > 0) {
        const K0: Matrix2 = [c(1), c(0), c(0), c(Math.sqrt(1 - gammaT1))];
        const K1: Matrix2 = [c(0), c(Math.sqrt(gammaT1)), c(0), c(0)];
        const opK0 = buildSingleQubitOperator(numQubits, q, K0);
        const opK1 = buildSingleQubitOperator(numQubits, q, K1);
        rho = applyKrausChannel(rho, [opK0, opK1]);
      }
    }

    if (t2 > 0) {
      let invTphi = 1 / t2;
      if (t1 > 0) {
        invTphi = invTphi - (1 / (2 * t1));
      }
      if (invTphi > 0) {
        const lambdaPhi = Math.exp(-dtUs * invTphi);
        const pPhi = clampProb((1 - lambdaPhi) / 2);
        if (pPhi > 0) {
          const I = buildSingleQubitOperator(numQubits, q, I_GATE);
          const Z = buildSingleQubitOperator(numQubits, q, Z_GATE);
          const termI = applyUnitaryToDensity(rho, I);
          const termZ = applyUnitaryToDensity(rho, Z);
          let mixed = zeroMatrix(dim);
          mixed = matrixAddScaled(mixed, termI, 1 - pPhi);
          mixed = matrixAddScaled(mixed, termZ, pPhi);
          rho = mixed;
        }
      }
    }
  }

  return rho;
};

const buildMeasurementProbabilitiesFromDensity = (
  initialRho: ComplexMatrix,
  numQubits: number,
  measurementBasis?: MeasurementBasisAxis[],
  readoutError = 0,
): number[] => {
  let rho = initialRho;

  if (measurementBasis && measurementBasis.length > 0) {
    for (let q = 0; q < numQubits; q++) {
      const axis = measurementBasis[q] ?? 'Z';
      if (axis === 'Z') continue;

      const SQRT1_2 = Math.SQRT1_2;
      const Ux: Matrix2 = [c(SQRT1_2, 0), c(SQRT1_2, 0), c(SQRT1_2, 0), c(-SQRT1_2, 0)];
      const Uy: Matrix2 = [c(SQRT1_2, 0), c(0, -SQRT1_2), c(SQRT1_2, 0), c(0, SQRT1_2)];
      const U = axis === 'X' ? Ux : Uy;
      const fullU = buildSingleQubitOperator(numQubits, q, U);
      rho = applyUnitaryToDensity(rho, fullU);
    }
  }

  let probs = densityToProbabilities(rho);
  probs = applyReadoutErrorToProbabilities(probs, numQubits, readoutError);
  return sanitizeProbabilities(probs);
};

const evolveCircuitDensityWithClassicalBranches = (
  circuit: CircuitState,
  plan: CompiledCircuitPlan,
  initialState: Complex[],
  noise?: NoiseConfig,
): ComplexMatrix => {
  const dim = 1 << circuit.numQubits;
  const rho0 = densityMatrixFromPureState(initialState);
  let branches: ClassicalBranch[] = [{ rho: rho0, classicalBits: new Map<number, number>() }];

  for (let col = 0; col < circuit.numColumns; col++) {
    const colGates = plan.columns[col] ?? [];
    const nextColumnBranches: ClassicalBranch[] = [];

    for (const baseBranch of branches) {
      type WorkingBranch = ClassicalBranch & { activeArity: ActiveArityPerQubit };
      let working: WorkingBranch[] = [{
        rho: baseBranch.rho,
        classicalBits: new Map(baseBranch.classicalBits),
        activeArity: Array(circuit.numQubits).fill(0),
      }];

      for (const gate of colGates) {
        if (gate.gate === 'Barrier') continue;
        const step: WorkingBranch[] = [];

        for (const w of working) {
          if (gate.condition !== undefined && w.classicalBits.get(gate.condition) !== 1) {
            step.push(w);
            continue;
          }

          if (gate.gate === 'M') {
            const target = gate.targets[0];
            const P0 = buildSingleQubitProjector(circuit.numQubits, target, 0);
            const P1 = buildSingleQubitProjector(circuit.numQubits, target, 1);
            const rho0Branch = matrixMul(matrixMul(P0, w.rho), P0);
            const rho1Branch = matrixMul(matrixMul(P1, w.rho), P1);

            if (gate.classicalBit === undefined) {
              step.push({
                rho: addDensityMatrices(rho0Branch, rho1Branch),
                classicalBits: new Map(w.classicalBits),
                activeArity: [...w.activeArity],
              });
              continue;
            }

            const tr0 = traceDensity(rho0Branch);
            const tr1 = traceDensity(rho1Branch);

            if (tr0 > 1e-15) {
              const cb0 = new Map(w.classicalBits);
              cb0.set(gate.classicalBit, 0);
              step.push({ rho: rho0Branch, classicalBits: cb0, activeArity: [...w.activeArity] });
            }
            if (tr1 > 1e-15) {
              const cb1 = new Map(w.classicalBits);
              cb1.set(gate.classicalBit, 1);
              step.push({ rho: rho1Branch, classicalBits: cb1, activeArity: [...w.activeArity] });
            }
            continue;
          }

          const U = buildGateOperator(gate, circuit.numQubits);
          if (!U) {
            step.push(w);
            continue;
          }

          const acted = [...gate.targets, ...gate.controls];
          const arity = acted.length >= 2 ? 2 : 1;
          const nextActive = [...w.activeArity];
          for (const q of acted) {
            nextActive[q] = Math.max(nextActive[q], arity);
          }

          step.push({
            rho: applyUnitaryToDensity(w.rho, U),
            classicalBits: new Map(w.classicalBits),
            activeArity: nextActive,
          });
        }

        working = step;
      }

      for (const w of working) {
        const rho = noise && noise.enabled
          ? applyNoiseChannelsToDensity(w.rho, circuit.numQubits, noise, w.activeArity)
          : w.rho;
        nextColumnBranches.push({ rho, classicalBits: w.classicalBits });
      }
    }

    branches = nextColumnBranches;
    if (branches.length === 0) {
      branches = [{ rho: zeroMatrix(dim), classicalBits: new Map<number, number>() }];
    }
  }

  let merged = zeroMatrix(dim);
  for (const branch of branches) {
    merged = addDensityMatrices(merged, branch.rho);
  }
  return merged;
};

const sampleIndexFromState = (state: Complex[], numQubits: number, rand: () => number): number => {
  const dim = 1 << numQubits;
  let total = 0;
  for (let i = 0; i < dim; i++) {
    const a = state[i];
    total += a.re * a.re + a.im * a.im;
  }

  if (total <= 1e-15) return dim - 1;

  const threshold = rand() * total;
  let cumulative = 0;
  for (let i = 0; i < dim; i++) {
    const a = state[i];
    cumulative += a.re * a.re + a.im * a.im;
    if (cumulative >= threshold) return i;
  }

  return dim - 1;
};

const buildCircuitSignature = (circuit: CircuitState): string => {
  const gates = [...circuit.gates]
    .sort((a, b) => (a.column - b.column) || a.id.localeCompare(b.id))
    .map((g) => `${g.gate}@${g.column}:t${g.targets.join(',')}:c${g.controls.join(',')}:p${g.params.join(',')}:m${g.classicalBit ?? ''}:if${g.condition ?? ''}`)
    .join(';');
  return `${circuit.numQubits}|${circuit.numColumns}|${gates}`;
};

const compileCircuitPlan = (circuit: CircuitState): CompiledCircuitPlan => {
  const cached = compiledCircuitCache.get(circuit);
  if (cached) return cached;

  const columns = Array.from({ length: circuit.numColumns }, () => [] as PlacedGate[]);
  for (const gate of circuit.gates) {
    if (gate.column < 0 || gate.column >= circuit.numColumns) continue;
    columns[gate.column].push(gate);
  }

  let hasMidMeasure = false;
  let seenMeasurement = false;
  for (let col = 0; col < circuit.numColumns; col++) {
    const colGates = columns[col];
    if (seenMeasurement && colGates.some((g) => g.gate !== 'M' && g.gate !== 'Barrier')) {
      hasMidMeasure = true;
      break;
    }
    if (colGates.some((g) => g.gate === 'M')) {
      seenMeasurement = true;
    }
  }

  const plan: CompiledCircuitPlan = {
    columns,
    hasMidMeasure,
    signature: buildCircuitSignature(circuit),
  };
  compiledCircuitCache.set(circuit, plan);
  return plan;
};

const evolveCircuitFromState = (
  initialState: Complex[],
  circuit: CircuitState,
  plan: CompiledCircuitPlan,
  upToCol?: number,
  skipMeasure = false,
  randomSource?: () => number,
): StepResult => {
  const { numQubits, numColumns } = circuit;
  let state = initialState;
  const cb = new Map<number, number>();
  const maxCol = upToCol ?? numColumns - 1;

  for (let col = 0; col <= maxCol; col++) {
    const colGates = plan.columns[col] ?? [];
    for (const g of colGates) {
      if (g.condition !== undefined && cb.get(g.condition) !== 1) continue;
      if (g.gate === 'Barrier') continue;
      if (g.gate === 'M') {
        if (skipMeasure) continue;
        const r = measureQubit(state, g.targets[0], numQubits, undefined, randomSource);
        state = r.state;
        if (g.classicalBit !== undefined) cb.set(g.classicalBit, r.outcome);
        continue;
      }
      if (g.gate === 'SWAP') {
        state = applySWAP(state, g.targets[0], g.targets[1], numQubits);
        continue;
      }
      if (g.gate === 'iSWAP') {
        state = apply2QubitGate(state, iSWAP_GATE, g.targets[0], g.targets[1], numQubits);
        continue;
      }
      if (g.gate === 'XX') {
        state = apply2QubitGate(state, XX(g.params[0] ?? 0), g.targets[0], g.targets[1], numQubits);
        continue;
      }
      if (g.gate === 'YY') {
        state = apply2QubitGate(state, YY(g.params[0] ?? 0), g.targets[0], g.targets[1], numQubits);
        continue;
      }
      if (g.gate === 'ZZ') {
        state = apply2QubitGate(state, ZZ(g.params[0] ?? 0), g.targets[0], g.targets[1], numQubits);
        continue;
      }
      if (g.gate === 'CCX') {
        state = apply3QubitGate(state, CCX_GATE, g.controls[0], g.controls[1], g.targets[0], numQubits);
        continue;
      }
      if (g.gate === 'CNOT') {
        state = applyControlledGate(state, X_GATE, g.controls, g.targets[0], numQubits);
        continue;
      }
      if (g.gate === 'CZ') {
        state = applyControlledGate(state, Z_GATE, g.controls, g.targets[0], numQubits);
        continue;
      }
      const mat = getMatrix(g.gate, g.params);
      state = g.controls.length > 0
        ? applyControlledGate(state, mat, g.controls, g.targets[0], numQubits)
        : applySingleQubitGate(state, mat, g.targets[0], numQubits);
    }
  }

  return { state, classicalBits: cb };
};

export const runCircuit = (
  circuit: CircuitState, upToCol?: number, skipMeasure = false, initialState?: Complex[], randomSource?: () => number,
): StepResult => {
  const plan = compileCircuitPlan(circuit);

  if (!skipMeasure) {
    return evolveCircuitFromState(initialState ?? initZeroState(circuit.numQubits), circuit, plan, upToCol, skipMeasure, randomSource);
  }

  const key = `${plan.signature}#${upToCol ?? 'all'}#${skipMeasure ? 'skip' : 'full'}#${stateSignature(initialState)}`;
  const cached = runCache.get(key);
  if (cached) return cloneStepResult(cached);

  const result = evolveCircuitFromState(initialState ?? initZeroState(circuit.numQubits), circuit, plan, upToCol, skipMeasure, randomSource);
  runCache.set(key, cloneStepResult(result));
  if (runCache.size > RUN_CACHE_LIMIT) {
    const oldest = runCache.keys().next().value;
    if (oldest) runCache.delete(oldest);
  }
  return result;
};

export const runWithShots = (
  circuit: CircuitState,
  shots: number,
  initialState?: Complex[],
  measurementBasis?: MeasurementBasisAxis[],
  options?: ShotSamplingOptions,
): Map<string, number> => {
  const { numQubits } = circuit;
  const plan = compileCircuitPlan(circuit);
  const hist = new Map<string, number>();
  const rand = createRandomSource(options?.seed);

  if (!plan.hasMidMeasure) {
    const { state } = runCircuit(circuit, undefined, true, initialState);
    const measuredState = rotateStateForMeasurementBasis(state, numQubits, measurementBasis);
    const probs = measuredState.map((a) => a.re * a.re + a.im * a.im);
    const sampleIndex = createAliasSampler(probs);
    for (let s = 0; s < shots; s++) {
      const idx = sampleIndex(rand);
      const k = idx.toString(2).padStart(numQubits, '0');
      hist.set(k, (hist.get(k) || 0) + 1);
    }
  } else {
    for (let s = 0; s < shots; s++) {
      const { state } = runCircuit(circuit, undefined, false, initialState, rand);
      const measuredState = rotateStateForMeasurementBasis(state, numQubits, measurementBasis);
      const idx = sampleIndexFromState(measuredState, numQubits, rand);
      const k = idx.toString(2).padStart(numQubits, '0');
      hist.set(k, (hist.get(k) || 0) + 1);
    }
  }
  return hist;
};

export const runWithNoiseShots = (
  circuit: CircuitState,
  shots: number,
  noise: NoiseConfig,
  initialState?: Complex[],
  measurementBasis?: MeasurementBasisAxis[],
  options?: ShotSamplingOptions,
): Map<string, number> => {
  const { numQubits } = circuit;
  const plan = compileCircuitPlan(circuit);
  const hist = new Map<string, number>();
  const rand = createRandomSource(options?.seed);

  if (!noise.enabled) return runWithShots(circuit, shots, initialState, measurementBasis, options);

  const initial = initialState ?? initZeroState(numQubits);
  const branchMixedRho = evolveCircuitDensityWithClassicalBranches(circuit, plan, initial, noise);
  const probs = buildMeasurementProbabilitiesFromDensity(branchMixedRho, numQubits, measurementBasis, noise.readoutError);
  const sampleIndex = createAliasSampler(probs);

  for (let s = 0; s < shots; s++) {
    const idx = sampleIndex(rand);
    const key = idx.toString(2).padStart(numQubits, '0');
    hist.set(key, (hist.get(key) || 0) + 1);
  }

  return hist;
};

export const computeUnitary = (
  circuit: CircuitState,
  maxQubits: number = CIRCUIT_CONSTRAINTS.MAX_QUBITS,
): Complex[][] | null => {
  if (circuit.numQubits > maxQubits) return null;
  const dim = 1 << circuit.numQubits;
  const cols: Complex[][] = [];

  const circNoMeasure: CircuitState = {
    ...circuit,
    gates: circuit.gates.filter(g => g.gate !== 'M' && g.gate !== 'Barrier'),
  };
  const noMeasurePlan = compileCircuitPlan(circNoMeasure);

  for (let j = 0; j < dim; j++) {
    const basis: Complex[] = Array(dim).fill(null).map(() => c(0));
    basis[j] = c(1);
    cols.push(evolveCircuitFromState(basis, circNoMeasure, noMeasurePlan, undefined, true).state);
  }

  return Array.from({ length: dim }, (_, i) =>
    Array.from({ length: dim }, (_, j) => cols[j][i])
  );
};

export const computeUnitary2Q = (circuit: CircuitState): Complex[][] | null => computeUnitary(circuit, 2);