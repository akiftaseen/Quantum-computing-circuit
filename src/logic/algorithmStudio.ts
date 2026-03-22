import type { CircuitState, PlacedGate } from './circuitTypes';
import { runCircuit } from './circuitRunner';
import type { Complex } from './complex';

export interface DeutschJozsaInsight {
  likelyPattern: boolean;
  oracleGateCount: number;
  classicalQueries: number;
  quantumQueries: number;
  verdict: 'constant' | 'balanced' | 'unknown';
}

export interface VQECostPoint {
  step: number;
  scale: number;
  cost: number;
}

export interface VQEInsight {
  paramGateCount: number;
  points: VQECostPoint[];
  bestPoint: VQECostPoint | null;
}

export interface SimonsInsight {
  likelyPattern: boolean;
  uniqueOutcomes: number;
  relationHint: string;
}

export interface AmplificationInsight {
  hadamards: number;
  oracleLikeBlocks: number;
  diffusionLikeBlocks: number;
  estimatedIterations: number;
}

const expectationZZ = (state: Complex[], qA: number, qB: number): number => {
  let sum = 0;
  for (let i = 0; i < state.length; i += 1) {
    const signA = ((i >> qA) & 1) === 0 ? 1 : -1;
    const signB = ((i >> qB) & 1) === 0 ? 1 : -1;
    const prob = state[i].re * state[i].re + state[i].im * state[i].im;
    sum += signA * signB * prob;
  }
  return sum;
};

const mapWithScaledParams = (gates: PlacedGate[], scale: number): PlacedGate[] => {
  return gates.map((g) => {
    if (!['Rx', 'Ry', 'Rz', 'P', 'XX', 'YY', 'ZZ'].includes(g.gate)) return g;
    return { ...g, params: g.params.map((p) => p * scale) };
  });
};

export const analyzeDeutschJozsa = (
  circuit: CircuitState,
  shots: Map<string, number> | null,
): DeutschJozsaInsight => {
  const nInput = Math.max(1, circuit.numQubits - 1);
  const xOnAncilla = circuit.gates.some((g) => g.gate === 'X' && g.targets.includes(circuit.numQubits - 1));
  const hLayer = circuit.gates.filter((g) => g.gate === 'H').length;
  const oracleGateCount = circuit.gates.filter((g) => ['CNOT', 'CZ', 'CCX'].includes(g.gate)).length;
  const likelyPattern = xOnAncilla && hLayer >= circuit.numQubits;

  let verdict: DeutschJozsaInsight['verdict'] = 'unknown';
  if (shots && shots.size > 0) {
    const best = Array.from(shots.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (best) {
      const inputBits = best.slice(0, nInput);
      verdict = /^0+$/.test(inputBits) ? 'constant' : 'balanced';
    }
  }

  return {
    likelyPattern,
    oracleGateCount,
    classicalQueries: 2 ** (nInput - 1) + 1,
    quantumQueries: 1,
    verdict,
  };
};

export const analyzeVQETracker = (circuit: CircuitState): VQEInsight => {
  const paramGateCount = circuit.gates.filter((g) => ['Rx', 'Ry', 'Rz', 'P', 'XX', 'YY', 'ZZ'].includes(g.gate)).length;
  if (paramGateCount === 0 || circuit.numQubits < 2) {
    return { paramGateCount, points: [], bestPoint: null };
  }

  const scales = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
  const points = scales.map((scale, idx) => {
    const probe: CircuitState = {
      ...circuit,
      gates: mapWithScaledParams(circuit.gates, scale),
    };
    const state = runCircuit(probe, undefined, true).state;
    // Toy Hamiltonian H = Z0Z1 (sufficient to visualize optimization trend)
    const cost = expectationZZ(state, 0, 1);
    return { step: idx, scale, cost };
  });

  const bestPoint = points.reduce((best, cur) => (cur.cost < best.cost ? cur : best), points[0]);
  return { paramGateCount, points, bestPoint };
};

export const analyzeSimonsPattern = (
  circuit: CircuitState,
  shots: Map<string, number> | null,
): SimonsInsight => {
  const hCount = circuit.gates.filter((g) => g.gate === 'H').length;
  const twoQCount = circuit.gates.filter((g) => ['CNOT', 'CZ'].includes(g.gate)).length;
  const likelyPattern = circuit.numQubits >= 4 && hCount >= circuit.numQubits && twoQCount >= 2;

  const uniqueOutcomes = shots ? shots.size : 0;
  let relationHint = 'Collect more shots to infer xor constraints.';
  if (shots && shots.size > 0) {
    const ranked = Array.from(shots.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const overlapZeros = ranked[0]?.[0]
      ? ranked
          .map(([bits]) => bits)
          .reduce((acc, bits) => acc.split('').map((ch, i) => (ch === bits[i] ? ch : 'x')).join(''))
      : '';
    relationHint = overlapZeros.includes('x')
      ? `Top outcomes suggest linear constraints pattern: ${overlapZeros.replace(/x/g, '*')}`
      : `Top outcomes align strongly to ${overlapZeros}; check if oracle is near-constant.`;
  }

  return {
    likelyPattern,
    uniqueOutcomes,
    relationHint,
  };
};

export const analyzeAmplitudeAmplification = (circuit: CircuitState): AmplificationInsight => {
  const hadamards = circuit.gates.filter((g) => g.gate === 'H').length;
  const oracleLikeBlocks = circuit.gates.filter((g) => g.gate === 'CCX' || (g.gate === 'CZ' && g.controls.length > 0)).length;
  const diffusionLikeBlocks = Math.max(
    0,
    Math.min(
      circuit.gates.filter((g) => g.gate === 'X').length,
      circuit.gates.filter((g) => g.gate === 'H').length,
    ) - 1,
  );

  const estimatedIterations = Math.max(1, Math.min(6, Math.round(oracleLikeBlocks / 2)));

  return {
    hadamards,
    oracleLikeBlocks,
    diffusionLikeBlocks,
    estimatedIterations,
  };
};
