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
  const [timelineLimit, setTimelineLimit] = useState('24');
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
  const [benchmarkPreset, setBenchmarkPreset] = useState('none');
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
  const shareLoadedRef = useRef(false);
  const observableInputRef = useRef<HTMLTextAreaElement | null>(null);

  const noisePresets: Array<{ key: string; label: string; config: NoiseConfig }> = useMemo(() => [
    { key: 'none', label: 'No noise', config: { enabled: false, depolarizing1q: 0, amplitudeDamping: 0, bitFlip: 0, phaseFlip: 0, readoutError: 0 } },
    { key: 'nISQ-lite', label: 'NISQ Lite', config: { enabled: true, depolarizing1q: 0.01, amplitudeDamping: 0.01, bitFlip: 0.004, phaseFlip: 0.004, readoutError: 0.01 } },
    { key: 'decoherence', label: 'Decoherence heavy', config: { enabled: true, depolarizing1q: 0.02, amplitudeDamping: 0.08, bitFlip: 0.01, phaseFlip: 0.03, readoutError: 0.015 } },
    { key: 'readout-heavy', label: 'Readout heavy', config: { enabled: true, depolarizing1q: 0.006, amplitudeDamping: 0.006, bitFlip: 0.003, phaseFlip: 0.005, readoutError: 0.08 } },
    { key: 'drift', label: 'Calibration drift', config: { enabled: true, depolarizing1q: 0.03, amplitudeDamping: 0.025, bitFlip: 0.012, phaseFlip: 0.02, readoutError: 0.03 } },
  ], []);

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
    if (shareLoadedRef.current) return;
    shareLoadedRef.current = true;

    const raw = new URLSearchParams(window.location.search).get('simcfg');
    if (!raw) return;

    try {
      const decoded = JSON.parse(decodeURIComponent(atob(raw))) as {
        symbols?: SymbolBinding[];
        performanceMode?: boolean;
        sweep?: { start?: string; end?: string; steps?: string; metric?: 'prob' | 'obs'; basis?: string; observable?: string };
        shots?: { numShots?: number; basis?: MeasurementBasisAxis[]; noise?: NoiseConfig };
      };

      if (decoded.symbols) onSetSymbolBindings(decoded.symbols);
      if (typeof decoded.performanceMode === 'boolean') onSetPerformanceMode(decoded.performanceMode);
      if (decoded.sweep) {
        setSweepStart(decoded.sweep.start ?? sweepStart);
        setSweepEnd(decoded.sweep.end ?? sweepEnd);
        setSweepSteps(decoded.sweep.steps ?? sweepSteps);
        setSweepMetric(decoded.sweep.metric ?? sweepMetric);
        setSweepBasis(decoded.sweep.basis ?? sweepBasis);
        setSweepObservable(decoded.sweep.observable ?? sweepObservable);
      }
      if (decoded.shots?.noise && decoded.shots?.basis && decoded.shots?.numShots) {
        onApplyShotsConfig({ numShots: decoded.shots.numShots, noise: decoded.shots.noise, shotsBasisAxes: decoded.shots.basis });
      }
    } catch {
      // Ignore malformed shared config links.
    }
  }, [onApplyShotsConfig, onSetPerformanceMode, onSetSymbolBindings, sweepBasis, sweepEnd, sweepMetric, sweepObservable, sweepStart, sweepSteps]);

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

  const timelineRows = useMemo(() => {
    const rawLimit = Math.max(4, Math.min(200, Math.round(Number(timelineLimit) || 24)));
    const stride = performanceMode ? 2 : 1;
    const rows: Array<{ col: number; topBasis: string; topProb: number; zAvg: number }> = [];
    const limit = Math.min(circuit.numColumns, rawLimit * stride);

    for (let col = 0; col < limit; col += stride) {
      const s = runCircuit(circuit, col, true, initialState).state;
      let topIdx = 0;
      let top = 0;
      for (let i = 0; i < s.length; i += 1) {
        const p = cAbs2(s[i]);
        if (p > top) {
          top = p;
          topIdx = i;
        }
      }

      let zSum = 0;
      for (let q = 0; q < numQubits; q += 1) {
        zSum += getBlochVector(s, q, numQubits)[2];
      }

      rows.push({
        col,
        topBasis: topIdx.toString(2).padStart(numQubits, '0'),
        topProb: top,
        zAvg: zSum / Math.max(1, numQubits),
      });
    }
    return rows;
  }, [circuit, initialState, numQubits, performanceMode, timelineLimit]);

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
          <div className="sim-lab-card-title">Drift and Noise Benchmark Presets</div>
          <p className="sim-lab-note">Apply realistic noise profiles quickly to benchmark circuit robustness.</p>
          <div className="sim-sweep-controls">
            <label>
              Preset
              <select value={benchmarkPreset} onChange={(e) => setBenchmarkPreset(e.target.value)}>
                {noisePresets.map((preset) => (
                  <option key={preset.key} value={preset.key}>{preset.label}</option>
                ))}
              </select>
            </label>
            <label>
              Shots
              <input value={String(numShots)} onChange={(e) => onApplyShotsConfig({ numShots: Math.max(1, Math.min(100000, Number(e.target.value) || numShots)), noise, shotsBasisAxes })} />
            </label>
          </div>
          <div className="sim-lab-inline-metrics">
            <button
              type="button"
              className="btn"
              onClick={() => {
                const preset = noisePresets.find((p) => p.key === benchmarkPreset);
                if (!preset) return;
                onApplyShotsConfig({ numShots, noise: preset.config, shotsBasisAxes });
              }}
            >
              Apply Preset
            </button>
            <span>Current: dep {noise.depolarizing1q.toFixed(3)}, damp {noise.amplitudeDamping.toFixed(3)}, bit {noise.bitFlip.toFixed(3)}, phase {noise.phaseFlip.toFixed(3)}, readout {noise.readoutError.toFixed(3)}</span>
          </div>
        </section>

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
          <div className="sim-lab-card-title">Gate Timeline Inspector</div>
          <p className="sim-lab-note">Inspect state evolution column-by-column (top basis, probability, and average ⟨Z⟩).</p>
          <div className="sim-sweep-controls">
            <label>
              Rows
              <input value={timelineLimit} onChange={(e) => setTimelineLimit(e.target.value)} />
            </label>
            <label>
              Mode
              <select value={performanceMode ? 'fast' : 'full'} onChange={(e) => onSetPerformanceMode(e.target.value === 'fast')}>
                <option value="fast">Fast (sampled)</option>
                <option value="full">Full</option>
              </select>
            </label>
          </div>
          <div className="sim-lab-results-wrap">
            <div className="sim-lab-results-head">
              <span>Column</span>
              <span>Top basis / P / ⟨Z⟩avg</span>
            </div>
            {timelineRows.map((row) => (
              <div key={row.col} className="sim-lab-row">
                <span>{row.col}</span>
                <span>|{row.topBasis}⟩ / {(row.topProb * 100).toFixed(2)}% / {row.zAvg.toFixed(3)}</span>
              </div>
            ))}
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

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Shareable Experiment Links</div>
          <p className="sim-lab-note">Create links that encode symbols, sweep setup, and shots/noise configuration.</p>
          <div className="sim-lab-inline-metrics">
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const payload = {
                  symbols: symbolBindings,
                  performanceMode,
                  sweep: { start: sweepStart, end: sweepEnd, steps: sweepSteps, metric: sweepMetric, basis: sweepBasis, observable: sweepObservable },
                  shots: { numShots, noise, basis: shotsBasisAxes },
                };
                const encoded = btoa(encodeURIComponent(JSON.stringify(payload)));
                const url = new URL(window.location.href);
                url.searchParams.set('simcfg', encoded);
                await navigator.clipboard.writeText(url.toString());
              }}
            >
              Copy Share Link
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default React.memo(SimulatorLabPanel);
