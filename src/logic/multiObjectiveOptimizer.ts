import type { CircuitState } from './circuitTypes';
import type { Complex } from './complex';
import { cAbs2 } from './complex';
import { runCircuit } from './circuitRunner';

export interface MultiObjectiveConfig {
  gateId: string;
  basisBits: string;
  start: number;
  end: number;
  steps: number;
  weightProbability: number;
  weightDepth: number;
  weightTwoQ: number;
}

export interface MultiObjectivePoint {
  theta: number;
  probability: number;
  depthPenalty: number;
  twoQPenalty: number;
  score: number;
}

export interface MultiObjectiveResult {
  bestTheta: number;
  bestScore: number;
  trace: MultiObjectivePoint[];
}

const depthOf = (circuit: CircuitState): number => {
  if (circuit.gates.length === 0) return 0;
  return Math.max(...circuit.gates.map((g) => g.column)) + 1;
};

const twoQCount = (circuit: CircuitState): number =>
  circuit.gates.filter((g) => g.targets.length + g.controls.length >= 2).length;

export const optimizeMultiObjective = (
  circuit: CircuitState,
  initialState: Complex[],
  config: MultiObjectiveConfig,
): MultiObjectiveResult => {
  const steps = Math.max(4, Math.min(256, Math.round(config.steps)));
  const target = Number.parseInt(config.basisBits || '0', 2) || 0;

  const baseDepth = Math.max(1, depthOf(circuit));
  const baseTwoQ = Math.max(1, twoQCount(circuit));

  let bestTheta = config.start;
  let bestScore = -Infinity;
  const trace: MultiObjectivePoint[] = [];

  for (let i = 0; i < steps; i += 1) {
    const alpha = steps === 1 ? 0 : i / (steps - 1);
    const theta = config.start + (config.end - config.start) * alpha;

    const varied: CircuitState = {
      ...circuit,
      gates: circuit.gates.map((g) => (g.id === config.gateId ? { ...g, params: [theta] } : g)),
    };

    const sim = runCircuit(varied, undefined, true, initialState).state;
    const probability = cAbs2(sim[target] ?? sim[0]);
    const depthPenalty = depthOf(varied) / baseDepth;
    const twoQPenalty = twoQCount(varied) / baseTwoQ;

    const score =
      config.weightProbability * probability -
      config.weightDepth * depthPenalty -
      config.weightTwoQ * twoQPenalty;

    trace.push({ theta, probability, depthPenalty, twoQPenalty, score });
    if (score > bestScore) {
      bestScore = score;
      bestTheta = theta;
    }
  }

  return { bestTheta, bestScore, trace };
};
