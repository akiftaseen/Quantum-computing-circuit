import type { CircuitState } from './circuitTypes';
import type { Complex } from './complex';
import { cAbs2 } from './complex';
import { runCircuit } from './circuitRunner';

export interface Assignment {
  id: string;
  title: string;
  objective: string;
  rubric: string[];
}

export interface AssignmentEvaluation {
  passed: boolean;
  score: number;
  feedback: string[];
}

export const ASSIGNMENTS: Assignment[] = [
  {
    id: 'bell-state',
    title: 'Build a Bell Pair',
    objective: 'Create a circuit that puts most probability mass on |00> and |11>.',
    rubric: ['>= 0.9 total in |00> + |11>', '<= 0.1 leakage to |01>, |10>'],
  },
  {
    id: 'ghz-3',
    title: 'Build GHZ(3)',
    objective: 'For 3 qubits, concentrate amplitude on |000> and |111>.',
    rubric: ['>= 0.85 total in |000> + |111>', 'balanced branch probabilities'],
  },
  {
    id: 'x-basis-ready',
    title: 'Prepare X-ready State',
    objective: 'For qubit 0, produce near-equal computational outcomes (proxy for |+>).',
    rubric: ['q0 marginal ~ 0.5/0.5'],
  },
];

const prob = (state: Complex[], idx: number): number => cAbs2(state[idx] ?? state[0]);

export const evaluateAssignment = (
  assignmentId: string,
  circuit: CircuitState,
  initialState: Complex[],
): AssignmentEvaluation => {
  const state = runCircuit(circuit, undefined, true, initialState).state;
  const n = circuit.numQubits;

  if (assignmentId === 'bell-state' && n >= 2) {
    const p00 = prob(state, 0);
    const p11 = prob(state, 3);
    const score = Math.max(0, Math.min(1, p00 + p11));
    return {
      passed: score >= 0.9,
      score,
      feedback: [`p00=${p00.toFixed(3)}`, `p11=${p11.toFixed(3)}`, `target>=0.900`],
    };
  }

  if (assignmentId === 'ghz-3' && n >= 3) {
    const p000 = prob(state, 0);
    const p111 = prob(state, 7);
    const score = Math.max(0, Math.min(1, p000 + p111));
    return {
      passed: score >= 0.85,
      score,
      feedback: [`p000=${p000.toFixed(3)}`, `p111=${p111.toFixed(3)}`, `target>=0.850`],
    };
  }

  if (assignmentId === 'x-basis-ready' && n >= 1) {
    let p0 = 0;
    let p1 = 0;
    for (let i = 0; i < state.length; i += 1) {
      const b0 = i & 1;
      if (b0 === 0) p0 += cAbs2(state[i]);
      else p1 += cAbs2(state[i]);
    }
    const score = Math.max(0, 1 - Math.abs(p0 - p1));
    return {
      passed: score >= 0.9,
      score,
      feedback: [`p(q0=0)=${p0.toFixed(3)}`, `p(q0=1)=${p1.toFixed(3)}`, 'want close to 0.5/0.5'],
    };
  }

  return {
    passed: false,
    score: 0,
    feedback: ['Assignment not applicable for current qubit count.'],
  };
};
