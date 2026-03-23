import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { optimizeSingleParameter } from '../logic/parameterOptimizer';
import { histogramToProbArray, klDivergence, stateFidelity, traceDistanceApprox } from '../logic/stateMetrics';
import { findCorrelatedQubitPairs } from '../logic/entanglementAnalysis';
import { fitNoiseModelFromHistogram, parseHistogramText, type CalibrationResult } from '../logic/noiseCalibration';
import { mitigateReadoutHistogram } from '../logic/readoutMitigation';

interface Props {
  state: Complex[];
  numQubits: number;
  circuit: CircuitState;
  initialState: Complex[];
  noise: NoiseConfig;
  numShots: number;
  shotsBasisAxes: MeasurementBasisAxis[];
  symbolBindings: SymbolBinding[];
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

const FEATURE_RELATED_TERMS: Record<string, string[]> = {
  'Results Compare Tray': ['compare', 'raw', 'noisy', 'mitigated', 'delta'],
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
  'Observable Expectations': ['pauli', 'expectation value', 'operators', 'measurements'],
  'State Preparation Wizard (Rz(phi)Ry(theta)|0⟩)': ['initial state', 'theta', 'phi', 'bloch sphere'],
  'Initial-State Template Library': ['templates', 'ghz', 'bell', 'w state', 'haar'],
  'Parametric Sweep Studio': ['scan', 'sweep', 'curve', 'parameter scan'],
  'Measurement Basis Simulator': ['x basis', 'y basis', 'z basis', 'measurement axes'],
  'Tomography Mode (Synthetic Shots)': ['tomography', 'reconstruction', 'synthetic shots'],
  'Circuit Profiler': ['runtime', 'performance', 'cost', 'profiling'],
  'Circuit Expression Macros': ['macro language', 'dsl', 'repeat syntax'],
  'Circuit Equivalence Checker': ['equivalent', 'global phase', 'compare circuits'],
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
  const [qasmCopyMessage, setQasmCopyMessage] = useState('');
  const [qasmInteropMessage, setQasmInteropMessage] = useState('');
  const [qasmInteropSuggestions, setQasmInteropSuggestions] = useState<string[]>([]);
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
  const [savedPacks, setSavedPacks] = useState<Array<{ id: string; name: string; createdAt: number; circuit: CircuitState; symbols: SymbolBinding[]; shots: { numShots: number; noise: NoiseConfig; basis: MeasurementBasisAxis[] }; notes: string }>>(() => {
    try {
      const raw = localStorage.getItem('qc-sim-packs-v1');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [savePackNotes, setSavePackNotes] = useState('');
  const [selectedPackId, setSelectedPackId] = useState('');
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
  }>>(() => {
    try {
      const raw = localStorage.getItem('qc-sim-experiments-v1');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [selectedExperimentIds, setSelectedExperimentIds] = useState<string[]>([]);
  const [entanglementPair, setEntanglementPair] = useState('0,1');
  const [observedHistogramInput, setObservedHistogramInput] = useState('00: 520\n11: 504');
  const [calibrationResult, setCalibrationResult] = useState<CalibrationResult | null>(null);
  const [featureQuery, setFeatureQuery] = useState(() => {
    try {
      const raw = localStorage.getItem('qc-sim-lab-ui-v1');
      if (!raw) return '';
      const parsed = JSON.parse(raw) as Partial<{ featureQuery: string }>;
      return typeof parsed.featureQuery === 'string' ? parsed.featureQuery : '';
    } catch {
      return '';
    }
  });
  const [visibleFeatureCount, setVisibleFeatureCount] = useState(0);
  const [pinnedTools, setPinnedTools] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('qc-sim-lab-ui-v1');
      if (!raw) return [];
      const parsed = JSON.parse(raw) as Partial<{ pinnedTools: string[] }>;
      return Array.isArray(parsed.pinnedTools) ? parsed.pinnedTools.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  });
  const [pinnedOnly, setPinnedOnly] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('qc-sim-lab-ui-v1');
      if (!raw) return false;
      const parsed = JSON.parse(raw) as Partial<{ pinnedOnly: boolean }>;
      return parsed.pinnedOnly === true;
    } catch {
      return false;
    }
  });
  const [mitigationShots, setMitigationShots] = useState('2048');
  const [mitigationBasisBits, setMitigationBasisBits] = useState(() => '0'.repeat(numQubits));
  const [mitigationReadoutError, setMitigationReadoutError] = useState('');
  const [mitigationSummary, setMitigationSummary] = useState<null | {
    raw: number;
    mitigated: number;
    delta: number;
    topRaw: Array<{ basis: string; p: number }>;
    topMitigated: Array<{ basis: string; p: number }>;
  }>(null);
  const observableInputRef = useRef<HTMLTextAreaElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('qc-sim-lab-ui-v1', JSON.stringify({
        featureQuery,
        pinnedTools,
        pinnedOnly,
      }));
    } catch {
      // Ignore localStorage write failures.
    }
  }, [featureQuery, pinnedOnly, pinnedTools]);

  useEffect(() => {
    try {
      localStorage.setItem('qc-sim-experiments-v1', JSON.stringify(savedExperiments));
    } catch {
      // Ignore localStorage write failures.
    }
  }, [savedExperiments]);

  useEffect(() => {
    try {
      localStorage.setItem('qc-sim-packs-v1', JSON.stringify(savedPacks));
    } catch {
      // Ignore localStorage write failures.
    }
  }, [savedPacks]);

  const parametricGates = useMemo(() => circuit.gates.filter((g) => isParametric(g.gate)), [circuit.gates]);
  const normalizeBitString = useCallback((raw: string) => (
    raw.replace(/[^01]/g, '').padEnd(numQubits, '0').slice(0, numQubits)
  ), [numQubits]);
  const normalizeMeasurementAxes = useCallback((axes: MeasurementBasisAxis[]) => (
    Array.from({ length: numQubits }, (_, i) => axes[i] ?? 'Z')
  ), [numQubits]);
  const basisAxesView = useMemo<BasisAxis[]>(
    () => Array.from({ length: numQubits }, (_, i) => basisAxes[i] ?? 'Z'),
    [basisAxes, numQubits],
  );
  const wizardThetaView = useMemo<number[]>(
    () => Array.from({ length: numQubits }, (_, i) => wizardTheta[i] ?? Math.PI / 2),
    [wizardTheta, numQubits],
  );
  const wizardPhiView = useMemo<number[]>(
    () => Array.from({ length: numQubits }, (_, i) => wizardPhi[i] ?? 0),
    [wizardPhi, numQubits],
  );
  const sweepBasisView = useMemo(() => normalizeBitString(sweepBasis), [normalizeBitString, sweepBasis]);
  const compareBasisView = useMemo(() => normalizeBitString(compareBasis), [compareBasis, normalizeBitString]);
  const noiseSweepBasisView = useMemo(() => normalizeBitString(noiseSweepBasis), [noiseSweepBasis, normalizeBitString]);
  const mitigationBasisBitsView = useMemo(() => normalizeBitString(mitigationBasisBits), [mitigationBasisBits, normalizeBitString]);
  const optimizerBasisView = useMemo(() => normalizeBitString(optimizerBasis), [optimizerBasis, normalizeBitString]);
  const effectiveOptimizerGateId = useMemo(() => {
    if (parametricGates.length === 0) return '';
    if (parametricGates.some((g) => g.id === optimizerGateId)) return optimizerGateId;
    return parametricGates[0].id;
  }, [parametricGates, optimizerGateId]);
  const effectiveSweepGateId = useMemo(() => {
    if (parametricGates.length === 0) return '';
    if (parametricGates.some((g) => g.id === sweepGateId)) return sweepGateId;
    return parametricGates[0].id;
  }, [parametricGates, sweepGateId]);

  const profilerRows = useMemo(() => {
    const limit = Math.max(4, Math.min(circuit.numColumns, Math.round(Number(profilerLimit) || 40)));
    const rows: Array<{ col: number; gates: number; runtimeMs: number; ampCount: number; costScore: number }> = [];

    for (let col = 0; col < limit; col += 1) {
      runCircuit(circuit, col, true, initialState);
      const gates = circuit.gates.filter((g) => g.column === col).length;
      const ampCount = 1 << numQubits;
      const costScore = gates * ampCount;
      const runtimeMs = Math.max(0.02, costScore * 0.00002);
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
    () => computeBasisDistribution(state, numQubits, basisAxesView),
    [state, numQubits, basisAxesView],
  );

  const topOutcomes = basisDist.slice(0, 8);
  const hasObservableErrors = evaluations.some((e) => !e.valid);
  const cliffordStatus = useMemo(() => isCliffordLikeCircuit(circuit), [circuit]);
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
    const gate = parametricGates.find((g) => g.id === effectiveSweepGateId);
    if (!gate) return [] as Array<{ theta: number; value: number }>;

    const start = parseAngle(applySymbolBindings(sweepStart, symbolBindings), 0);
    const end = parseAngle(applySymbolBindings(sweepEnd, symbolBindings), Math.PI);
    const steps = Math.max(2, Math.min(200, Math.round(Number(sweepSteps) || 16)));
    const basisIndex = Number.parseInt(sweepBasisView || '0', 2);
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
    sweepBasisView,
    sweepEnd,
    effectiveSweepGateId,
    sweepMetric,
    sweepObservable,
    sweepStart,
    sweepSteps,
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

    const limit = Math.max(2, Math.min(circuit.numColumns, 100));
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
  }, [circuit, entanglementPair, initialState, numQubits]);

  const compareTray = useMemo(() => {
    const rawTop = Array.from(distributionMetrics.ideal.entries())
      .sort((a, b) => b[1] - a[1])[0];
    const noisyTop = Array.from(distributionMetrics.noisy.entries())
      .sort((a, b) => b[1] - a[1])[0];
    return {
      rawTop: rawTop ? { basis: rawTop[0], p: rawTop[1] / Math.max(1, numShots) } : null,
      noisyTop: noisyTop ? { basis: noisyTop[0], p: noisyTop[1] / Math.max(1, numShots) } : null,
      tv: distributionMetrics.l1,
      kl: distributionMetrics.kl,
      mitigationDelta: mitigationSummary?.delta ?? null,
    };
  }, [distributionMetrics.ideal, distributionMetrics.kl, distributionMetrics.l1, distributionMetrics.noisy, mitigationSummary?.delta, numShots]);

  const applyMasonryRowSpans = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const style = getComputedStyle(grid);
    const rowHeight = Number.parseFloat(style.getPropertyValue('grid-auto-rows')) || 8;
    const rowGap = Number.parseFloat(style.getPropertyValue('row-gap')) || 14;
    const cards = Array.from(grid.querySelectorAll('.sim-lab-card:not(.sim-lab-card-system)')) as HTMLElement[];

    cards.forEach((card) => {
      if (card.style.display === 'none') {
        card.style.removeProperty('--sim-lab-row-span');
        return;
      }
      const cardHeight = card.getBoundingClientRect().height;
      const span = Math.max(1, Math.ceil((cardHeight + rowGap) / (rowHeight + rowGap)));
      card.style.setProperty('--sim-lab-row-span', String(span));
    });
  }, []);


  useEffect(() => {
    const q = featureQuery.trim().toLowerCase();
    const queryTokens = q.split(/\s+/).filter(Boolean);
    const cards = panelRef.current
      ? Array.from(panelRef.current.querySelectorAll('.sim-lab-card:not(.sim-lab-card-system)')) as HTMLElement[]
      : [];
    let visible = 0;

    cards.forEach((card) => {
      const title = (card.dataset.toolTitle
        ?? (card.querySelector('.sim-lab-card-title')?.childNodes[0]?.textContent ?? '')
      ).trim();
      const noteText = Array.from(card.querySelectorAll('.sim-lab-note'))
        .map((node) => node.textContent ?? '')
        .join(' ')
        .toLowerCase();
      const relatedTerms = (FEATURE_RELATED_TERMS[title] ?? []).join(' ').toLowerCase();
      const searchableText = `${title.toLowerCase()} ${noteText} ${relatedTerms}`;
      const allowedBySearch = queryTokens.length === 0 || queryTokens.every((token) => searchableText.includes(token));
      const allowedByPinned = !pinnedOnly || pinnedTools.includes(title);
      const show = allowedBySearch && allowedByPinned;
      card.style.display = show ? '' : 'none';
      card.style.order = pinnedTools.includes(title) ? '-1' : '0';
      card.classList.toggle('sim-lab-card-is-pinned', pinnedTools.includes(title));
      if (show) visible += 1;
    });

    const rafId = requestAnimationFrame(() => {
      setVisibleFeatureCount(visible);
      applyMasonryRowSpans();
    });

    return () => {
      cancelAnimationFrame(rafId);
      cards.forEach((card) => {
        card.style.display = '';
        card.style.order = '';
      });
    };
  }, [applyMasonryRowSpans, featureQuery, pinnedOnly, pinnedTools]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        applyMasonryRowSpans();
      });
    });

    observer.observe(grid);
    Array.from(grid.querySelectorAll('.sim-lab-card:not(.sim-lab-card-system)')).forEach((card) => observer.observe(card));

    const onWindowResize = () => {
      requestAnimationFrame(() => {
        applyMasonryRowSpans();
      });
    };
    window.addEventListener('resize', onWindowResize);

    return () => {
      window.removeEventListener('resize', onWindowResize);
      observer.disconnect();
    };
  }, [applyMasonryRowSpans, featureQuery, pinnedTools]);

  useEffect(() => {
    const cards = panelRef.current
      ? Array.from(panelRef.current.querySelectorAll('.sim-lab-card:not(.sim-lab-card-system)')) as HTMLElement[]
      : [];

    const cleanups: Array<() => void> = [];

    cards.forEach((card) => {
      const titleEl = card.querySelector('.sim-lab-card-title') as HTMLElement | null;
      if (!titleEl) return;

      const rawTitle = (card.dataset.toolTitle ?? titleEl.childNodes[0]?.textContent ?? '').trim();
      if (!rawTitle) return;
      card.dataset.toolTitle = rawTitle;

      const previous = titleEl.querySelector('.sim-lab-card-actions');
      if (previous) previous.remove();

      titleEl.classList.add('sim-lab-card-title-with-pin');

      const actions = document.createElement('div');
      actions.className = 'sim-lab-card-actions';

      const button = document.createElement('button');
      const isPinned = pinnedTools.includes(rawTitle);
      button.type = 'button';
      button.className = `sim-lab-pin-btn${isPinned ? ' is-pinned' : ''}`;
      button.textContent = isPinned ? 'Pinned' : 'Pin';
      button.setAttribute('aria-label', isPinned ? `Unpin ${rawTitle}` : `Pin ${rawTitle}`);
      button.title = isPinned ? 'Unpin this tool section' : 'Pin this tool section';

      const onClick = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        setPinnedTools((prev) => (
          prev.includes(rawTitle)
            ? prev.filter((item) => item !== rawTitle)
            : [...prev, rawTitle]
        ));
      };

      button.addEventListener('click', onClick);
      actions.appendChild(button);
      titleEl.appendChild(actions);

      cleanups.push(() => {
        button.removeEventListener('click', onClick);
        actions.remove();
      });
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [pinnedTools]);

  const applyWizard = () => {
    const exprs = Array.from({ length: numQubits }, (_, q) => {
      const theta = wizardThetaView[q] ?? Math.PI / 2;
      const phi = wizardPhiView[q] ?? 0;
      const a = Math.cos(theta / 2);
      const bRe = Math.cos(phi) * Math.sin(theta / 2);
      const bIm = Math.sin(phi) * Math.sin(theta / 2);
      return `${a.toFixed(6)},${formatComplexExpr(bRe, bIm)}`;
    });
    onApplyQubitExpressions(exprs);
  };

  const statusClassForMessage = useCallback((msg: string) => {
    const text = msg.toLowerCase();
    if (text.includes('invalid') || text.includes('not ') || text.includes('error') || text.includes('warning')) return 'sim-lab-status error';
    if (text.includes('applied') || text.includes('passed') || text.includes('completed') || text.includes('imported') || text.includes('equivalent')) return 'sim-lab-status success';
    return 'sim-lab-status neutral';
  }, []);

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
    const limit = Math.min(colMax, 90);
    const basisIndex = Number.parseInt(compareBasisView || '0', 2);
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
  }, [candidateCircuit, circuit, compareBasisView, initialState]);

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

  const runTranspilePreset = useCallback(() => {
    const report = transpileLikePresetReport(circuit, transpileLevel);
    onApplyMacroCircuit(report.circuit);
    setTranspileMessage(
      `Applied optimization level ${transpileLevel}: gates ${report.beforeGateCount} -> ${report.afterGateCount}, depth ${report.beforeDepth} -> ${report.afterDepth}, fused/cancelled ${report.fusedOrCancelled}.`,
    );
  }, [circuit, onApplyMacroCircuit, transpileLevel]);

  const runRandomCircuit = () => {
    const depth = Math.max(1, Math.min(128, Math.round(Number(randomDepth) || 18)));
    const seed = Math.max(1, Math.min(2147483646, Math.round(Number(randomSeed) || 7)));
    const generated = generateRandomCircuit(numQubits, depth, seed);
    onApplyMacroCircuit(generated);
    setTranspileMessage(`Generated seeded random circuit (depth ${depth}, seed ${seed}) with ${generated.gates.length} gates.`);
  };

  const buildQasmPreview = useCallback(() => {
    const qasm = exportOpenQasm2(circuit);
    setQasmPreview(qasm);
  }, [circuit]);

  const runOptimizer = () => {
    if (!effectiveOptimizerGateId) {
      setOptimizerMessage('No parametric gate available to optimize.');
      return;
    }

    const objective = optimizerObjective === 'prob'
      ? { kind: 'probability' as const, basisBits: optimizerBasisView }
      : { kind: 'observable' as const, expr: optimizerObservable };

    const result = optimizeSingleParameter(
      circuit,
      effectiveOptimizerGateId,
      initialState,
      objective,
      parseAngle(applySymbolBindings(optimizerStart, symbolBindings), -Math.PI),
      parseAngle(applySymbolBindings(optimizerEnd, symbolBindings), Math.PI),
      Math.max(8, Number(optimizerSteps) || 24),
    );

    setOptimizerData(result.trace);
    setOptimizerMessage(`Best θ=${result.bestTheta.toFixed(5)} with score ${result.bestValue.toFixed(6)}.`);
  };

  const runNoiseSweep = useCallback(() => {
    const start = Math.max(0, Number(noiseSweepStart) || 0);
    const end = Math.max(0, Number(noiseSweepEnd) || 0.12);
    const steps = Math.max(4, Math.min(50, Math.round(Number(noiseSweepSteps) || 12)));
    const basisIndex = Number.parseInt(noiseSweepBasisView || '0', 2);
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
  }, [circuit, initialState, noise, noiseSweepBasisView, noiseSweepEnd, noiseSweepParam, noiseSweepStart, noiseSweepSteps, numQubits, numShots, shotsBasisAxes]);

  const runReadoutMitigation = useCallback(() => {
    const shots = Math.max(256, Math.min(20000, Math.round(Number(mitigationShots) || 2048)));
    const targetBits = mitigationBasisBitsView;
    const readoutError = (() => {
      const parsed = Number(mitigationReadoutError);
      if (!Number.isFinite(parsed)) return Math.max(0, Math.min(0.49, noise.readoutError));
      return Math.max(0, Math.min(0.49, parsed));
    })();

    const rawHist = runWithNoiseShots(circuit, shots, { ...noise, enabled: true }, initialState, shotsBasisAxes);
    const mitigated = mitigateReadoutHistogram(rawHist, numQubits, readoutError);

    const rawTotal = Array.from(rawHist.values()).reduce((sum, v) => sum + v, 0) || 1;
    const rawTarget = (rawHist.get(targetBits) ?? 0) / rawTotal;
    const mitTarget = mitigated.get(targetBits) ?? 0;

    const topRaw = Array.from(rawHist.entries())
      .map(([basis, count]) => ({ basis, p: count / rawTotal }))
      .sort((a, b) => b.p - a.p)
      .slice(0, 3);

    const topMitigated = Array.from(mitigated.entries())
      .map(([basis, p]) => ({ basis, p }))
      .sort((a, b) => b.p - a.p)
      .slice(0, 3);

    setMitigationSummary({
      raw: rawTarget,
      mitigated: mitTarget,
      delta: mitTarget - rawTarget,
      topRaw,
      topMitigated,
    });
  }, [circuit, initialState, mitigationBasisBitsView, mitigationReadoutError, mitigationShots, noise, numQubits, shotsBasisAxes]);

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
    onApplyShotsConfig({ numShots: pack.shots.numShots, noise: pack.shots.noise, shotsBasisAxes: normalizeMeasurementAxes(pack.shots.basis) });
  };

  const runNoiseCalibration = () => {
    const observed = parseHistogramText(observedHistogramInput);
    const fitted = fitNoiseModelFromHistogram(circuit, initialState, observed, shotsBasisAxes, numShots);
    setCalibrationResult(fitted);
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

  const optimizerStepsNum = Number(optimizerSteps);
  const noiseSweepStepsNum = Number(noiseSweepSteps);
  const noiseSweepStartNum = Number(noiseSweepStart);
  const noiseSweepEndNum = Number(noiseSweepEnd);
  const mitigationShotsNum = Number(mitigationShots);
  const tomoShotsNum = Number(tomoShots);
  const tomoQubitNum = Number(tomoQubit);
  const canRunNoiseCalibration = observedHistogramInput.trim().length > 0;
  const canRunOptimizer = Boolean(effectiveOptimizerGateId)
    && Number.isFinite(optimizerStepsNum)
    && optimizerStepsNum >= 8
    && optimizerStepsNum <= 400;
  const canRunNoiseSweep = Number.isFinite(noiseSweepStepsNum)
    && noiseSweepStepsNum >= 4
    && noiseSweepStepsNum <= 200
    && Number.isFinite(noiseSweepStartNum)
    && Number.isFinite(noiseSweepEndNum)
    && noiseSweepEndNum >= noiseSweepStartNum;
  const canRunMitigation = Number.isFinite(mitigationShotsNum)
    && mitigationShotsNum >= 256
    && mitigationShotsNum <= 20000;
  const canSavePack = savePackName.trim().length > 0;
  const canLoadPack = selectedPackId.trim().length > 0 && savedPacks.some((pack) => pack.id === selectedPackId);
  const canApplyFittedNoise = Boolean(calibrationResult);
  const canRunTomography = Number.isFinite(tomoShotsNum)
    && tomoShotsNum >= 64
    && tomoShotsNum <= 100000
    && Number.isFinite(tomoQubitNum)
    && tomoQubitNum >= 0
    && tomoQubitNum < numQubits;
  const canApplyMacro = macroExpr.trim().length > 0;
  const canRunEquivalence = equivExpr.trim().length > 0;
  const canRunReverseEngineering = reverseTarget.trim().length > 0;
  const canImport = importExpr.trim().length > 0;
  const canSaveExperiment = sweepData.length > 0 && experimentName.trim().length > 0;
  const canApplySelectedExperimentConfig = savedExperiments.length > 0;

  const noiseCalibrationDisabledReason = canRunNoiseCalibration ? '' : 'Provide observed histogram text first.';
  const applyFittedNoiseDisabledReason = canApplyFittedNoise ? '' : 'Fit noise first to enable applying calibrated settings.';
  const optimizerDisabledReason = canRunOptimizer ? '' : (!effectiveOptimizerGateId
    ? 'Add at least one parametric gate to optimize.'
    : 'Set optimizer steps between 8 and 400.');
  const noiseSweepDisabledReason = canRunNoiseSweep ? '' : 'Set valid finite start/end values and steps between 4 and 200 (end >= start).';
  const mitigationDisabledReason = canRunMitigation ? '' : 'Set mitigation shots between 256 and 20000.';
  const savePackDisabledReason = canSavePack ? '' : 'Enter a pack name before saving.';
  const loadPackDisabledReason = canLoadPack ? '' : 'Select a saved pack to load it.';
  const tomographyDisabledReason = canRunTomography ? '' : `Use a valid qubit index (0-${Math.max(0, numQubits - 1)}) and shots in [64, 100000].`;
  const macroDisabledReason = canApplyMacro ? '' : 'Enter a macro expression before applying.';
  const equivalenceDisabledReason = canRunEquivalence ? '' : 'Enter a candidate circuit expression before checking.';
  const reverseDisabledReason = canRunReverseEngineering ? '' : 'Provide a target state expression first.';
  const importDisabledReason = canImport ? '' : 'Paste macro, JSON, or QASM text before importing.';
  const experimentDisabledReason = canSaveExperiment ? '' : 'Provide a run name and ensure sweep data exists before saving.';
  const applyExperimentConfigDisabledReason = canApplySelectedExperimentConfig ? '' : 'Save at least one run before applying a run config.';

  const isFullLabView = true;

  return (
    <div className="sim-lab-panel" ref={panelRef}>
      <h4 className="sim-lab-title">Simulator Lab</h4>
      <div className="sim-lab-feature-nav">
        <input
          type="search"
          value={featureQuery}
          onChange={(e) => setFeatureQuery(e.target.value)}
          placeholder="Search features..."
          aria-label="Search Simulator Lab features"
        />
        <div className="sim-lab-feature-actions">
          <label className="sim-lab-toggle-inline">
            <input
              type="checkbox"
              checked={pinnedOnly}
              onChange={(e) => setPinnedOnly(e.target.checked)}
            />
            Pinned only
          </label>
          <span className="sim-lab-feature-count">{visibleFeatureCount} sections visible</span>
        </div>
      </div>

      {visibleFeatureCount === 0 && (
        <div className="sim-lab-card sim-lab-card-system">
          <div className="sim-lab-card-title">No matching sections</div>
          <p className="sim-lab-note">No Simulator Lab section matches your search query.</p>
          <div className="sim-lab-inline-metrics">
            <button type="button" className="btn" onClick={() => setFeatureQuery('')}>Clear search</button>
            <span>Try keywords like: noise, qasm, benchmark, sweep, optimizer</span>
          </div>
        </div>
      )}

      <div className="sim-lab-grid" ref={gridRef}>
        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Results Compare Tray</div>
          <p className="sim-lab-note">Compact comparison of ideal, noisy, and mitigated outcomes.</p>
          <div className="sim-lab-results-wrap">
            <div className="sim-lab-results-head"><span>Signal</span><span>Value</span></div>
            <div className="sim-lab-row"><span>Ideal top outcome</span><span>{compareTray.rawTop ? `${compareTray.rawTop.basis} (${(compareTray.rawTop.p * 100).toFixed(2)}%)` : 'n/a'}</span></div>
            <div className="sim-lab-row"><span>Noisy top outcome</span><span>{compareTray.noisyTop ? `${compareTray.noisyTop.basis} (${(compareTray.noisyTop.p * 100).toFixed(2)}%)` : 'n/a'}</span></div>
            <div className="sim-lab-row"><span>Total variation distance</span><span>{compareTray.tv.toFixed(6)}</span></div>
            <div className="sim-lab-row"><span>KL divergence</span><span>{compareTray.kl.toFixed(6)}</span></div>
            <div className="sim-lab-row"><span>Mitigation delta</span><span>{compareTray.mitigationDelta === null ? 'n/a' : `${(compareTray.mitigationDelta * 100).toFixed(2)}%`}</span></div>
          </div>
        </section>

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
          <div className="sim-lab-card-title">Noise Calibration Fitting</div>
          <p className="sim-lab-note">Fit simulator noise params from observed histogram samples using KL minimization.</p>
          <textarea
            className="sim-lab-textarea"
            value={observedHistogramInput}
            onChange={(e) => setObservedHistogramInput(e.target.value)}
            placeholder="00: 520\n11: 504"
          />
          <div className="sim-lab-inline-metrics">
            <button type="button" className="btn" onClick={runNoiseCalibration} disabled={!canRunNoiseCalibration}>Fit Noise</button>
            <button
              type="button"
              className="btn"
              disabled={!canApplyFittedNoise}
              onClick={() => {
                if (!calibrationResult) return;
                onApplyShotsConfig({ numShots, noise: calibrationResult.bestNoise, shotsBasisAxes });
              }}
            >
              Apply Fitted Noise
            </button>
          </div>
          {!canRunNoiseCalibration && <p className="sim-lab-status neutral">{noiseCalibrationDisabledReason}</p>}
          {!canApplyFittedNoise && <p className="sim-lab-status neutral">{applyFittedNoiseDisabledReason}</p>}
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
                try {
                  await navigator.clipboard.writeText(text);
                  setQasmCopyMessage('QASM copied to clipboard.');
                } catch {
                  setQasmCopyMessage('Copy failed: clipboard permission denied by browser.');
                }
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
                setQasmCopyMessage('QASM downloaded as .qasm file.');
              }}
            >
              Download .qasm
            </button>
          </div>
          {qasmCopyMessage && <p className={statusClassForMessage(qasmCopyMessage)}>{qasmCopyMessage}</p>}

          <textarea
            className="sim-lab-textarea"
            value={qasmPreview}
            onChange={(e) => setQasmPreview(e.target.value)}
            placeholder="OPENQASM 2.0 preview appears here"
          />
          {transpileMessage && <p className={statusClassForMessage(transpileMessage)}>{transpileMessage}</p>}
        </section>

        {isFullLabView && (
        <>

        <section className="sim-lab-card">
          <div className="sim-lab-card-title">Parameter Optimizer (VQE-style Grid Search)</div>
          <p className="sim-lab-note">Optimize one gate parameter for probability or observable objective.</p>
          <div className="sim-sweep-controls">
            <label>
              Parametric gate
              <select value={effectiveOptimizerGateId} onChange={(e) => setOptimizerGateId(e.target.value)}>
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
                <input value={optimizerBasisView} onChange={(e) => setOptimizerBasis(e.target.value.replace(/[^01]/g, '').slice(0, numQubits))} />
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
            <button type="button" className="btn" onClick={runOptimizer} disabled={!canRunOptimizer}>Run Optimizer</button>
          </div>
          {!canRunOptimizer && <p className="sim-lab-status neutral">{optimizerDisabledReason}</p>}
          {optimizerMessage && <p className={statusClassForMessage(optimizerMessage)}>{optimizerMessage}</p>}
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
              <input value={noiseSweepBasisView} onChange={(e) => setNoiseSweepBasis(e.target.value.replace(/[^01]/g, '').slice(0, numQubits))} />
            </label>
            <button type="button" className="btn" onClick={runNoiseSweep} disabled={!canRunNoiseSweep}>Run Noise Sweep</button>
          </div>
          {!canRunNoiseSweep && <p className="sim-lab-status neutral">{noiseSweepDisabledReason}</p>}
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
          <div className="sim-lab-card-title">Error Mitigation Mini-Lab (Readout)</div>
          <p className="sim-lab-note">Apply independent readout-error mitigation and compare raw vs corrected target probability.</p>
          <div className="sim-sweep-controls">
            <label>
              Shots
              <input value={mitigationShots} onChange={(e) => setMitigationShots(e.target.value)} />
            </label>
            <label>
              Target basis bits
              <input value={mitigationBasisBitsView} onChange={(e) => setMitigationBasisBits(e.target.value.replace(/[^01]/g, '').slice(0, numQubits))} />
            </label>
            <label>
              Readout error p (optional)
              <input value={mitigationReadoutError} onChange={(e) => setMitigationReadoutError(e.target.value)} placeholder={`${noise.readoutError.toFixed(3)} default`} />
            </label>
            <button type="button" className="btn" onClick={runReadoutMitigation} disabled={!canRunMitigation}>Run Mitigation</button>
          </div>
          {!canRunMitigation && <p className="sim-lab-status neutral">{mitigationDisabledReason}</p>}
          {mitigationSummary && (
            <div className="sim-lab-results-wrap">
              <div className="sim-lab-results-head"><span>Metric</span><span>Value</span></div>
              <div className="sim-lab-row"><span>Target raw probability</span><span>{(mitigationSummary.raw * 100).toFixed(2)}%</span></div>
              <div className="sim-lab-row"><span>Target mitigated probability</span><span>{(mitigationSummary.mitigated * 100).toFixed(2)}%</span></div>
              <div className="sim-lab-row"><span>Delta</span><span>{(mitigationSummary.delta * 100).toFixed(2)}%</span></div>
              <div className="sim-lab-row"><span>Top raw outcomes</span><span>{mitigationSummary.topRaw.map((x) => `${x.basis}:${(x.p * 100).toFixed(1)}%`).join(' | ')}</span></div>
              <div className="sim-lab-row"><span>Top mitigated outcomes</span><span>{mitigationSummary.topMitigated.map((x) => `${x.basis}:${(x.p * 100).toFixed(1)}%`).join(' | ')}</span></div>
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
            {qasmInteropMessage && <span className={statusClassForMessage(qasmInteropMessage)}>{qasmInteropMessage}</span>}
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
            <button type="button" className="btn" onClick={savePack} disabled={!canSavePack}>Save Pack</button>
            <button type="button" className="btn" onClick={loadSelectedPack} disabled={!canLoadPack}>Load Pack</button>
            <button type="button" className="btn" onClick={() => setSavedPacks([])}>Clear Packs</button>
          </div>
          {!canSavePack && <p className="sim-lab-status neutral">{savePackDisabledReason}</p>}
          {!canLoadPack && <p className="sim-lab-status neutral">{loadPackDisabledReason}</p>}
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
                    value={wizardThetaView[q] ?? Math.PI / 2}
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
                    value={wizardPhiView[q] ?? 0}
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
                <span>θ={(wizardThetaView[q] ?? 0).toFixed(2)} rad, φ={(wizardPhiView[q] ?? 0).toFixed(2)} rad</span>
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
              <select value={effectiveSweepGateId} onChange={(e) => setSweepGateId(e.target.value)}>
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
              Metric
              <select value={sweepMetric} onChange={(e) => setSweepMetric(e.target.value as 'prob' | 'obs')}>
                <option value="prob">Probability</option>
                <option value="obs">Expectation</option>
              </select>
            </label>
            {sweepMetric === 'prob' ? (
              <label>
                Basis bits
                <input value={sweepBasisView} onChange={(e) => setSweepBasis(e.target.value.replace(/[^01]/g, '').slice(0, numQubits))} />
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
                  value={basisAxesView[q] ?? 'Z'}
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
          <button type="button" className="btn" onClick={runTomography} disabled={!canRunTomography}>Run Tomography</button>
          {!canRunTomography && <p className="sim-lab-status neutral">{tomographyDisabledReason}</p>}
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
            <button type="button" className="btn" onClick={() => handleApplyMacro(macroExpr)} disabled={!canApplyMacro}>Apply Macro as Circuit</button>
            {macroMessage && <span className={statusClassForMessage(macroMessage)}>{macroMessage}</span>}
          </div>
          {!canApplyMacro && <p className="sim-lab-status neutral">{macroDisabledReason}</p>}
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
            <button type="button" className="btn" onClick={runEquivalenceCheck} disabled={!canRunEquivalence}>Check Equivalence</button>
            {equivResult && <span className={statusClassForMessage(equivResult)}>{equivResult}</span>}
          </div>
          {!canRunEquivalence && <p className="sim-lab-status neutral">{equivalenceDisabledReason}</p>}
          <div className="sim-sweep-controls">
            <label>
              Comparison basis bits
              <input value={compareBasisView} onChange={(e) => setCompareBasis(e.target.value.replace(/[^01]/g, '').slice(0, numQubits))} />
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
            <button type="button" className="btn" onClick={runReverseEngineer} disabled={!canRunReverseEngineering}>Suggest Prep Macro</button>
            {reverseMessage && <span className={statusClassForMessage(reverseMessage)}>{reverseMessage}</span>}
          </div>
          {!canRunReverseEngineering && <p className="sim-lab-status neutral">{reverseDisabledReason}</p>}
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
            <button type="button" className="btn" onClick={runImport} disabled={!canImport}>Import</button>
            {importMessage && <span className={statusClassForMessage(importMessage)}>{importMessage}</span>}
          </div>
          {!canImport && <p className="sim-lab-status neutral">{importDisabledReason}</p>}
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
              disabled={!canSaveExperiment}
            >
              Save Current Run
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const active = savedExperiments.find((exp) => selectedExperimentIds.includes(exp.id)) ?? savedExperiments[savedExperiments.length - 1];
                if (!active) return;
                onApplyShotsConfig({ numShots: active.numShots, noise: active.noise, shotsBasisAxes: normalizeMeasurementAxes(active.basis) });
              }}
              disabled={!canApplySelectedExperimentConfig}
            >
              Apply Selected Config to Shots
            </button>
            <button type="button" className="btn" onClick={() => setSavedExperiments([])}>Clear Runs</button>
          </div>
          {!canSaveExperiment && <p className="sim-lab-status neutral">{experimentDisabledReason}</p>}
          {!canApplySelectedExperimentConfig && <p className="sim-lab-status neutral">{applyExperimentConfigDisabledReason}</p>}
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
