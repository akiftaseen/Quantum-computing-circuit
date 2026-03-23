import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Complex } from '../logic/complex';
import { cAbs2 } from '../logic/complex';
import type { BasisAxis } from '../logic/observableLab';
import { computeBasisDistribution, evaluateObservableExpressions, evaluateSingleObservable } from '../logic/observableLab';
import type { CircuitState } from '../logic/circuitTypes';
import { isParametric } from '../logic/circuitTypes';
import { computeUnitary, runCircuit, runWithNoiseShots, runWithShots } from '../logic/circuitRunner';
import { getStatevectorTemplateExpression, type StatevectorTemplateKind } from '../logic/initialQubitState';
import { parseCircuitMacro } from '../logic/circuitMacro';
import { suggestStatePrepMacro } from '../logic/reverseEngineering';
import { analyzeOpenQasmInterop, parseOpenQasmLite } from '../logic/openqasmLite';
import {
  exportOpenQasm2,
  generateRandomCircuit,
  isCliffordLikeCircuit,
  transpileLikePresetReport,
  type TranspileLevel,
} from '../logic/qiskitOss';
import { getBlochVector, partialTrace } from '../logic/simulator';
import type { NoiseConfig } from '../logic/noiseModel';
import type { MeasurementBasisAxis } from '../logic/measurementBasis';
import { applySymbolBindings, type SymbolBinding } from '../logic/symbolBindings';
import { diffCircuits } from '../logic/circuitDiff';
import { optimizeSingleParameter } from '../logic/parameterOptimizer';
import { ASSIGNMENTS, evaluateAssignment } from '../logic/classroomMode';
import { histogramToProbArray, klDivergence, stateFidelity, traceDistanceApprox } from '../logic/stateMetrics';
import { HARDWARE_PROFILES, evaluateCircuitAgainstHardware, type HardwareProfile } from '../logic/hardwareProfiles';
import { buildLiveTranspileHints } from '../logic/transpileHints';
import { findCorrelatedQubitPairs } from '../logic/entanglementAnalysis';
import { routeCircuitForHardware, type HardwareLayoutReport } from '../logic/hardwareLayout';
import { BENCHMARK_SUITES, runBenchmarkSuite, type BenchmarkResult } from '../logic/benchmarkSuites';
import { runQasmRoundTrip, type QasmRoundTripReport } from '../logic/qasmRoundTrip';
import { fitNoiseModelFromHistogram, parseHistogramText, type CalibrationResult } from '../logic/noiseCalibration';
import { optimizeMultiObjective, type MultiObjectivePoint } from '../logic/multiObjectiveOptimizer';

interface Props {
  state: Complex[];
  numQubits: number;
  circuit: CircuitState;
  initialState: Complex[];
  noise: NoiseConfig;
  numShots: number;
  shotsBasisAxes: MeasurementBasisAxis[];
  symbolBindings: SymbolBinding[];
  performanceMode: boolean;
  onSetPerformanceMode: (enabled: boolean) => void;
  onSetSymbolBindings: React.Dispatch<React.SetStateAction<SymbolBinding[]>>;
  onApplyShotsConfig: (config: { numShots: number; noise: NoiseConfig; shotsBasisAxes: MeasurementBasisAxis[] }) => void;
  onApplyMacroCircuit: (circuit: CircuitState) => void;
  onApplyStatevectorExpression: (expr: string) => void;
  onApplyQubitExpressions: (exprs: string[]) => void;
}

const makeDefaultObservableInput = (numQubits: number): string => {
  const lines = ['Z0'];
  if (numQubits > 1) {
    lines.push('X0*X1');
    lines.push('Z0*Z1');
  }
  if (numQubits > 2) {
    lines.push('Y0*Y1*Y2');
  }
  return lines.join('\n');
};

const formatComplexExpr = (re: number, im: number): string => {
  const r = re.toFixed(6);
  const i = Math.abs(im).toFixed(6);
  return `${r}${im >= 0 ? '+' : '-'}${i}*i`;
};

const compareUnitaryUpToGlobalPhase = (a: Complex[][], b: Complex[][]): { equal: boolean; maxDelta: number } => {
  if (a.length !== b.length || a[0]?.length !== b[0]?.length) return { equal: false, maxDelta: Number.POSITIVE_INFINITY };
  const dim = a.length;

  let refA: Complex | null = null;
  let refB: Complex | null = null;
  for (let i = 0; i < dim; i += 1) {
    for (let j = 0; j < dim; j += 1) {
      const za = a[i][j];
      const zb = b[i][j];
      if (!refA && (Math.abs(za.re) > 1e-10 || Math.abs(za.im) > 1e-10) && (Math.abs(zb.re) > 1e-10 || Math.abs(zb.im) > 1e-10)) {
        refA = za;
        refB = zb;
      }
    }
  }
  if (!refA || !refB) return { equal: true, maxDelta: 0 };

  const phaseA = Math.atan2(refA.im, refA.re);
  const phaseB = Math.atan2(refB.im, refB.re);
  const dphi = phaseA - phaseB;
  const cos = Math.cos(dphi);
  const sin = Math.sin(dphi);

  let maxDelta = 0;
  for (let i = 0; i < dim; i += 1) {
    for (let j = 0; j < dim; j += 1) {
      const zb = b[i][j];
      const rb = { re: zb.re * cos - zb.im * sin, im: zb.re * sin + zb.im * cos };
      const da = a[i][j].re - rb.re;
      const db = a[i][j].im - rb.im;
      const err = Math.hypot(da, db);
      maxDelta = Math.max(maxDelta, err);
    }
  }

  return { equal: maxDelta < 1e-6, maxDelta };
};

const ALGORITHMS: Array<{ name: string; summary: string; macro: string; steps: string[] }> = [
  {
    name: 'Bell Pair',
    summary: 'Create a maximally entangled 2-qubit state.',
    macro: 'H(0);\nCNOT(0,1)',
    steps: ['Apply H on q0', 'Entangle q1 using CNOT(0,1)', 'Expect 50/50 on |00⟩ and |11⟩'],
  },
  {
    name: 'GHZ (3 qubits)',
    summary: 'Generate long-range entanglement.',
    macro: 'H(0);\nCNOT(0,1);\nCNOT(1,2)',
    steps: ['Create superposition on q0', 'Spread entanglement to q1', 'Spread entanglement to q2'],
  },
  {
    name: 'QFT-lite (3 qubits)',
    summary: 'Approximate QFT sequence for education.',
    macro: 'H(0);\nCNOT(0,1);\nRz(1,pi/2);\nCNOT(0,1);\nH(1);\nCNOT(1,2);\nRz(2,pi/2);\nCNOT(1,2);\nH(2)',
    steps: ['Apply layered Hadamards', 'Inject controlled phases', 'Observe basis redistribution'],
  },
];

const FEATURE_RELATED_TERMS: Record<string, string[]> = {
  'Symbolic Parameters': ['variables', 'symbols', 'constants', 'expressions'],
  'Hardware Profile Presets': ['backend', 'native gates', 'connectivity', 'coupling map'],
  'Live Transpilation Hints': ['optimize', 'optimization', 'cancellation', 'merge', 'depth'],
  'Entanglement Map Visualization': ['correlation', 'pairwise', 'heatmap', 'entangled'],
  'Batch Experiment Runner': ['batch', 'queue', 'jobs', 'sweep runs'],
  'Hardware-Aware Auto-Layout Pass': ['routing', 'swap insertion', 'layout', 'mapping'],
  'Golden Test Harness': ['regression', 'assertions', 'checks', 'pass fail'],
  'Preset Benchmark Suites': ['benchmark', 'baseline', 'performance checks'],
  'OpenQASM Round-Trip Verifier': ['qasm', 'roundtrip', 'import export', 'equivalence'],
  'Noise Calibration Fitting': ['calibration', 'fit', 'kl divergence', 'noise model'],
  'Multi-Objective Optimizer': ['tradeoff', 'objective', 'weights', 'score'],
  'Qiskit OSS Toolkit (Free Local Features)': ['qiskit', 'transpile', 'openqasm', 'random circuit'],
  'Parameter Optimizer (VQE-style Grid Search)': ['vqe', 'theta tuning', 'grid search', 'optimize parameter'],
  'Noise Sweep Dashboard': ['depolarizing', 'damping', 'bit flip', 'phase flip', 'readout error'],
  'Fidelity and Distance Metrics': ['trace distance', 'fidelity', 'kl', 'tv distance'],
  'Stabilizer Fast Path': ['clifford', 'stabilizer', 'fast simulation'],
  'Session and Project Save Packs': ['save', 'load', 'packs', 'project state'],
  'Classroom and Assignment Mode': ['rubric', 'grading', 'education', 'assignment'],
  'Observable Expectations': ['pauli', 'expectation value', 'operators', 'measurements'],
  'State Preparation Wizard (Rz(phi)Ry(theta)|0⟩)': ['initial state', 'theta', 'phi', 'bloch sphere'],
  'Initial-State Template Library': ['templates', 'ghz', 'bell', 'w state', 'haar'],
  'Parametric Sweep Studio': ['scan', 'sweep', 'curve', 'parameter scan'],
  'Measurement Basis Simulator': ['x basis', 'y basis', 'z basis', 'measurement axes'],
  'Tomography Mode (Synthetic Shots)': ['tomography', 'reconstruction', 'synthetic shots'],
  'Circuit Profiler': ['runtime', 'performance', 'cost', 'profiling'],
  'Circuit Expression Macros': ['macro language', 'dsl', 'repeat syntax'],
  'Circuit Equivalence Checker': ['equivalent', 'global phase', 'compare circuits'],
  'Algorithm Gallery Walkthrough': ['guided', 'tutorial', 'bell', 'ghz', 'qft'],
  'Reverse Engineering Assistant': ['state prep suggestion', 'inverse', 'derive circuit'],
  'Export and Import Tools': ['json', 'qasm', 'download', 'upload'],
  'Multi-Run Experiment Manager': ['compare runs', 'experiment history', 'saved runs'],
};

const SimulatorLabPanel: React.FC<Props> = ({
  state,
  numQubits,
  circuit,
  initialState,
  noise,
  numShots,
  shotsBasisAxes,
  symbolBindings,
  performanceMode,
  onSetPerformanceMode,
  onSetSymbolBindings,
  onApplyShotsConfig,
  onApplyMacroCircuit,
  onApplyStatevectorExpression,
  onApplyQubitExpressions,
}) => {
  const [observableExpr, setObservableExpr] = useState(() => makeDefaultObservableInput(numQubits));
  const [basisAxes, setBasisAxes] = useState<BasisAxis[]>(() => Array(numQubits).fill('Z'));
  const [macroExpr, setMacroExpr] = useState('repeat(2){H(0); CNOT(0,1)}');
  const [macroMessage, setMacroMessage] = useState('');
  const [reverseTarget, setReverseTarget] = useState('');
  const [reverseMessage, setReverseMessage] = useState('');
  const [reverseMacro, setReverseMacro] = useState('');
  const [wizardTheta, setWizardTheta] = useState<number[]>(() => Array(numQubits).fill(Math.PI / 2));
  const [wizardPhi, setWizardPhi] = useState<number[]>(() => Array(numQubits).fill(0));
  const [sweepGateId, setSweepGateId] = useState<string>('');
  const [sweepStart, setSweepStart] = useState('0');
  const [sweepEnd, setSweepEnd] = useState('pi');
  const [sweepSteps, setSweepSteps] = useState('16');
  const [sweepMetric, setSweepMetric] = useState<'prob' | 'obs'>('prob');
  const [sweepBasis, setSweepBasis] = useState(() => '0'.repeat(numQubits));
  const [sweepObservable, setSweepObservable] = useState('Z0');
  const [equivExpr, setEquivExpr] = useState('H(0);\nCNOT(0,1)');
  const [equivResult, setEquivResult] = useState('');
  const [compareBasis, setCompareBasis] = useState(() => '0'.repeat(numQubits));
  const [importExpr, setImportExpr] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [activeAlgorithm, setActiveAlgorithm] = useState(ALGORITHMS[0]?.name ?? '');
  const [tomoQubit, setTomoQubit] = useState('0');
  const [tomoPair, setTomoPair] = useState('0,1');
  const [tomoShots, setTomoShots] = useState('1024');
  const [tomoFidelity, setTomoFidelity] = useState<number | null>(null);
  const [tomoIdeal, setTomoIdeal] = useState<Complex[] | null>(null);
  const [tomoReconstructed, setTomoReconstructed] = useState<Complex[] | null>(null);
  const [heatmapMode, setHeatmapMode] = useState<'magnitude' | 'phase'>('magnitude');
  const [tomoResult, setTomoResult] = useState<{
    x: number;
    y: number;
    z: number;
    p00?: number;
    p11?: number;
    cxx?: number;
    cyy?: number;
    czz?: number;
  } | null>(null);
  const [transpileLevel, setTranspileLevel] = useState<TranspileLevel>(1);
  const [transpileMessage, setTranspileMessage] = useState('');
  const [randomDepth, setRandomDepth] = useState('18');
  const [randomSeed, setRandomSeed] = useState('7');
  const [qasmPreview, setQasmPreview] = useState('');
  const [qasmInteropMessage, setQasmInteropMessage] = useState('');
  const [qasmInteropSuggestions, setQasmInteropSuggestions] = useState<string[]>([]);
  const [diffExpr, setDiffExpr] = useState('H(0);\nCNOT(0,1)');
  const [diffSummaryText, setDiffSummaryText] = useState('');
  const [optimizerGateId, setOptimizerGateId] = useState('');
  const [optimizerObjective, setOptimizerObjective] = useState<'prob' | 'obs'>('prob');
  const [optimizerBasis, setOptimizerBasis] = useState(() => '0'.repeat(numQubits));
  const [optimizerObservable, setOptimizerObservable] = useState('Z0');
  const [optimizerStart, setOptimizerStart] = useState('-pi');
  const [optimizerEnd, setOptimizerEnd] = useState('pi');
  const [optimizerSteps, setOptimizerSteps] = useState('24');
  const [optimizerData, setOptimizerData] = useState<Array<{ step: number; theta: number; value: number }>>([]);
  const [optimizerMessage, setOptimizerMessage] = useState('');
  const [noiseSweepParam, setNoiseSweepParam] = useState<'depolarizing1q' | 'amplitudeDamping' | 'readoutError' | 'bitFlip' | 'phaseFlip'>('depolarizing1q');
  const [noiseSweepStart, setNoiseSweepStart] = useState('0');
  const [noiseSweepEnd, setNoiseSweepEnd] = useState('0.12');
  const [noiseSweepSteps, setNoiseSweepSteps] = useState('12');
  const [noiseSweepBasis, setNoiseSweepBasis] = useState(() => '0'.repeat(numQubits));
  const [noiseSweepData, setNoiseSweepData] = useState<Array<{ noise: number; value: number }>>([]);
  const [savePackName, setSavePackName] = useState('pack-1');
  const [savedPacks, setSavedPacks] = useState<Array<{ id: string; name: string; createdAt: number; circuit: CircuitState; symbols: SymbolBinding[]; shots: { numShots: number; noise: NoiseConfig; basis: MeasurementBasisAxis[] }; notes: string }>>([]);
  const [savePackNotes, setSavePackNotes] = useState('');
  const [selectedPackId, setSelectedPackId] = useState('');
  const [assignmentId, setAssignmentId] = useState(ASSIGNMENTS[0]?.id ?? '');
  const [assignmentFeedback, setAssignmentFeedback] = useState('');
  const [assignmentScore, setAssignmentScore] = useState<number | null>(null);
  const [profilerLimit, setProfilerLimit] = useState('40');
  const [experimentName, setExperimentName] = useState('experiment-1');
  const [savedExperiments, setSavedExperiments] = useState<Array<{
    id: string;
    name: string;
    createdAt: number;
    data: Array<{ theta: number; value: number }>;
    numShots: number;
    noise: NoiseConfig;
    basis: MeasurementBasisAxis[];
  }>>([]);
  const [selectedExperimentIds, setSelectedExperimentIds] = useState<string[]>([]);
  const [hardwareProfileId, setHardwareProfileId] = useState(HARDWARE_PROFILES[0]?.id ?? 'all-to-all-ideal');
  const [entanglementPair, setEntanglementPair] = useState('0,1');
  const [batchSweepParam, setBatchSweepParam] = useState<'theta' | 'depolarizing1q' | 'amplitudeDamping' | 'bitFlip' | 'phaseFlip' | 'readoutError'>('depolarizing1q');
  const [batchStart, setBatchStart] = useState('0');
  const [batchEnd, setBatchEnd] = useState('0.12');
  const [batchSteps, setBatchSteps] = useState('8');
  const [batchTargetBasis, setBatchTargetBasis] = useState(() => '0'.repeat(numQubits));
  const [batchRunnerMessage, setBatchRunnerMessage] = useState('');
  const [batchRunnerProgress, setBatchRunnerProgress] = useState(0);
  const [batchRunnerRunning, setBatchRunnerRunning] = useState(false);
  const [batchRunnerRows, setBatchRunnerRows] = useState<Array<{ job: string; parameter: number; successRate: number; fidelity: number; runtimeMs: number }>>([]);
  const [layoutReport, setLayoutReport] = useState<HardwareLayoutReport | null>(null);
  const [goldenSpec, setGoldenSpec] = useState('prob|00|>=|0.45\nprob|11|>=|0.45\nobs|Z0*Z1|>=|0.8');
  const [goldenResults, setGoldenResults] = useState<Array<{ ok: boolean; text: string }>>([]);
  const [benchmarkSuiteId, setBenchmarkSuiteId] = useState(BENCHMARK_SUITES[0]?.id ?? 'bell-baseline');
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [roundTripReport, setRoundTripReport] = useState<QasmRoundTripReport | null>(null);
  const [observedHistogramInput, setObservedHistogramInput] = useState('00: 520\n11: 504');
  const [calibrationResult, setCalibrationResult] = useState<CalibrationResult | null>(null);
  const [multiObjectiveGateId, setMultiObjectiveGateId] = useState('');
  const [multiObjectiveBasis, setMultiObjectiveBasis] = useState(() => '0'.repeat(numQubits));
  const [multiObjectiveStart, setMultiObjectiveStart] = useState('-pi');
  const [multiObjectiveEnd, setMultiObjectiveEnd] = useState('pi');
  const [multiObjectiveSteps, setMultiObjectiveSteps] = useState('24');
  const [weightProbability, setWeightProbability] = useState('1.0');
  const [weightDepth, setWeightDepth] = useState('0.08');
  const [weightTwoQ, setWeightTwoQ] = useState('0.12');
  const [multiObjectiveTrace, setMultiObjectiveTrace] = useState<MultiObjectivePoint[]>([]);
  const [multiObjectiveMessage, setMultiObjectiveMessage] = useState('');
  const [assignmentPackName, setAssignmentPackName] = useState('classroom-pack-1');
  const [featureQuery, setFeatureQuery] = useState('');
  const [visibleFeatureCount, setVisibleFeatureCount] = useState(0);
  const observableInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('qc-sim-experiments-v1');
      if (!raw) return;
      const parsed = JSON.parse(raw) as Array<{
        id: string;
        name: string;
        createdAt: number;
        data: Array<{ theta: number; value: number }>;
        numShots: number;
        noise: NoiseConfig;
        basis: MeasurementBasisAxis[];
      }>;
      if (Array.isArray(parsed)) setSavedExperiments(parsed);
    } catch {
      // Ignore malformed persisted experiments.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('qc-sim-experiments-v1', JSON.stringify(savedExperiments));
    } catch {
      // Ignore localStorage write failures.
    }
  }, [savedExperiments]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('qc-sim-packs-v1');
      if (!raw) return;
      const parsed = JSON.parse(raw) as Array<{
        id: string;
        name: string;
        createdAt: number;
        circuit: CircuitState;
        symbols: SymbolBinding[];
        shots: { numShots: number; noise: NoiseConfig; basis: MeasurementBasisAxis[] };
        notes: string;
      }>;
      if (Array.isArray(parsed)) setSavedPacks(parsed);
    } catch {
      // Ignore malformed save packs.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('qc-sim-packs-v1', JSON.stringify(savedPacks));
    } catch {
      // Ignore localStorage write failures.
    }
  }, [savedPacks]);

  useEffect(() => {
    setBasisAxes((prev) => {
      if (prev.length === numQubits) return prev;
      if (prev.length > numQubits) return prev.slice(0, numQubits);
      return [...prev, ...Array(numQubits - prev.length).fill('Z')];
    });

    setWizardTheta((prev) => {
      if (prev.length === numQubits) return prev;
      if (prev.length > numQubits) return prev.slice(0, numQubits);
      return [...prev, ...Array(numQubits - prev.length).fill(Math.PI / 2)];
    });

    setWizardPhi((prev) => {
      if (prev.length === numQubits) return prev;
      if (prev.length > numQubits) return prev.slice(0, numQubits);
      return [...prev, ...Array(numQubits - prev.length).fill(0)];
    });

    setSweepBasis((prev) => {
      if (prev.length === numQubits) return prev;
      return '0'.repeat(numQubits);
    });

    setCompareBasis((prev) => {
      if (prev.length === numQubits) return prev;
      return '0'.repeat(numQubits);
    });

    setBatchTargetBasis((prev) => {
      if (prev.length === numQubits) return prev;
      return '0'.repeat(numQubits);
    });

    setEntanglementPair((prev) => {
      const parts = prev.split(',').map((x) => Number(x.trim()));
      const a = Number.isInteger(parts[0]) ? Math.max(0, Math.min(numQubits - 1, parts[0])) : 0;
      const b = Number.isInteger(parts[1]) ? Math.max(0, Math.min(numQubits - 1, parts[1])) : Math.min(1, numQubits - 1);
      return `${a},${b}`;
    });

    setMultiObjectiveBasis((prev) => {
      if (prev.length === numQubits) return prev;
      return '0'.repeat(numQubits);
    });
  }, [numQubits]);

  const parametricGates = useMemo(() => circuit.gates.filter((g) => isParametric(g.gate)), [circuit.gates]);

  useEffect(() => {
    if (parametricGates.length === 0) {
      setOptimizerGateId('');
      return;
    }
    if (!parametricGates.some((g) => g.id === optimizerGateId)) {
      setOptimizerGateId(parametricGates[0].id);
    }
  }, [parametricGates, optimizerGateId]);

  useEffect(() => {
    if (parametricGates.length === 0) {
      setSweepGateId('');
      return;
    }
    if (!parametricGates.some((g) => g.id === sweepGateId)) {
      setSweepGateId(parametricGates[0].id);
    }
  }, [parametricGates, sweepGateId]);

  useEffect(() => {
    if (parametricGates.length === 0) {
      setMultiObjectiveGateId('');
      return;
    }
    if (!parametricGates.some((g) => g.id === multiObjectiveGateId)) {
      setMultiObjectiveGateId(parametricGates[0].id);
    }
  }, [parametricGates, multiObjectiveGateId]);

  const profilerRows = useMemo(() => {
    const limit = Math.max(4, Math.min(circuit.numColumns, Math.round(Number(profilerLimit) || 40)));
    const rows: Array<{ col: number; gates: number; runtimeMs: number; ampCount: number; costScore: number }> = [];

    for (let col = 0; col < limit; col += 1) {
      const t0 = performance.now();
      runCircuit(circuit, col, true, initialState);
      const runtimeMs = performance.now() - t0;
      const gates = circuit.gates.filter((g) => g.column === col).length;
      const ampCount = 1 << numQubits;
      const costScore = gates * ampCount;
      rows.push({ col, gates, runtimeMs, ampCount, costScore });
    }

    return rows;
  }, [circuit, initialState, numQubits, profilerLimit]);

  const matrixCellStyle = (z: Complex): React.CSSProperties => {
    const mag = Math.min(1, Math.hypot(z.re, z.im));
    const phase = Math.atan2(z.im, z.re);
    const hue = ((phase + Math.PI) / (2 * Math.PI)) * 360;
    const background = heatmapMode === 'magnitude'
      ? `color-mix(in srgb, var(--primary) ${Math.round(mag * 65)}%, var(--card))`
      : `hsl(${hue.toFixed(0)}deg 70% ${Math.max(18, 78 - mag * 48)}%)`;
    return {
      background,
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '6px 8px',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: heatmapMode === 'magnitude' ? 'var(--text)' : '#fff',
      textAlign: 'center',
    };
  };

  const matrixToText = (z: Complex): string => `${z.re.toFixed(3)}${z.im >= 0 ? '+' : '-'}${Math.abs(z.im).toFixed(3)}i`;

  const qubitFidelityFromDensity = (rho: Complex[], sigma: Complex[]): number => {
    const trRhoSigma =
      rho[0].re * sigma[0].re + rho[0].im * sigma[0].im +
      rho[1].re * sigma[2].re + rho[1].im * sigma[2].im +
      rho[2].re * sigma[1].re + rho[2].im * sigma[1].im +
      rho[3].re * sigma[3].re + rho[3].im * sigma[3].im;
    const detRho = Math.max(0, rho[0].re * rho[3].re - (rho[1].re * rho[2].re - rho[1].im * rho[2].im));
    const detSigma = Math.max(0, sigma[0].re * sigma[3].re - (sigma[1].re * sigma[2].re - sigma[1].im * sigma[2].im));
    return Math.max(0, Math.min(1, trRhoSigma + 2 * Math.sqrt(detRho * detSigma)));
  };

  const evaluations = useMemo(
    () => evaluateObservableExpressions(applySymbolBindings(observableExpr, symbolBindings), numQubits, state),
    [observableExpr, numQubits, state, symbolBindings],
  );

  const basisDist = useMemo(
    () => computeBasisDistribution(state, numQubits, basisAxes),
    [state, numQubits, basisAxes],
  );

  const topOutcomes = basisDist.slice(0, 8);
  const hasObservableErrors = evaluations.some((e) => !e.valid);
  const cliffordStatus = useMemo(() => isCliffordLikeCircuit(circuit), [circuit]);
  const hardwareProfile = useMemo<HardwareProfile>(() => {
    return HARDWARE_PROFILES.find((profile) => profile.id === hardwareProfileId) ?? HARDWARE_PROFILES[0];
  }, [hardwareProfileId]);
  const hardwareReport = useMemo(() => evaluateCircuitAgainstHardware(circuit, hardwareProfile), [circuit, hardwareProfile]);
  const liveTranspileHints = useMemo(() => buildLiveTranspileHints(circuit, hardwareProfile), [circuit, hardwareProfile]);
  const entanglementPairs = useMemo(() => findCorrelatedQubitPairs(state, numQubits), [state, numQubits]);
  const entanglementLookup = useMemo(() => {
    const map = new Map<string, number>();
    for (const pair of entanglementPairs) {
      const [a, b] = pair.pair;
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      map.set(key, pair.strength);
    }
    return map;
  }, [entanglementPairs]);

  const distributionMetrics = useMemo(() => {
    const ideal = runWithShots(circuit, Math.max(256, Math.min(4096, numShots)), initialState, shotsBasisAxes);
    const noisy = runWithNoiseShots(circuit, Math.max(256, Math.min(4096, numShots)), noise, initialState, shotsBasisAxes);
    const p = histogramToProbArray(ideal, numQubits);
    const q = histogramToProbArray(noisy, numQubits);
    return {
      kl: klDivergence(p, q),
      l1: 0.5 * p.reduce((sum, v, i) => sum + Math.abs(v - (q[i] ?? 0)), 0),
      ideal,
      noisy,
    };
  }, [circuit, initialState, noise, numQubits, numShots, shotsBasisAxes]);

  const noisyStateMetrics = useMemo(() => {
    const optimized = transpileLikePresetReport(circuit, 3).circuit;
    const optimizedState = runCircuit(optimized, undefined, true, initialState).state;
    return {
      fidelity: stateFidelity(state, optimizedState),
      traceDistance: traceDistanceApprox(state, optimizedState),
    };
  }, [circuit, initialState, state]);

  const parseAngle = (raw: string, fallback: number): number => {
    const v = raw.trim().toLowerCase();
    if (v === 'pi') return Math.PI;
    if (v === '2*pi' || v === 'tau') return Math.PI * 2;
    if (v === 'pi/2') return Math.PI / 2;
    if (v === '-pi/2') return -Math.PI / 2;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const sweepData = useMemo(() => {
    const gate = parametricGates.find((g) => g.id === sweepGateId);
    if (!gate) return [] as Array<{ theta: number; value: number }>;

    const start = parseAngle(applySymbolBindings(sweepStart, symbolBindings), 0);
    const end = parseAngle(applySymbolBindings(sweepEnd, symbolBindings), Math.PI);
    const stepsCap = performanceMode ? 64 : 200;
    const steps = Math.max(2, Math.min(stepsCap, Math.round(Number(sweepSteps) || 16)));
    const basisIndex = Number.parseInt(sweepBasis || '0', 2);
    const safeBasisIndex = Number.isFinite(basisIndex) ? basisIndex : 0;

    const data: Array<{ theta: number; value: number }> = [];
    for (let i = 0; i < steps; i += 1) {
      const alpha = steps === 1 ? 0 : i / (steps - 1);
      const theta = start + (end - start) * alpha;

      const swept = {
        ...circuit,
        gates: circuit.gates.map((g) =>
          g.id === gate.id ? { ...g, params: [theta] } : g,
        ),
      };
      const sim = runCircuit(swept, undefined, true, initialState).state;

      let value = 0;
      if (sweepMetric === 'prob') {
        const amp = sim[safeBasisIndex] ?? sim[0];
        value = cAbs2(amp);
      } else {
        const evalRow = evaluateSingleObservable(applySymbolBindings(sweepObservable, symbolBindings), numQubits, sim);
        value = evalRow.valid && evalRow.value !== null ? evalRow.value : 0;
      }

      data.push({ theta, value });
    }

    return data;
  }, [
    circuit,
    initialState,
    numQubits,
    parametricGates,
    sweepBasis,
    sweepEnd,
    sweepGateId,
    sweepMetric,
    sweepObservable,
    sweepStart,
    sweepSteps,
    performanceMode,
    symbolBindings,
  ]);

  const experimentCompareData = useMemo(() => {
    const selected = savedExperiments.filter((exp) => selectedExperimentIds.includes(exp.id));
    const maxLen = Math.max(sweepData.length, ...selected.map((exp) => exp.data.length), 0);
    const rows: Array<Record<string, number>> = [];
    for (let i = 0; i < maxLen; i += 1) {
      const row: Record<string, number> = {
        theta: sweepData[i]?.theta ?? selected[0]?.data[i]?.theta ?? i,
        current: sweepData[i]?.value ?? 0,
      };
      for (const exp of selected) {
        row[exp.id] = exp.data[i]?.value ?? 0;
      }
      rows.push(row);
    }
    return rows;
  }, [savedExperiments, selectedExperimentIds, sweepData]);

  const entanglementTrendData = useMemo(() => {
    const rawPair = entanglementPair.split(',').map((x) => Math.round(Number(x.trim())));
    const qA = Number.isInteger(rawPair[0]) ? Math.max(0, Math.min(numQubits - 1, rawPair[0])) : 0;
    const qB = Number.isInteger(rawPair[1]) ? Math.max(0, Math.min(numQubits - 1, rawPair[1])) : Math.min(1, numQubits - 1);
    if (qA === qB) return [] as Array<{ col: number; strength: number }>;

    const limit = Math.max(2, Math.min(circuit.numColumns, performanceMode ? 40 : 100));
    const rows: Array<{ col: number; strength: number }> = [];
    for (let col = 0; col < limit; col += 1) {
      const partial = runCircuit(circuit, col, true, initialState).state;
      const pairs = findCorrelatedQubitPairs(partial, numQubits);
      const entry = pairs.find((pair) => {
        const [a, b] = pair.pair;
        return (a === qA && b === qB) || (a === qB && b === qA);
      });
      rows.push({ col, strength: entry?.strength ?? 0 });
    }
    return rows;
  }, [circuit, entanglementPair, initialState, numQubits, performanceMode]);

  const isFullLabView = true;

  useEffect(() => {
    const q = featureQuery.trim().toLowerCase();
    const queryTokens = q.split(/\s+/).filter(Boolean);
    const cards = Array.from(document.querySelectorAll('.sim-lab-card')) as HTMLElement[];
    let visible = 0;

    cards.forEach((card) => {
      const title = (card.querySelector('.sim-lab-card-title')?.textContent ?? '').trim();
      const noteText = Array.from(card.querySelectorAll('.sim-lab-note'))
        .map((node) => node.textContent ?? '')
        .join(' ')
        .toLowerCase();
      const relatedTerms = (FEATURE_RELATED_TERMS[title] ?? []).join(' ').toLowerCase();
      const searchableText = `${title.toLowerCase()} ${noteText} ${relatedTerms}`;
      const show = queryTokens.length === 0 || queryTokens.every((token) => searchableText.includes(token));
      card.style.display = show ? '' : 'none';
      if (show) visible += 1;
    });

    setVisibleFeatureCount(visible);

    return () => {
      cards.forEach((card) => {
        card.style.display = '';
      });
    };
  }, [featureQuery]);

  const applyWizard = () => {
    const exprs = Array.from({ length: numQubits }, (_, q) => {
      const theta = wizardTheta[q] ?? Math.PI / 2;
      const phi = wizardPhi[q] ?? 0;
      const a = Math.cos(theta / 2);
      const bRe = Math.cos(phi) * Math.sin(theta / 2);
      const bIm = Math.sin(phi) * Math.sin(theta / 2);
      return `${a.toFixed(6)},${formatComplexExpr(bRe, bIm)}`;
    });
    onApplyQubitExpressions(exprs);
  };

  const applyTemplate = (kind: StatevectorTemplateKind) => {
    onApplyStatevectorExpression(getStatevectorTemplateExpression(kind, numQubits));
  };

  const handleApplyMacro = (source: string) => {
    const parsed = parseCircuitMacro(applySymbolBindings(source, symbolBindings), numQubits);
    setMacroMessage(parsed.message);
    if (parsed.valid) onApplyMacroCircuit(parsed.circuit);
  };

  const runReverseEngineer = () => {
    const suggestion = suggestStatePrepMacro(applySymbolBindings(reverseTarget, symbolBindings), numQubits);
    setReverseMessage(suggestion.message);
    setReverseMacro(suggestion.macro);
  };

  const runEquivalenceCheck = () => {
    const candidate = parseCircuitMacro(applySymbolBindings(equivExpr, symbolBindings), numQubits);
    if (!candidate.valid) {
      setEquivResult(`Candidate circuit invalid: ${candidate.message}`);
      return;
    }

    const uA = computeUnitary(circuit, 4);
    const uB = computeUnitary(candidate.circuit, 4);
    if (!uA || !uB) {
      setEquivResult('Equivalence check only supports up to 4 qubits in this mode.');
      return;
    }

    const cmp = compareUnitaryUpToGlobalPhase(uA, uB);
    setEquivResult(cmp.equal ? `Equivalent up to global phase (max Δ ${cmp.maxDelta.toExponential(2)})` : `Not equivalent (max Δ ${cmp.maxDelta.toExponential(2)})`);
  };

  const candidateCircuit = useMemo(() => {
    const parsed = parseCircuitMacro(applySymbolBindings(equivExpr, symbolBindings), numQubits);
    return parsed.valid ? parsed.circuit : null;
  }, [equivExpr, symbolBindings, numQubits]);

  const compareChartData = useMemo(() => {
    if (!candidateCircuit) return [] as Array<{ col: number; current: number; candidate: number; delta: number }>;

    const colMax = Math.max(circuit.numColumns, candidateCircuit.numColumns);
    const limit = Math.min(colMax, performanceMode ? 40 : 90);
    const basisIndex = Number.parseInt(compareBasis || '0', 2);
    const safeBasis = Number.isFinite(basisIndex) ? basisIndex : 0;

    const rows: Array<{ col: number; current: number; candidate: number; delta: number }> = [];
    for (let col = 0; col < limit; col += 1) {
      const cState = runCircuit(circuit, Math.min(col, circuit.numColumns - 1), true, initialState).state;
      const kState = runCircuit(candidateCircuit, Math.min(col, candidateCircuit.numColumns - 1), true, initialState).state;
      const current = cAbs2(cState[safeBasis] ?? cState[0]);
      const candidate = cAbs2(kState[safeBasis] ?? kState[0]);
      rows.push({ col, current, candidate, delta: Math.abs(current - candidate) });
    }
    return rows;
  }, [candidateCircuit, circuit, compareBasis, initialState, performanceMode]);

  const runTomography = () => {
    const q = Math.max(0, Math.min(numQubits - 1, Math.round(Number(tomoQubit) || 0)));
    const shots = Math.max(64, Math.min(100000, Math.round(Number(tomoShots) || 1024)));

    const sampleExpectation = (exact: number): number => {
      const pPlus = Math.max(0, Math.min(1, (1 + exact) / 2));
      let plusCount = 0;
      for (let s = 0; s < shots; s += 1) {
        if (Math.random() < pPlus) plusCount += 1;
      }
      return (2 * plusCount) / shots - 1;
    };

    const [xExact, yExact, zExact] = getBlochVector(state, q, numQubits);
    const x = sampleExpectation(xExact);
    const y = sampleExpectation(yExact);
    const z = sampleExpectation(zExact);

    const reconstructed: Complex[] = [
      { re: (1 + z) / 2, im: 0 },
      { re: x / 2, im: -y / 2 },
      { re: x / 2, im: y / 2 },
      { re: (1 - z) / 2, im: 0 },
    ];

    const [r00, r01, r10, r11] = partialTrace(state, q, numQubits);
    const ideal: Complex[] = [r00, r01, r10, r11];
    const fidelity = qubitFidelityFromDensity(reconstructed, ideal);

    const pair = tomoPair.split(',').map((v) => Math.round(Number(v.trim()))).filter((v) => Number.isInteger(v) && v >= 0 && v < numQubits);
    const [a, b] = pair.length >= 2 ? [pair[0], pair[1]] : [0, Math.min(1, numQubits - 1)];
    const bits = (i: number): [number, number] => [((i >> a) & 1), ((i >> b) & 1)];
    let p00 = 0;
    let p11 = 0;
    for (let i = 0; i < state.length; i += 1) {
      const p = cAbs2(state[i]);
      const [ba, bb] = bits(i);
      if (ba === 0 && bb === 0) p00 += p;
      if (ba === 1 && bb === 1) p11 += p;
    }

    const cxx = sampleExpectation(evaluateSingleObservable(`X${a}*X${b}`, numQubits, state).value ?? 0);
    const cyy = sampleExpectation(evaluateSingleObservable(`Y${a}*Y${b}`, numQubits, state).value ?? 0);
    const czz = sampleExpectation(evaluateSingleObservable(`Z${a}*Z${b}`, numQubits, state).value ?? 0);

    setTomoIdeal(ideal);
    setTomoReconstructed(reconstructed);
    setTomoFidelity(fidelity);
    setTomoResult({ x, y, z, p00, p11, cxx, cyy, czz });
  };

  const downloadText = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCircuitJson = () => {
    downloadText('circuit-export.json', JSON.stringify(circuit, null, 2));
  };

  const exportSweepCsv = () => {
    const lines = ['theta,value', ...sweepData.map((r) => `${r.theta},${r.value}`)];
    downloadText('sweep-export.csv', `${lines.join('\n')}\n`);
  };

  const runImport = () => {
    const raw = importExpr.trim();
    if (!raw) {
      setImportMessage('Import input is empty.');
      return;
    }

    if (/^OPENQASM/i.test(raw) || /qreg\s+q\[/i.test(raw)) {
      const parsed = parseOpenQasmLite(raw, numQubits);
      setImportMessage(parsed.message);
      if (parsed.valid) onApplyMacroCircuit(parsed.circuit);
      return;
    }

    if (raw.startsWith('{')) {
      try {
        const obj = JSON.parse(raw) as CircuitState;
        if (!obj || !Array.isArray(obj.gates) || typeof obj.numQubits !== 'number') {
          setImportMessage('JSON does not match circuit schema.');
          return;
        }
        onApplyMacroCircuit(obj);
        setImportMessage('Circuit JSON imported.');
      } catch {
        setImportMessage('Invalid JSON.');
      }
      return;
    }

    const parsed = parseCircuitMacro(applySymbolBindings(raw, symbolBindings), numQubits);
    setImportMessage(parsed.message);
    if (parsed.valid) onApplyMacroCircuit(parsed.circuit);
  };

  const runQasmInteropAnalysis = () => {
    const report = analyzeOpenQasmInterop(importExpr || qasmPreview);
    setQasmInteropMessage(report.supported ? 'QASM interop check passed for lite mode.' : `${report.warnings.length} warning(s) found.`);
    setQasmInteropSuggestions([...report.warnings, ...report.suggestions]);
  };

  const runTranspilePreset = () => {
    const report = transpileLikePresetReport(circuit, transpileLevel);
    onApplyMacroCircuit(report.circuit);
    setTranspileMessage(
      `Applied optimization level ${transpileLevel}: gates ${report.beforeGateCount} -> ${report.afterGateCount}, depth ${report.beforeDepth} -> ${report.afterDepth}, fused/cancelled ${report.fusedOrCancelled}.`,
    );
  };

  const runRandomCircuit = () => {
    const depth = Math.max(1, Math.min(128, Math.round(Number(randomDepth) || 18)));
    const seed = Math.max(1, Math.min(2147483646, Math.round(Number(randomSeed) || 7)));
    const generated = generateRandomCircuit(numQubits, depth, seed);
    onApplyMacroCircuit(generated);
    setTranspileMessage(`Generated seeded random circuit (depth ${depth}, seed ${seed}) with ${generated.gates.length} gates.`);
  };

  const buildQasmPreview = () => {
    const qasm = exportOpenQasm2(circuit);
    setQasmPreview(qasm);
  };

  const runCircuitDiff = () => {
    const candidate = parseCircuitMacro(applySymbolBindings(diffExpr, symbolBindings), numQubits);
    if (!candidate.valid) {
      setDiffSummaryText(`Candidate invalid: ${candidate.message}`);
      return;
    }
    const diff = diffCircuits(circuit, candidate.circuit);
    setDiffSummaryText(`Changed ${diff.changed}, added ${diff.added}, removed ${diff.removed}, depth delta ${diff.depthDelta}.`);
  };

  const runOptimizer = () => {
    if (!optimizerGateId) {
      setOptimizerMessage('No parametric gate available to optimize.');
      return;
    }

    const objective = optimizerObjective === 'prob'
      ? { kind: 'probability' as const, basisBits: optimizerBasis }
      : { kind: 'observable' as const, expr: optimizerObservable };

    const result = optimizeSingleParameter(
      circuit,
      optimizerGateId,
      initialState,
      objective,
      parseAngle(applySymbolBindings(optimizerStart, symbolBindings), -Math.PI),
      parseAngle(applySymbolBindings(optimizerEnd, symbolBindings), Math.PI),
      Math.max(8, Number(optimizerSteps) || 24),
    );

    setOptimizerData(result.trace);
    setOptimizerMessage(`Best θ=${result.bestTheta.toFixed(5)} with score ${result.bestValue.toFixed(6)}.`);
  };

  const runNoiseSweep = () => {
    const start = Math.max(0, Number(noiseSweepStart) || 0);
    const end = Math.max(0, Number(noiseSweepEnd) || 0.12);
    const steps = Math.max(4, Math.min(50, Math.round(Number(noiseSweepSteps) || 12)));
    const basisIndex = Number.parseInt(noiseSweepBasis || '0', 2);
    const safeBasis = Number.isFinite(basisIndex) ? basisIndex : 0;

    const rows: Array<{ noise: number; value: number }> = [];
    for (let i = 0; i < steps; i += 1) {
      const alpha = steps === 1 ? 0 : i / (steps - 1);
      const p = start + (end - start) * alpha;
      const cfg: NoiseConfig = { ...noise, enabled: true, [noiseSweepParam]: p };
      const hist = runWithNoiseShots(circuit, Math.max(256, Math.min(8192, numShots)), cfg, initialState, shotsBasisAxes);
      const key = safeBasis.toString(2).padStart(numQubits, '0');
      const hit = hist.get(key) ?? 0;
      const total = Array.from(hist.values()).reduce((s, v) => s + v, 0) || 1;
      rows.push({ noise: p, value: hit / total });
    }
    setNoiseSweepData(rows);
  };

  const savePack = () => {
    const id = `pack-${Date.now()}`;
    setSavedPacks((prev) => [
      ...prev,
      {
        id,
        name: savePackName || id,
        createdAt: Date.now(),
        circuit,
        symbols: symbolBindings,
        shots: { numShots, noise, basis: shotsBasisAxes },
        notes: savePackNotes,
      },
    ]);
    setSelectedPackId(id);
  };

  const loadSelectedPack = () => {
    const pack = savedPacks.find((p) => p.id === selectedPackId);
    if (!pack) return;
    onApplyMacroCircuit(pack.circuit);
    onSetSymbolBindings(pack.symbols);
    onApplyShotsConfig({ numShots: pack.shots.numShots, noise: pack.shots.noise, shotsBasisAxes: pack.shots.basis });
  };

  const runAssignmentCheck = () => {
    const result = evaluateAssignment(assignmentId, circuit, initialState);
    setAssignmentScore(result.score);
    setAssignmentFeedback(`${result.passed ? 'Passed' : 'Not passed'}: ${result.feedback.join(' | ')}`);
  };

  const runBatchRunner = async () => {
    const start = parseAngle(applySymbolBindings(batchStart, symbolBindings), 0);
    const end = parseAngle(applySymbolBindings(batchEnd, symbolBindings), 0.12);
    const steps = Math.max(2, Math.min(40, Math.round(Number(batchSteps) || 8)));
    const targetBits = batchTargetBasis.replace(/[^01]/g, '').padEnd(numQubits, '0').slice(0, numQubits);
    const targetIdx = Number.parseInt(targetBits, 2) || 0;
    const thetaGate = parametricGates.find((g) => g.id === sweepGateId || g.id === optimizerGateId) ?? parametricGates[0];

    if (batchSweepParam === 'theta' && !thetaGate) {
      setBatchRunnerMessage('No parametric gate available for theta batch sweep.');
      return;
    }

    const rows: Array<{ job: string; parameter: number; successRate: number; fidelity: number; runtimeMs: number }> = [];
    setBatchRunnerRunning(true);
    setBatchRunnerProgress(0);

    try {
      for (let i = 0; i < steps; i += 1) {
        const alpha = steps === 1 ? 0 : i / (steps - 1);
        const paramValue = start + (end - start) * alpha;
        const t0 = performance.now();

        let variedCircuit = circuit;
        let variedNoise = noise;
        if (batchSweepParam === 'theta' && thetaGate) {
          variedCircuit = {
            ...circuit,
            gates: circuit.gates.map((g) => (g.id === thetaGate.id ? { ...g, params: [paramValue] } : g)),
          };
        } else {
          variedNoise = { ...noise, enabled: true, [batchSweepParam]: Math.max(0, paramValue) };
        }

        const hist = runWithNoiseShots(variedCircuit, Math.max(256, Math.min(8192, numShots)), variedNoise, initialState, shotsBasisAxes);
        const total = Array.from(hist.values()).reduce((sum, val) => sum + val, 0) || 1;
        const success = (hist.get(targetIdx.toString(2).padStart(numQubits, '0')) ?? 0) / total;

        const idealState = runCircuit(circuit, undefined, true, initialState).state;
        const variedState = runCircuit(variedCircuit, undefined, true, initialState).state;
        const fidelity = stateFidelity(idealState, variedState);

        rows.push({
          job: `job-${i + 1}`,
          parameter: paramValue,
          successRate: success,
          fidelity,
          runtimeMs: performance.now() - t0,
        });
        setBatchRunnerProgress((i + 1) / steps);

        if (i % 3 === 2) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    } finally {
      setBatchRunnerRunning(false);
    }

    setBatchRunnerRows(rows);
    const best = [...rows].sort((a, b) => b.successRate - a.successRate)[0];
    if (best) {
      setBatchRunnerMessage(`Completed ${rows.length} jobs. Best success ${(best.successRate * 100).toFixed(2)}% at ${best.parameter.toFixed(5)}.`);
    } else {
      setBatchRunnerMessage('Batch runner finished with no rows.');
    }
  };

  const runAutoLayoutPass = () => {
    const report = routeCircuitForHardware(circuit, hardwareProfile);
    setLayoutReport(report);
  };

  const runGoldenHarness = () => {
    const lines = goldenSpec.split('\n').map((line) => line.trim()).filter(Boolean);
    const sim = runCircuit(circuit, undefined, true, initialState).state;
    const results: Array<{ ok: boolean; text: string }> = [];

    for (const line of lines) {
      const parts = line.split('|').map((x) => x.trim());
      if (parts.length !== 4) {
        results.push({ ok: false, text: `${line} -> invalid format (use kind|target|op|value)` });
        continue;
      }
      const [kind, target, op, rawValue] = parts;
      const expected = Number(rawValue);
      if (!Number.isFinite(expected)) {
        results.push({ ok: false, text: `${line} -> invalid numeric threshold` });
        continue;
      }

      let observed = 0;
      if (kind === 'prob') {
        const idx = Number.parseInt(target, 2);
        observed = cAbs2(sim[idx] ?? sim[0]);
      } else if (kind === 'obs') {
        const row = evaluateSingleObservable(applySymbolBindings(target, symbolBindings), numQubits, sim);
        observed = row.valid && row.value !== null ? row.value : Number.NaN;
      } else {
        results.push({ ok: false, text: `${line} -> unknown kind '${kind}' (use prob or obs)` });
        continue;
      }

      const pass =
        (op === '>=' && observed >= expected) ||
        (op === '<=' && observed <= expected) ||
        (op === '>' && observed > expected) ||
        (op === '<' && observed < expected) ||
        (op === '==' && Math.abs(observed - expected) < 1e-6);

      results.push({
        ok: pass,
        text: `${line} -> observed ${Number.isFinite(observed) ? observed.toFixed(6) : 'NaN'}`,
      });
    }

    setGoldenResults(results);
  };

  const runSelectedBenchmark = () => {
    const suite = BENCHMARK_SUITES.find((s) => s.id === benchmarkSuiteId) ?? BENCHMARK_SUITES[0];
    if (!suite) return;
    const result = runBenchmarkSuite(suite, numQubits, initialState);
    setBenchmarkResult(result);
  };

  const runRoundTripVerifier = () => {
    const report = runQasmRoundTrip(circuit);
    setRoundTripReport(report);
  };

  const runNoiseCalibration = () => {
    const observed = parseHistogramText(observedHistogramInput);
    const fitted = fitNoiseModelFromHistogram(circuit, initialState, observed, shotsBasisAxes, numShots);
    setCalibrationResult(fitted);
  };

  const runMultiObjective = () => {
    if (!multiObjectiveGateId) {
      setMultiObjectiveMessage('No parametric gate available.');
      return;
    }
    const result = optimizeMultiObjective(circuit, initialState, {
      gateId: multiObjectiveGateId,
      basisBits: multiObjectiveBasis,
      start: parseAngle(applySymbolBindings(multiObjectiveStart, symbolBindings), -Math.PI),
      end: parseAngle(applySymbolBindings(multiObjectiveEnd, symbolBindings), Math.PI),
      steps: Math.max(8, Number(multiObjectiveSteps) || 24),
      weightProbability: Math.max(0, Number(weightProbability) || 1),
      weightDepth: Math.max(0, Number(weightDepth) || 0),
      weightTwoQ: Math.max(0, Number(weightTwoQ) || 0),
    });
    setMultiObjectiveTrace(result.trace);
    setMultiObjectiveMessage(`Best θ=${result.bestTheta.toFixed(5)}, score=${result.bestScore.toFixed(6)}.`);
  };

  const exportAssignmentPack = () => {
    const payload = {
      name: assignmentPackName,
      createdAt: Date.now(),
      selectedAssignment: assignmentId,
      assignments: ASSIGNMENTS,
      circuit,
      symbols: symbolBindings,
      shots: { numShots, noise, shotsBasisAxes },
      notes: 'Classroom pack exported from Simulator Lab',
    };
    downloadText(`${assignmentPackName || 'classroom-pack'}.json`, JSON.stringify(payload, null, 2));
  };

  const insertObservableToken = (token: string) => {
    const input = observableInputRef.current;
    if (!input) {
      setObservableExpr((prev) => (prev.trim() ? `${prev}\n${token}` : token));
      return;
    }
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const next = `${input.value.slice(0, start)}${token}${input.value.slice(end)}`;
    setObservableExpr(next);
    const caret = start + token.length;
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="sim-lab-panel">
      <h4 className="sim-lab-title">Simulator Lab</h4>
      <div className="sim-lab-feature-nav">
        <input
          type="search"
          value={featureQuery}
          onChange={(e) => setFeatureQuery(e.target.value)}
          placeholder="Search features..."
          aria-label="Search Simulator Lab features"
        />
        <span className="sim-lab-feature-count">{visibleFeatureCount} tool sections shown</span>
      </div>

      <div className="sim-lab-grid">
        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Symbolic Parameters</div>
          <p className="sim-lab-note">Define symbols once, reuse across observables, sweeps, macros, and reverse engineering.</p>
          <div className="sim-symbol-grid">
            {symbolBindings.map((binding, idx) => (
              <div key={`${binding.name}-${idx}`} className="sim-symbol-row">
                <input
                  value={binding.name}
                  onChange={(e) => onSetSymbolBindings((prev) => prev.map((row, i) => (i === idx ? { ...row, name: e.target.value } : row)))}
                  placeholder="name"
                />
                <input
                  value={binding.value}
                  onChange={(e) => onSetSymbolBindings((prev) => prev.map((row, i) => (i === idx ? { ...row, value: e.target.value } : row)))}
                  placeholder="value (e.g. pi/2)"
                />
                <button type="button" className="btn" onClick={() => onSetSymbolBindings((prev) => prev.filter((_, i) => i !== idx))}>−</button>
              </div>
            ))}
          </div>
          <button type="button" className="btn" onClick={() => onSetSymbolBindings((prev) => [...prev, { name: '', value: '' }])}>Add Symbol</button>
        </section>

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Hardware Profile Presets</div>
          <p className="sim-lab-note">Score your circuit against backend-native gates and coupling constraints.</p>
          <div className="sim-sweep-controls">
            <label>
              Hardware backend
              <select value={hardwareProfileId} onChange={(e) => setHardwareProfileId(e.target.value)}>
                {HARDWARE_PROFILES.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="sim-lab-results-wrap">
            <div className="sim-lab-results-head"><span>Metric</span><span>Value</span></div>
            <div className="sim-lab-row"><span>Compatibility score</span><span>{hardwareReport.compatibilityScore.toFixed(1)} / 100</span></div>
            <div className="sim-lab-row"><span>Unsupported gates</span><span>{hardwareReport.unsupportedTotal}</span></div>
            <div className="sim-lab-row"><span>Coupling violations</span><span>{hardwareReport.edgeViolations}</span></div>
            <div className="sim-lab-row"><span>Estimated SWAP overhead</span><span>{hardwareReport.estimatedSwapOverhead}</span></div>
          </div>
          {Object.keys(hardwareReport.unsupportedGateCounts).length > 0 && (
            <p className="sim-lab-note">
              Non-native: {Object.entries(hardwareReport.unsupportedGateCounts).map(([gate, count]) => `${gate}x${count}`).join(', ')}
            </p>
          )}
          <div className="sim-lab-inline-metrics">
            {hardwareReport.notes.map((note) => <span key={note}>{note}</span>)}
          </div>
        </section>

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Live Transpilation Hints</div>
          <p className="sim-lab-note">Inline optimization and hardware-compat hints while editing the circuit.</p>
          <div className="sim-lab-results-wrap">
            <div className="sim-lab-results-head"><span>Hint</span><span>Severity</span></div>
            {liveTranspileHints.map((hint, idx) => (
              <div key={`${hint.title}-${idx}`} className="sim-lab-row">
                <span><strong>{hint.title}</strong>: {hint.detail}</span>
                <span className={`sim-hint-badge ${hint.severity}`}>{hint.severity}</span>
              </div>
            ))}
          </div>
        </section>

        {isFullLabView && (
        <>
        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Entanglement Map Visualization</div>
          <p className="sim-lab-note">View pairwise connected correlations as a map and track one pair over time.</p>
          <div className="sim-sweep-controls">
            <label>
              Focus pair (a,b)
              <input value={entanglementPair} onChange={(e) => setEntanglementPair(e.target.value)} />
            </label>
          </div>
          <div className="sim-heatmap-matrix">
            <div className="sim-lab-note">Pairwise Strength Heatmap</div>
            <div className="sim-ent-grid" style={{ gridTemplateColumns: `repeat(${numQubits}, minmax(0, 1fr))` }}>
              {Array.from({ length: numQubits }, (_, r) =>
                Array.from({ length: numQubits }, (_, c) => {
                  if (r === c) {
                    return <div key={`ent-${r}-${c}`} className="sim-ent-cell diag">q{r}</div>;
                  }
                  const key = `${Math.min(r, c)}-${Math.max(r, c)}`;
                  const value = entanglementLookup.get(key) ?? 0;
                  const alpha = Math.min(1, value);
                  return (
                    <div
                      key={`ent-${r}-${c}`}
                      className="sim-ent-cell"
                      style={{ background: `color-mix(in srgb, #ef4444 ${Math.round(alpha * 70)}%, var(--card))` }}
                    >
                      {value.toFixed(3)}
                    </div>
                  );
                }),
              )}
            </div>
          </div>
          {entanglementTrendData.length > 0 && (
            <div className="sim-sweep-chart">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={entanglementTrendData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="col" stroke="var(--text-3)" />
                  <YAxis stroke="var(--text-3)" />
                  <Tooltip formatter={(v: number | string | undefined) => Number(v ?? 0).toFixed(6)} />
                  <Line type="monotone" dataKey="strength" stroke="#ef4444" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {entanglementPairs.length > 0 && (
            <div className="sim-lab-inline-metrics">
              <span>Strongest pair: q{entanglementPairs[0].pair[0]}-q{entanglementPairs[0].pair[1]} ({entanglementPairs[0].strength.toFixed(4)})</span>
            </div>
          )}
        </section>

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Batch Experiment Runner</div>
          <p className="sim-lab-note">Queue many parameter/noise jobs and summarize best-performing configurations.</p>
          <div className="sim-sweep-controls">
            <label>
              Sweep parameter
              <select value={batchSweepParam} onChange={(e) => setBatchSweepParam(e.target.value as 'theta' | 'depolarizing1q' | 'amplitudeDamping' | 'bitFlip' | 'phaseFlip' | 'readoutError')}>
                <option value="theta">Gate θ (parametric)</option>
                <option value="depolarizing1q">Depolarizing</option>
                <option value="amplitudeDamping">Amplitude damping</option>
                <option value="bitFlip">Bit flip</option>
                <option value="phaseFlip">Phase flip</option>
                <option value="readoutError">Readout error</option>
              </select>
            </label>
            <label>
              Start
              <input value={batchStart} onChange={(e) => setBatchStart(e.target.value)} />
            </label>
            <label>
              End
              <input value={batchEnd} onChange={(e) => setBatchEnd(e.target.value)} />
            </label>
            <label>
              Jobs
              <input value={batchSteps} onChange={(e) => setBatchSteps(e.target.value)} />
            </label>
            <label>
              Target basis
              <input value={batchTargetBasis} onChange={(e) => setBatchTargetBasis(e.target.value.replace(/[^01]/g, '').slice(0, numQubits))} />
            </label>
          </div>
          <div className="sim-lab-inline-metrics">
            <button type="button" className="btn" onClick={() => void runBatchRunner()} disabled={batchRunnerRunning}>
              {batchRunnerRunning ? 'Running...' : 'Run Batch Jobs'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const exported = batchRunnerRows.map((row) => `${row.job},${row.parameter},${row.successRate},${row.fidelity},${row.runtimeMs}`).join('\n');
                if (!exported) return;
                downloadText('batch-runner-results.csv', `job,parameter,successRate,fidelity,runtimeMs\n${exported}\n`);
              }}
              disabled={batchRunnerRows.length === 0}
            >
              Export Batch CSV
            </button>
            {batchRunnerMessage && <span>{batchRunnerMessage}</span>}
          </div>
          {batchRunnerRunning && (
            <div className="sim-progress-wrap">
              <div className="sim-progress-bar" style={{ width: `${Math.round(batchRunnerProgress * 100)}%` }} />
            </div>
          )}
          {batchRunnerRows.length > 0 && (
            <div className="sim-lab-results-wrap">
              <div className="sim-lab-results-head"><span>Job</span><span>Result</span></div>
              {batchRunnerRows.map((row) => (
                <div key={row.job} className="sim-lab-row">
                  <span>{row.job} ({row.parameter.toFixed(5)})</span>
                  <span>success {(row.successRate * 100).toFixed(2)}%, fid {row.fidelity.toFixed(4)}, {row.runtimeMs.toFixed(2)}ms</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Hardware-Aware Auto-Layout Pass</div>
          <p className="sim-lab-note">Route illegal two-qubit interactions through SWAP chains for the selected backend.</p>
          <div className="sim-lab-inline-metrics">
            <button type="button" className="btn" onClick={runAutoLayoutPass}>Analyze Routing</button>
            <button
              type="button"
              className="btn"
              disabled={!layoutReport}
              onClick={() => {
                if (!layoutReport) return;
                onApplyMacroCircuit(layoutReport.routedCircuit);
              }}
            >
              Apply Routed Circuit
            </button>
          </div>
          {layoutReport && (
            <div className="sim-lab-results-wrap">
              <div className="sim-lab-results-head"><span>Routing Metric</span><span>Value</span></div>
              <div className="sim-lab-row"><span>Inserted SWAP gates</span><span>{layoutReport.swapInserted}</span></div>
              <div className="sim-lab-row"><span>Unroutable gates</span><span>{layoutReport.unroutableGates}</span></div>
              <div className="sim-lab-row"><span>Depth before/after</span><span>{layoutReport.depthBefore} {'->'} {layoutReport.depthAfter}</span></div>
              {layoutReport.notes.map((note, idx) => (
                <div key={`${note}-${idx}`} className="sim-lab-row"><span>Note</span><span>{note}</span></div>
              ))}
            </div>
          )}
        </section>

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Golden Test Harness</div>
          <p className="sim-lab-note">Define expected probabilities/observables and regression-check the current circuit.</p>
          <textarea
            className="sim-lab-textarea"
            value={goldenSpec}
            onChange={(e) => setGoldenSpec(e.target.value)}
            placeholder="prob|00|>=|0.45\nobs|Z0*Z1|>=|0.8"
          />
          <div className="sim-lab-inline-metrics">
            <button type="button" className="btn" onClick={runGoldenHarness}>Run Golden Tests</button>
          </div>
          {goldenResults.length > 0 && (
            <div className="sim-lab-results-wrap">
              <div className="sim-lab-results-head"><span>Expectation</span><span>Status</span></div>
              {goldenResults.map((row, idx) => (
                <div key={`${row.text}-${idx}`} className={`sim-lab-row${row.ok ? '' : ' invalid'}`}>
                  <span>{row.text}</span>
                  <span>{row.ok ? 'PASS' : 'FAIL'}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Preset Benchmark Suites</div>
          <p className="sim-lab-note">Run baseline algorithm suites and compare against expected quality thresholds.</p>
          <div className="sim-sweep-controls">
            <label>
              Suite
              <select value={benchmarkSuiteId} onChange={(e) => setBenchmarkSuiteId(e.target.value)}>
                {BENCHMARK_SUITES.map((suite) => (
                  <option key={suite.id} value={suite.id}>{suite.title}</option>
                ))}
              </select>
            </label>
            <button type="button" className="btn" onClick={runSelectedBenchmark}>Run Suite</button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const suite = BENCHMARK_SUITES.find((s) => s.id === benchmarkSuiteId);
                if (!suite) return;
                const parsed = parseCircuitMacro(applySymbolBindings(suite.macro, symbolBindings), numQubits);
                if (parsed.valid) onApplyMacroCircuit(parsed.circuit);
              }}
            >
              Load Suite Circuit
            </button>
          </div>
          {benchmarkResult && (
            <div className="sim-lab-results-wrap">
              <div className="sim-lab-results-head"><span>Benchmark</span><span>Result</span></div>
              <div className="sim-lab-row"><span>Status</span><span>{benchmarkResult.passed ? 'PASS' : 'FAIL'}</span></div>
              <div className="sim-lab-row"><span>Score</span><span>{benchmarkResult.score.toFixed(4)}</span></div>
              {benchmarkResult.details.map((detail, idx) => (
                <div key={`${detail}-${idx}`} className="sim-lab-row"><span>Detail</span><span>{detail}</span></div>
              ))}
            </div>
          )}
        </section>

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">OpenQASM Round-Trip Verifier</div>
          <p className="sim-lab-note">Export to QASM, re-import, and verify structural equivalence against the source circuit.</p>
          <div className="sim-lab-inline-metrics">
            <button type="button" className="btn" onClick={runRoundTripVerifier}>Run Round-Trip Check</button>
          </div>
          {roundTripReport && (
            <>
              <p className="sim-lab-note">{roundTripReport.message}</p>
              <div className="sim-lab-results-wrap">
                <div className="sim-lab-results-head"><span>Diff Summary</span><span>Count</span></div>
                <div className="sim-lab-row"><span>Changed</span><span>{roundTripReport.diffSummary.changed}</span></div>
                <div className="sim-lab-row"><span>Added</span><span>{roundTripReport.diffSummary.added}</span></div>
                <div className="sim-lab-row"><span>Removed</span><span>{roundTripReport.diffSummary.removed}</span></div>
                <div className="sim-lab-row"><span>Depth delta</span><span>{roundTripReport.diffSummary.depthDelta}</span></div>
              </div>
            </>
          )}
        </section>

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Noise Calibration Fitting</div>
          <p className="sim-lab-note">Fit simulator noise params from observed histogram samples using KL minimization.</p>
          <textarea
            className="sim-lab-textarea"
            value={observedHistogramInput}
            onChange={(e) => setObservedHistogramInput(e.target.value)}
            placeholder="00: 520\n11: 504"
          />
          <div className="sim-lab-inline-metrics">
            <button type="button" className="btn" onClick={runNoiseCalibration}>Fit Noise</button>
            <button
              type="button"
              className="btn"
              disabled={!calibrationResult}
              onClick={() => {
                if (!calibrationResult) return;
                onApplyShotsConfig({ numShots, noise: calibrationResult.bestNoise, shotsBasisAxes });
              }}
            >
              Apply Fitted Noise
            </button>
          </div>
          {calibrationResult && (
            <div className="sim-lab-results-wrap">
              <div className="sim-lab-results-head"><span>Parameter</span><span>Fitted</span></div>
              <div className="sim-lab-row"><span>depolarizing1q</span><span>{calibrationResult.bestNoise.depolarizing1q.toFixed(4)}</span></div>
              <div className="sim-lab-row"><span>amplitudeDamping</span><span>{calibrationResult.bestNoise.amplitudeDamping.toFixed(4)}</span></div>
              <div className="sim-lab-row"><span>bitFlip</span><span>{calibrationResult.bestNoise.bitFlip.toFixed(4)}</span></div>
              <div className="sim-lab-row"><span>phaseFlip</span><span>{calibrationResult.bestNoise.phaseFlip.toFixed(4)}</span></div>
              <div className="sim-lab-row"><span>readoutError</span><span>{calibrationResult.bestNoise.readoutError.toFixed(4)}</span></div>
              <div className="sim-lab-row"><span>KL score / tried</span><span>{calibrationResult.bestScore.toFixed(6)} / {calibrationResult.tried}</span></div>
            </div>
          )}
        </section>

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Multi-Objective Optimizer</div>
          <p className="sim-lab-note">Optimize success probability while penalizing depth and two-qubit cost.</p>
          <div className="sim-sweep-controls">
            <label>
              Parametric gate
              <select value={multiObjectiveGateId} onChange={(e) => setMultiObjectiveGateId(e.target.value)}>
                {parametricGates.map((g) => (
                  <option key={g.id} value={g.id}>{g.gate}@col{g.column}</option>
                ))}
              </select>
            </label>
            <label>
              Basis bits
              <input value={multiObjectiveBasis} onChange={(e) => setMultiObjectiveBasis(e.target.value.replace(/[^01]/g, '').slice(0, numQubits))} />
            </label>
            <label>
              Start
              <input value={multiObjectiveStart} onChange={(e) => setMultiObjectiveStart(e.target.value)} />
            </label>
            <label>
              End
              <input value={multiObjectiveEnd} onChange={(e) => setMultiObjectiveEnd(e.target.value)} />
            </label>
            <label>
              Steps
              <input value={multiObjectiveSteps} onChange={(e) => setMultiObjectiveSteps(e.target.value)} />
            </label>
          </div>
          <div className="sim-sweep-controls">
            <label>
              w(probability)
              <input value={weightProbability} onChange={(e) => setWeightProbability(e.target.value)} />
            </label>
            <label>
              w(depth)
              <input value={weightDepth} onChange={(e) => setWeightDepth(e.target.value)} />
            </label>
            <label>
              w(two-qubit)
              <input value={weightTwoQ} onChange={(e) => setWeightTwoQ(e.target.value)} />
            </label>
            <button type="button" className="btn" onClick={runMultiObjective}>Run Multi-Objective</button>
          </div>
          {multiObjectiveMessage && <p className="sim-lab-note">{multiObjectiveMessage}</p>}
          {multiObjectiveTrace.length > 0 && (
            <div className="sim-sweep-chart">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={multiObjectiveTrace} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="theta" stroke="var(--text-3)" tickFormatter={(v) => Number(v).toFixed(2)} />
                  <YAxis stroke="var(--text-3)" />
                  <Tooltip formatter={(v: number | string | undefined) => Number(v ?? 0).toFixed(6)} />
                  <Line type="monotone" dataKey="score" stroke="#0ea5e9" dot={false} strokeWidth={2} name="score" />
                  <Line type="monotone" dataKey="probability" stroke="#22c55e" dot={false} strokeWidth={1.6} name="probability" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Classroom Assignment Pack Export</div>
          <p className="sim-lab-note">Export reusable instructor/student pack with rubric, circuit, symbols, and shot config.</p>
          <div className="sim-sweep-controls">
            <label>
              Pack name
              <input value={assignmentPackName} onChange={(e) => setAssignmentPackName(e.target.value)} />
            </label>
          </div>
          <div className="sim-lab-inline-metrics">
            <button type="button" className="btn" onClick={exportAssignmentPack}>Export Classroom Pack</button>
          </div>
        </section>
        </>
        )}

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Qiskit OSS Toolkit (Free Local Features)</div>
          <p className="sim-lab-note">Use Qiskit-inspired local tooling: transpile-style optimization levels, seeded random circuits, and OpenQASM 2 export.</p>
          <div className="sim-sweep-controls">
            <label>
              Optimization level
              <select value={String(transpileLevel)} onChange={(e) => setTranspileLevel(Math.max(0, Math.min(3, Number(e.target.value))) as TranspileLevel)}>
                <option value="0">0 (none)</option>
                <option value="1">1 (cancel inverses)</option>
                <option value="2">2 (+ merge rotations)</option>
                <option value="3">3 (+ depth compaction)</option>
              </select>
            </label>
            <button type="button" className="btn" onClick={runTranspilePreset}>Apply Optimization</button>
          </div>

          <div className="sim-sweep-controls">
            <label>
              Random depth
              <input value={randomDepth} onChange={(e) => setRandomDepth(e.target.value)} />
            </label>
            <label>
              Seed
              <input value={randomSeed} onChange={(e) => setRandomSeed(e.target.value)} />
            </label>
            <button type="button" className="btn" onClick={runRandomCircuit}>Generate Random Circuit</button>
          </div>

          <div className="sim-lab-inline-metrics">
            <button type="button" className="btn" onClick={buildQasmPreview}>Build OpenQASM 2.0</button>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const text = qasmPreview || exportOpenQasm2(circuit);
                await navigator.clipboard.writeText(text);
                setQasmPreview(text);
              }}
            >
              Copy QASM
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const text = qasmPreview || exportOpenQasm2(circuit);
                downloadText('circuit.qasm', text);
                setQasmPreview(text);
              }}
            >
              Download .qasm
            </button>
          </div>

          <textarea
            className="sim-lab-textarea"
            value={qasmPreview}
            onChange={(e) => setQasmPreview(e.target.value)}
            placeholder="OPENQASM 2.0 preview appears here"
          />
          {transpileMessage && <p className="sim-lab-note">{transpileMessage}</p>}
        </section>

        {isFullLabView && (
        <>
        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Circuit Diff View</div>
          <p className="sim-lab-note">Compare current circuit against a candidate macro and summarize changes.</p>
          <textarea
            className="sim-lab-textarea"
            value={diffExpr}
            onChange={(e) => setDiffExpr(e.target.value)}
            placeholder="H(0); CNOT(0,1)"
          />
          <div className="sim-lab-inline-metrics">
            <button type="button" className="btn" onClick={runCircuitDiff}>Compute Diff</button>
            {diffSummaryText && <span>{diffSummaryText}</span>}
          </div>
        </section>

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Parameter Optimizer (VQE-style Grid Search)</div>
          <p className="sim-lab-note">Optimize one gate parameter for probability or observable objective.</p>
          <div className="sim-sweep-controls">
            <label>
              Parametric gate
              <select value={optimizerGateId} onChange={(e) => setOptimizerGateId(e.target.value)}>
                {parametricGates.map((g) => (
                  <option key={g.id} value={g.id}>{g.gate}@col{g.column}</option>
                ))}
                {parametricGates.length === 0 && <option value="">No parametric gate</option>}
              </select>
            </label>
            <label>
              Objective
              <select value={optimizerObjective} onChange={(e) => setOptimizerObjective(e.target.value as 'prob' | 'obs')}>
                <option value="prob">Probability</option>
                <option value="obs">Observable</option>
              </select>
            </label>
            {optimizerObjective === 'prob' ? (
              <label>
                Basis bits
                <input value={optimizerBasis} onChange={(e) => setOptimizerBasis(e.target.value.replace(/[^01]/g, '').slice(0, numQubits))} />
              </label>
            ) : (
              <label>
                Observable
                <input value={optimizerObservable} onChange={(e) => setOptimizerObservable(e.target.value)} />
              </label>
            )}
          </div>
          <div className="sim-sweep-controls">
            <label>
              θ start
              <input value={optimizerStart} onChange={(e) => setOptimizerStart(e.target.value)} />
            </label>
            <label>
              θ end
              <input value={optimizerEnd} onChange={(e) => setOptimizerEnd(e.target.value)} />
            </label>
            <label>
              Steps
              <input value={optimizerSteps} onChange={(e) => setOptimizerSteps(e.target.value)} />
            </label>
            <button type="button" className="btn" onClick={runOptimizer}>Run Optimizer</button>
          </div>
          {optimizerMessage && <p className="sim-lab-note">{optimizerMessage}</p>}
          {optimizerData.length > 0 && (
            <div className="sim-sweep-chart">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={optimizerData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="theta" stroke="var(--text-3)" tickFormatter={(v) => Number(v).toFixed(2)} />
                  <YAxis stroke="var(--text-3)" />
                  <Tooltip formatter={(v: number | string | undefined) => Number(v ?? 0).toFixed(6)} />
                  <Line type="monotone" dataKey="value" stroke="var(--primary)" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
        </>
        )}

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Noise Sweep Dashboard</div>
          <p className="sim-lab-note">Sweep one noise parameter and track target basis success probability.</p>
          <div className="sim-sweep-controls">
            <label>
              Noise parameter
              <select value={noiseSweepParam} onChange={(e) => setNoiseSweepParam(e.target.value as 'depolarizing1q' | 'amplitudeDamping' | 'readoutError' | 'bitFlip' | 'phaseFlip')}>
                <option value="depolarizing1q">Depolarizing</option>
                <option value="amplitudeDamping">Amplitude damping</option>
                <option value="bitFlip">Bit flip</option>
                <option value="phaseFlip">Phase flip</option>
                <option value="readoutError">Readout error</option>
              </select>
            </label>
            <label>
              Start
              <input value={noiseSweepStart} onChange={(e) => setNoiseSweepStart(e.target.value)} />
            </label>
            <label>
              End
              <input value={noiseSweepEnd} onChange={(e) => setNoiseSweepEnd(e.target.value)} />
            </label>
            <label>
              Steps
              <input value={noiseSweepSteps} onChange={(e) => setNoiseSweepSteps(e.target.value)} />
            </label>
            <label>
              Basis bits
              <input value={noiseSweepBasis} onChange={(e) => setNoiseSweepBasis(e.target.value.replace(/[^01]/g, '').slice(0, numQubits))} />
            </label>
            <button type="button" className="btn" onClick={runNoiseSweep}>Run Noise Sweep</button>
          </div>
          {noiseSweepData.length > 0 && (
            <div className="sim-sweep-chart">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={noiseSweepData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="noise" stroke="var(--text-3)" tickFormatter={(v) => Number(v).toFixed(3)} />
                  <YAxis stroke="var(--text-3)" />
                  <Tooltip formatter={(v: number | string | undefined) => `${(Number(v ?? 0) * 100).toFixed(2)}%`} />
                  <Line type="monotone" dataKey="value" stroke="#ef4444" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {isFullLabView && (
        <>
        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Fidelity and Distance Metrics</div>
          <p className="sim-lab-note">Compare ideal/noisy and optimized distributions using core quantum metrics.</p>
          <div className="sim-lab-results-wrap">
            <div className="sim-lab-results-head"><span>Metric</span><span>Value</span></div>
            <div className="sim-lab-row"><span>State fidelity (current vs transpiled-L3)</span><span>{noisyStateMetrics.fidelity.toFixed(6)}</span></div>
            <div className="sim-lab-row"><span>Trace distance approx (state probabilities)</span><span>{noisyStateMetrics.traceDistance.toFixed(6)}</span></div>
            <div className="sim-lab-row"><span>KL divergence (ideal shots || noisy shots)</span><span>{distributionMetrics.kl.toFixed(6)}</span></div>
            <div className="sim-lab-row"><span>Total variation distance (ideal vs noisy)</span><span>{distributionMetrics.l1.toFixed(6)}</span></div>
          </div>
        </section>

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Stabilizer Fast Path</div>
          <p className="sim-lab-note">Detect Clifford-like circuits for accelerated sampling paths and educational diagnostics.</p>
          <div className="sim-lab-inline-metrics">
            <span>Status: <strong>{cliffordStatus.isClifford ? 'Eligible' : 'Not eligible'}</strong></span>
            <span>{cliffordStatus.reason}</span>
          </div>
        </section>

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">OpenQASM Interop Diagnostics</div>
          <p className="sim-lab-note">Validate QASM snippets and get decomposition suggestions before import.</p>
          <div className="sim-lab-inline-metrics">
            <button type="button" className="btn" onClick={runQasmInteropAnalysis}>Analyze QASM Interop</button>
            {qasmInteropMessage && <span>{qasmInteropMessage}</span>}
          </div>
          {qasmInteropSuggestions.length > 0 && (
            <div className="sim-lab-results-wrap">
              <div className="sim-lab-results-head"><span>Diagnostics</span><span>Info</span></div>
              {qasmInteropSuggestions.map((msg, idx) => (
                <div key={`${msg}-${idx}`} className="sim-lab-row"><span>{idx + 1}</span><span>{msg}</span></div>
              ))}
            </div>
          )}
        </section>
        </>
        )}

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Session and Project Save Packs</div>
          <p className="sim-lab-note">Bundle circuit, symbols, shots setup, and notes into reusable packs.</p>
          <div className="sim-sweep-controls">
            <label>
              Pack name
              <input value={savePackName} onChange={(e) => setSavePackName(e.target.value)} />
            </label>
            <label>
              Selected pack
              <select value={selectedPackId} onChange={(e) => setSelectedPackId(e.target.value)}>
                <option value="">Select pack</option>
                {savedPacks.map((pack) => (
                  <option key={pack.id} value={pack.id}>{pack.name}</option>
                ))}
              </select>
            </label>
          </div>
          <textarea
            className="sim-lab-textarea"
            value={savePackNotes}
            onChange={(e) => setSavePackNotes(e.target.value)}
            placeholder="Pack notes (goals, expected outcomes, lab context)"
          />
          <div className="sim-lab-inline-metrics">
            <button type="button" className="btn" onClick={savePack}>Save Pack</button>
            <button type="button" className="btn" onClick={loadSelectedPack}>Load Pack</button>
            <button type="button" className="btn" onClick={() => setSavedPacks([])}>Clear Packs</button>
          </div>
        </section>

        {isFullLabView && (
        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Classroom and Assignment Mode</div>
          <p className="sim-lab-note">Run rubric-based checks for educational assignments.</p>
          <div className="sim-sweep-controls">
            <label>
              Assignment
              <select value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)}>
                {ASSIGNMENTS.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>{assignment.title}</option>
                ))}
              </select>
            </label>
            <button type="button" className="btn" onClick={runAssignmentCheck}>Check Assignment</button>
          </div>
          {assignmentScore !== null && (
            <div className="sim-lab-inline-metrics">
              <span>Score: <strong>{assignmentScore.toFixed(3)}</strong></span>
              <span>{assignmentFeedback}</span>
            </div>
          )}
          {ASSIGNMENTS.filter((a) => a.id === assignmentId).map((assignment) => (
            <div key={assignment.id} className="sim-algo-box">
              <strong>{assignment.title}</strong>
              <p className="sim-lab-note">{assignment.objective}</p>
              <div className="sim-lab-inline-metrics">
                {assignment.rubric.map((item) => <span key={item}>• {item}</span>)}
              </div>
            </div>
          ))}
        </section>
        )}

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Observable Expectations</div>
          <p className="sim-lab-note">Enter one observable per line. Examples: Z0, X0*X1, -Y1*Z2</p>
          <textarea
            className="sim-lab-textarea"
            ref={observableInputRef}
            value={observableExpr}
            onChange={(e) => setObservableExpr(e.target.value)}
            placeholder="Z0\nX0*X1"
          />
          <div className="sim-lab-chips">
            {['Z0', 'X0', 'Y0', numQubits > 1 ? 'X0*X1' : null, numQubits > 1 ? 'Z0*Z1' : null, 'I', '-Z0', '*', '\n']
              .filter((x): x is string => Boolean(x))
              .map((token) => (
                <button
                  key={token}
                  type="button"
                  className="sim-lab-chip"
                  onClick={() => insertObservableToken(token === '\n' ? '\n' : token)}
                >
                  {token === '\n' ? 'newline' : token}
                </button>
              ))}
          </div>

          <div className="sim-lab-results-wrap">
            <div className="sim-lab-results-head">
              <span>Observable</span>
              <span>⟨O⟩</span>
            </div>
            {evaluations.map((entry, idx) => (
              <div key={`${entry.raw}-${idx}`} className={`sim-lab-row${entry.valid ? '' : ' invalid'}`}>
                <span>{entry.normalized || entry.raw}</span>
                <span>{entry.valid && entry.value !== null ? entry.value.toFixed(6) : entry.message}</span>
              </div>
            ))}
          </div>
          {hasObservableErrors && (
            <p className="sim-lab-error-note">Fix invalid rows to get complete expectation analysis.</p>
          )}
        </section>

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">State Preparation Wizard (Rz(phi)Ry(theta)|0⟩)</div>
          <p className="sim-lab-note">Adjust theta and phi for each qubit, then push to per-qubit initialization.</p>
          <div className="sim-wizard-grid">
            {Array.from({ length: numQubits }, (_, q) => (
              <div key={q} className="sim-wizard-item">
                <strong>q{q}</strong>
                <label>
                  θ
                  <input
                    type="range"
                    min={0}
                    max={Math.PI}
                    step={0.01}
                    value={wizardTheta[q] ?? Math.PI / 2}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setWizardTheta((prev) => {
                        const next = [...prev];
                        next[q] = v;
                        return next;
                      });
                    }}
                  />
                </label>
                <label>
                  φ
                  <input
                    type="range"
                    min={-Math.PI}
                    max={Math.PI}
                    step={0.01}
                    value={wizardPhi[q] ?? 0}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setWizardPhi((prev) => {
                        const next = [...prev];
                        next[q] = v;
                        return next;
                      });
                    }}
                  />
                </label>
                <span>θ={(wizardTheta[q] ?? 0).toFixed(2)} rad, φ={(wizardPhi[q] ?? 0).toFixed(2)} rad</span>
              </div>
            ))}
          </div>
          <button type="button" className="btn" onClick={applyWizard}>Apply Wizard to Initial State</button>
        </section>

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Initial-State Template Library</div>
          <p className="sim-lab-note">One-click templates to seed statevector mode. All outputs remain editable.</p>
          <div className="sim-lab-chips">
            {[
              { key: 'basis0', label: 'Basis |0...0⟩' },
              { key: 'basis1', label: 'Basis |1...1⟩' },
              { key: 'bell', label: 'Bell-like' },
              { key: 'ghz', label: 'GHZ' },
              { key: 'w', label: 'W' },
              { key: 'haar', label: 'Random Haar' },
            ].map((template) => (
              <button
                key={template.key}
                type="button"
                className="sim-lab-chip"
                onClick={() => applyTemplate(template.key as StatevectorTemplateKind)}
              >
                {template.label}
              </button>
            ))}
          </div>
        </section>

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Parametric Sweep Studio</div>
          <p className="sim-lab-note">Sweep a parametric gate and track probability or observable expectation.</p>
          <div className="sim-sweep-controls">
            <label>
              Gate
              <select value={sweepGateId} onChange={(e) => setSweepGateId(e.target.value)}>
                {parametricGates.length === 0 ? (
                  <option value="">No parametric gates</option>
                ) : (
                  parametricGates.map((g) => (
                    <option key={g.id} value={g.id}>{g.gate}@col{g.column}</option>
                  ))
                )}
              </select>
            </label>
            <label>
              θ start
              <input value={sweepStart} onChange={(e) => setSweepStart(e.target.value)} />
            </label>
            <label>
              θ end
              <input value={sweepEnd} onChange={(e) => setSweepEnd(e.target.value)} />
            </label>
            <label>
              Steps
              <input value={sweepSteps} onChange={(e) => setSweepSteps(e.target.value)} />
            </label>
          </div>
          <div className="sim-sweep-controls">
            <label>
              Performance
              <select value={performanceMode ? 'on' : 'off'} onChange={(e) => onSetPerformanceMode(e.target.value === 'on')}>
                <option value="on">On (faster, capped)</option>
                <option value="off">Off (full precision)</option>
              </select>
            </label>
            <label>
              Metric
              <select value={sweepMetric} onChange={(e) => setSweepMetric(e.target.value as 'prob' | 'obs')}>
                <option value="prob">Probability</option>
                <option value="obs">Expectation</option>
              </select>
            </label>
            {sweepMetric === 'prob' ? (
              <label>
                Basis bits
                <input value={sweepBasis} onChange={(e) => setSweepBasis(e.target.value.replace(/[^01]/g, '').slice(0, numQubits))} />
              </label>
            ) : (
              <label>
                Observable
                <input value={sweepObservable} onChange={(e) => setSweepObservable(e.target.value)} />
              </label>
            )}
          </div>
          <div className="sim-sweep-chart">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={sweepData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="theta" tickFormatter={(v) => Number(v).toFixed(2)} stroke="var(--text-3)" />
                <YAxis stroke="var(--text-3)" />
                <Tooltip formatter={(v: number | string | undefined) => Number(v ?? 0).toFixed(6)} labelFormatter={(label) => `θ=${Number(label).toFixed(4)}`} />
                <Line type="monotone" dataKey="value" stroke="var(--primary)" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Measurement Basis Simulator</div>
          <p className="sim-lab-note">Set each qubit measurement axis, then inspect predicted basis outcome probabilities.</p>

          <div className="sim-basis-grid">
            {Array.from({ length: numQubits }, (_, q) => (
              <label key={q} className="sim-basis-item">
                <span>q{q}</span>
                <select
                  value={basisAxes[q] ?? 'Z'}
                  onChange={(e) => {
                    const axis = e.target.value as BasisAxis;
                    setBasisAxes((prev) => {
                      const next = [...prev];
                      next[q] = axis;
                      return next;
                    });
                  }}
                >
                  <option value="Z">Z</option>
                  <option value="X">X</option>
                  <option value="Y">Y</option>
                </select>
              </label>
            ))}
          </div>

          <div className="sim-lab-inline-metrics">
            <div>Top outcome: <strong>|{basisDist[0]?.basis ?? '0'.repeat(numQubits)}⟩</strong></div>
            <div>Probability: <strong>{((basisDist[0]?.probability ?? 0) * 100).toFixed(2)}%</strong></div>
          </div>

          <div className="sim-lab-results-wrap">
            <div className="sim-lab-results-head">
              <span>Outcome</span>
              <span>Probability</span>
            </div>
            {topOutcomes.map((entry) => (
              <div key={entry.basis} className="sim-lab-row">
                <span>|{entry.basis}⟩</span>
                <span>{(entry.probability * 100).toFixed(3)}%</span>
              </div>
            ))}
          </div>
        </section>

        {isFullLabView && (
        <>
        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Tomography Mode (Synthetic Shots)</div>
          <p className="sim-lab-note">Estimate single-qubit Bloch vector and 2-qubit correlations from simulated finite-shot measurements.</p>
          <div className="sim-sweep-controls">
            <label>
              Qubit
              <input value={tomoQubit} onChange={(e) => setTomoQubit(e.target.value)} />
            </label>
            <label>
              Pair (a,b)
              <input value={tomoPair} onChange={(e) => setTomoPair(e.target.value)} />
            </label>
            <label>
              Shots
              <input value={tomoShots} onChange={(e) => setTomoShots(e.target.value)} />
            </label>
          </div>
          <button type="button" className="btn" onClick={runTomography}>Run Tomography</button>
          {tomoResult && (
            <>
              <div className="sim-lab-results-wrap">
                <div className="sim-lab-results-head"><span>Metric</span><span>Estimate</span></div>
                <div className="sim-lab-row"><span>⟨X⟩</span><span>{tomoResult.x.toFixed(4)}</span></div>
                <div className="sim-lab-row"><span>⟨Y⟩</span><span>{tomoResult.y.toFixed(4)}</span></div>
                <div className="sim-lab-row"><span>⟨Z⟩</span><span>{tomoResult.z.toFixed(4)}</span></div>
                <div className="sim-lab-row"><span>P00</span><span>{((tomoResult.p00 ?? 0) * 100).toFixed(2)}%</span></div>
                <div className="sim-lab-row"><span>P11</span><span>{((tomoResult.p11 ?? 0) * 100).toFixed(2)}%</span></div>
                <div className="sim-lab-row"><span>⟨XX⟩</span><span>{(tomoResult.cxx ?? 0).toFixed(4)}</span></div>
                <div className="sim-lab-row"><span>⟨YY⟩</span><span>{(tomoResult.cyy ?? 0).toFixed(4)}</span></div>
                <div className="sim-lab-row"><span>⟨ZZ⟩</span><span>{(tomoResult.czz ?? 0).toFixed(4)}</span></div>
              </div>
              {tomoIdeal && tomoReconstructed && (
                <div className="sim-heatmap-wrap">
                  <div className="sim-heatmap-controls">
                    <label>
                      Heatmap mode
                      <select value={heatmapMode} onChange={(e) => setHeatmapMode(e.target.value as 'magnitude' | 'phase')}>
                        <option value="magnitude">Magnitude</option>
                        <option value="phase">Phase</option>
                      </select>
                    </label>
                    <div className={`sim-heatmap-legend ${heatmapMode}`}>
                      <span>{heatmapMode === 'magnitude' ? '|amp| low' : '-π'}</span>
                      <span className="sim-heatmap-legend-bar" />
                      <span>{heatmapMode === 'magnitude' ? '|amp| high' : '+π'}</span>
                    </div>
                  </div>
                  <div className="sim-heatmap-matrix">
                    <div className="sim-lab-note">Ideal ρ</div>
                    <div className="sim-heatmap-grid">
                      {tomoIdeal.map((z, idx) => (
                        <div key={`ideal-${idx}`} style={matrixCellStyle(z)}>{matrixToText(z)}</div>
                      ))}
                    </div>
                  </div>
                  <div className="sim-heatmap-matrix">
                    <div className="sim-lab-note">Reconstructed ρ̂</div>
                    <div className="sim-heatmap-grid">
                      {tomoReconstructed.map((z, idx) => (
                        <div key={`reco-${idx}`} style={matrixCellStyle(z)}>{matrixToText(z)}</div>
                      ))}
                    </div>
                  </div>
                  <div className="sim-lab-inline-metrics">
                    <span>Tomography fidelity: <strong>{(tomoFidelity ?? 0).toFixed(4)}</strong></span>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Circuit Profiler</div>
          <p className="sim-lab-note">Estimate per-column runtime, state size, and operation cost.</p>
          <div className="sim-sweep-controls">
            <label>
              Columns to profile
              <input value={profilerLimit} onChange={(e) => setProfilerLimit(e.target.value)} />
            </label>
          </div>
          <div className="sim-lab-results-wrap">
            <div className="sim-lab-results-head">
              <span>Column</span>
              <span>gates / runtime(ms) / amplitudes / cost</span>
            </div>
            {profilerRows.map((row) => (
              <div key={row.col} className="sim-lab-row">
                <span>{row.col}</span>
                <span>{row.gates} / {row.runtimeMs.toFixed(3)} / {row.ampCount} / {row.costScore}</span>
              </div>
            ))}
          </div>
        </section>
        </>
        )}

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Circuit Expression Macros</div>
          <p className="sim-lab-note">Use statements like repeat(3)&#123;H(0); CNOT(0,1)&#125; or Rx(0,pi/2).</p>
          <textarea
            className="sim-lab-textarea"
            value={macroExpr}
            onChange={(e) => setMacroExpr(e.target.value)}
            placeholder="repeat(3){H(0); CNOT(0,1)}"
          />
          <div className="sim-lab-inline-metrics">
            <button type="button" className="btn" onClick={() => handleApplyMacro(macroExpr)}>Apply Macro as Circuit</button>
            {macroMessage && <span>{macroMessage}</span>}
          </div>
        </section>

        {isFullLabView && (
        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Circuit Equivalence Checker</div>
          <p className="sim-lab-note">Compare current circuit against a candidate (up to global phase).</p>
          <textarea
            className="sim-lab-textarea"
            value={equivExpr}
            onChange={(e) => setEquivExpr(e.target.value)}
            placeholder="H(0); CNOT(0,1)"
          />
          <div className="sim-lab-inline-metrics">
            <button type="button" className="btn" onClick={runEquivalenceCheck}>Check Equivalence</button>
            {equivResult && <span>{equivResult}</span>}
          </div>
          <div className="sim-sweep-controls">
            <label>
              Comparison basis bits
              <input value={compareBasis} onChange={(e) => setCompareBasis(e.target.value.replace(/[^01]/g, '').slice(0, numQubits))} />
            </label>
          </div>
          {compareChartData.length > 0 && (
            <div className="sim-sweep-chart">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={compareChartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="col" stroke="var(--text-3)" />
                  <YAxis stroke="var(--text-3)" />
                  <Tooltip
                    formatter={(v: number | string | undefined) => `${(Number(v ?? 0) * 100).toFixed(3)}%`}
                    labelFormatter={(label) => `Column ${label}`}
                  />
                  <Line type="monotone" dataKey="current" stroke="var(--primary)" dot={false} strokeWidth={2} name="Current" />
                  <Line type="monotone" dataKey="candidate" stroke="#22c55e" dot={false} strokeWidth={2} name="Candidate" />
                  <Line type="monotone" dataKey="delta" stroke="#ef4444" dot={false} strokeWidth={1.5} name="|Δ|" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
        )}

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Algorithm Gallery Walkthrough</div>
          <p className="sim-lab-note">Apply guided algorithms with short step checklists.</p>
          <div className="sim-lab-chips">
            {ALGORITHMS.map((algo) => (
              <button key={algo.name} type="button" className="sim-lab-chip" onClick={() => setActiveAlgorithm(algo.name)}>
                {algo.name}
              </button>
            ))}
          </div>
          {ALGORITHMS.filter((algo) => algo.name === activeAlgorithm).map((algo) => (
            <div key={algo.name} className="sim-algo-box">
              <strong>{algo.name}</strong>
              <p className="sim-lab-note">{algo.summary}</p>
              <pre className="sim-lab-pre">{algo.macro}</pre>
              <div className="sim-lab-inline-metrics">
                {algo.steps.map((step) => <span key={step}>• {step}</span>)}
              </div>
              <button type="button" className="btn" onClick={() => handleApplyMacro(algo.macro)}>Apply Algorithm Circuit</button>
            </div>
          ))}
        </section>

        {isFullLabView && (
        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Reverse Engineering Assistant</div>
          <p className="sim-lab-note">Enter a target statevector expression to get a heuristic state-prep macro.</p>
          <textarea
            className="sim-lab-textarea"
            value={reverseTarget}
            onChange={(e) => setReverseTarget(e.target.value)}
            placeholder="(1/sqrt(2))*|00⟩ + (1/sqrt(2))*|11⟩"
          />
          <div className="sim-lab-inline-metrics">
            <button type="button" className="btn" onClick={runReverseEngineer}>Suggest Prep Macro</button>
            {reverseMessage && <span>{reverseMessage}</span>}
          </div>
          {reverseMacro && (
            <>
              <pre className="sim-lab-pre">{reverseMacro}</pre>
              <button type="button" className="btn" onClick={() => handleApplyMacro(reverseMacro)}>Apply Suggested Macro</button>
            </>
          )}
        </section>
        )}

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Export and Import Tools</div>
          <p className="sim-lab-note">Export circuit/sweep data and import macro, JSON, or OpenQASM-lite.</p>
          <div className="sim-lab-inline-metrics">
            <button type="button" className="btn" onClick={exportCircuitJson}>Export Circuit JSON</button>
            <button type="button" className="btn" onClick={exportSweepCsv}>Export Sweep CSV</button>
          </div>
          <textarea
            className="sim-lab-textarea"
            value={importExpr}
            onChange={(e) => setImportExpr(e.target.value)}
            placeholder="Paste macro, circuit JSON, or OPENQASM 2.0 snippet"
          />
          <div className="sim-lab-inline-metrics">
            <button type="button" className="btn" onClick={runImport}>Import</button>
            {importMessage && <span>{importMessage}</span>}
          </div>
        </section>

        {isFullLabView && (
        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Multi-Run Experiment Manager</div>
          <p className="sim-lab-note">Save sweep runs with shot/noise settings and compare traces.</p>
          <div className="sim-sweep-controls">
            <label>
              Run name
              <input value={experimentName} onChange={(e) => setExperimentName(e.target.value)} />
            </label>
            <label>
              Selected runs
              <select
                multiple
                value={selectedExperimentIds}
                onChange={(e) => {
                  const vals = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                  setSelectedExperimentIds(vals);
                }}
              >
                {savedExperiments.map((exp) => (
                  <option key={exp.id} value={exp.id}>{exp.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="sim-lab-inline-metrics">
            <button
              type="button"
              className="btn"
              onClick={() => {
                const id = `exp-${Date.now()}`;
                const payload = {
                  id,
                  name: experimentName || id,
                  createdAt: Date.now(),
                  data: sweepData,
                  numShots,
                  noise,
                  basis: shotsBasisAxes,
                };
                setSavedExperiments((prev) => [...prev, payload]);
                setSelectedExperimentIds((prev) => Array.from(new Set([...prev, id])));
              }}
            >
              Save Current Run
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const active = savedExperiments.find((exp) => selectedExperimentIds.includes(exp.id)) ?? savedExperiments[savedExperiments.length - 1];
                if (!active) return;
                onApplyShotsConfig({ numShots: active.numShots, noise: active.noise, shotsBasisAxes: active.basis });
              }}
            >
              Apply Selected Config to Shots
            </button>
            <button type="button" className="btn" onClick={() => setSavedExperiments([])}>Clear Runs</button>
          </div>
          {experimentCompareData.length > 0 && (
            <div className="sim-sweep-chart">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={experimentCompareData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="theta" stroke="var(--text-3)" tickFormatter={(v) => Number(v).toFixed(2)} />
                  <YAxis stroke="var(--text-3)" />
                  <Tooltip formatter={(v: number | string | undefined) => Number(v ?? 0).toFixed(6)} />
                  <Line type="monotone" dataKey="current" stroke="var(--primary)" dot={false} strokeWidth={2} name="Current" />
                  {savedExperiments
                    .filter((exp) => selectedExperimentIds.includes(exp.id))
                    .map((exp, idx) => (
                      <Line key={exp.id} type="monotone" dataKey={exp.id} stroke={['#22c55e', '#f97316', '#ef4444', '#a855f7', '#0ea5e9'][idx % 5]} dot={false} strokeWidth={1.6} name={exp.name} />
                    ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
        )}

      </div>
    </div>
  );
};

export default React.memo(SimulatorLabPanel);
