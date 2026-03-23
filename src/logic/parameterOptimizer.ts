import type { CircuitState } from './circuitTypes';
import { runCircuit } from './circuitRunner';
import { cAbs2 } from './complex';
import { evaluateSingleObservable } from './observableLab';
import type { Complex } from './complex';

export type OptimizerObjective =
  | { kind: 'probability'; basisBits: string }
  | { kind: 'observable'; expr: string };

export interface OptimizerResult {
  bestTheta: number;
  bestValue: number;
  trace: Array<{ step: number; theta: number; value: number }>;
}

const metricForState = (state: Complex[], objective: OptimizerObjective, numQubits: number): number => {
  if (objective.kind === 'probability') {
    const idx = Number.parseInt(objective.basisBits || '0', 2);
    const safe = Number.isFinite(idx) ? idx : 0;
    return cAbs2(state[safe] ?? state[0]);
  }
  const row = evaluateSingleObservable(objective.expr, numQubits, state);
  return row.valid && row.value !== null ? row.value : -Infinity;
};

export const optimizeSingleParameter = (
  circuit: CircuitState,
  gateId: string,
  initialState: Complex[],
  objective: OptimizerObjective,
  start: number,
  end: number,
  steps: number,
): OptimizerResult => {
  const nSteps = Math.max(4, Math.min(256, Math.round(steps)));
  const trace: Array<{ step: number; theta: number; value: number }> = [];

  let bestTheta = start;
  let bestValue = -Infinity;

  for (let i = 0; i < nSteps; i += 1) {
    const t = nSteps === 1 ? start : start + ((end - start) * i) / (nSteps - 1);
    const varied: CircuitState = {
      ...circuit,
      gates: circuit.gates.map((g) => (g.id === gateId ? { ...g, params: [t] } : g)),
    };
    const sim = runCircuit(varied, undefined, true, initialState).state;
    const value = metricForState(sim, objective, circuit.numQubits);
    trace.push({ step: i, theta: t, value });
    if (value > bestValue) {
      bestValue = value;
      bestTheta = t;
    }
  }

  return {
    bestTheta,
    bestValue,
    trace,
  };
};
