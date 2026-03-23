import type { Complex } from './complex';
import type { CircuitState } from './circuitTypes';
import { cAbs2 } from './complex';
import { parseCircuitMacro } from './circuitMacro';
import { runCircuit } from './circuitRunner';

export interface BenchmarkSuite {
  id: string;
  title: string;
  description: string;
  macro: string;
  threshold: number;
  targetBasis: string[];
}

export interface BenchmarkResult {
  suiteId: string;
  passed: boolean;
  score: number;
  details: string[];
  circuit: CircuitState;
}

export const BENCHMARK_SUITES: BenchmarkSuite[] = [
  {
    id: 'bell-baseline',
    title: 'Bell Baseline',
    description: 'Checks concentration in |00> and |11> for a 2Q Bell pair.',
    macro: 'H(0);\nCNOT(0,1)',
    threshold: 0.9,
    targetBasis: ['00', '11'],
  },
  {
    id: 'ghz-3-baseline',
    title: 'GHZ-3 Baseline',
    description: 'Checks concentration in |000> and |111> for 3Q GHZ.',
    macro: 'H(0);\nCNOT(0,1);\nCNOT(1,2)',
    threshold: 0.85,
    targetBasis: ['000', '111'],
  },
  {
    id: 'plus-state-baseline',
    title: 'Plus-State Baseline',
    description: 'Checks near-uniform over all basis states after H on every qubit.',
    macro: 'H(0);\nH(1);\nH(2)',
    threshold: 0.75,
    targetBasis: [],
  },
];

const uniformityScore = (state: Complex[]): number => {
  const dim = state.length;
  const expected = 1 / dim;
  const err = state.reduce((sum, amp) => sum + Math.abs(cAbs2(amp) - expected), 0);
  return Math.max(0, 1 - 0.5 * err);
};

export const runBenchmarkSuite = (
  suite: BenchmarkSuite,
  fallbackQubits: number,
  initialState: Complex[],
): BenchmarkResult => {
  const parsed = parseCircuitMacro(suite.macro, fallbackQubits);
  if (!parsed.valid) {
    return {
      suiteId: suite.id,
      passed: false,
      score: 0,
      details: [`Suite macro invalid: ${parsed.message}`],
      circuit: parsed.circuit,
    };
  }

  const sim = runCircuit(parsed.circuit, undefined, true, initialState).state;
  let score = 0;
  const details: string[] = [];

  if (suite.targetBasis.length > 0) {
    for (const bits of suite.targetBasis) {
      const idx = Number.parseInt(bits, 2);
      const p = cAbs2(sim[idx] ?? sim[0]);
      score += p;
      details.push(`${bits}: ${p.toFixed(4)}`);
    }
  } else {
    score = uniformityScore(sim);
    details.push(`uniformity score: ${score.toFixed(4)}`);
  }

  return {
    suiteId: suite.id,
    passed: score >= suite.threshold,
    score,
    details: [...details, `threshold: ${suite.threshold.toFixed(2)}`],
    circuit: parsed.circuit,
  };
};
