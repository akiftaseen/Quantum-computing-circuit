import React, { lazy, Suspense, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import './App.css';
import { formatComplex } from './logic/complex';
import { runCircuit, runWithShots, runWithNoiseShots, computeUnitary } from './logic/circuitRunner';
import { getBlochVector } from './logic/simulator';
import { TEMPLATE_GROUPS } from './logic/templates';
import { buildInitialStateFromInput, parseInitialQubitStateDetailed, type InitialStateInputMode } from './logic/initialQubitState';
import type { MeasurementBasisAxis } from './logic/measurementBasis';
import { applySymbolBindings, defaultSymbolBindings, type SymbolBinding } from './logic/symbolBindings';
import { useCircuitHistory } from './hooks/useCircuitHistory';
import { useCircuitDrafts, loadDraftWorkspace } from './hooks/useCircuitDrafts';
import { useTheme } from './hooks/useTheme';
import type { CircuitState, PlacedGate } from './logic/circuitTypes';
import { isParametric, newGateId, gateDisplayName, isSingleQubit } from './logic/circuitTypes';
import { validateQubitCount, validateColumnCount } from './logic/validation';
import { defaultNoise, type NoiseConfig } from './logic/noiseModel';

import GatePalette from './components/GatePalette';
import CircuitGrid from './components/CircuitGrid';
import ProbabilityChart from './components/ProbabilityChart';
import GateDetailsPanel from './components/GateDetailsPanel';
import ShotsHistogram from './components/ShotsHistogram';
import AppHeader from './components/AppHeader';

const BlochSphere = lazy(() => import('./components/BlochSphere'));
const DiracNotation = lazy(() => import('./components/DiracNotation'));
const GateDescriptionsModal = lazy(() => import('./components/GateDescriptionsModal'));
const CircuitAnalysisPanel = lazy(() => import('./components/CircuitAnalysisPanel'));
const QuantumStateInsightsPanel = lazy(() => import('./components/QuantumStateInsightsPanel'));
const ExperimentWorkbenchPanel = lazy(() => import('./components/ExperimentWorkbenchPanel'));
const SimulatorLabPanel = lazy(() => import('./components/SimulatorLabPanel'));

const INIT: CircuitState = { numQubits: 2, numColumns: 10, gates: [] };
const APP_STATE_STORAGE_KEY = 'qcs.app.state.v1';
const EXPORTABLE_LOCALSTORAGE_PREFIXES = ['qcs.', 'qc-sim-'];

type Tab = 'prob' | 'bloch' | 'dirac' | 'math' | 'shots' | 'analysis' | 'sim';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'prob', label: 'Probabilities', icon: '◎' },
  { key: 'bloch', label: 'Bloch Spheres', icon: '◔' },
  { key: 'dirac', label: 'Dirac ⟨ψ|', icon: 'ψ' },
  { key: 'math', label: 'Math Lens', icon: 'U' },
  { key: 'shots', label: 'Shots', icon: 'N' },
  { key: 'analysis', label: 'Analysis & State', icon: '∆' },
  { key: 'sim', label: 'Simulator Lab', icon: '⊕' },
];

const isTextEntryTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

const fitArray = <T,>(source: T[], len: number, fill: T): T[] =>
  Array.from({ length: len }, (_, i) => source[i] ?? fill);

const loadPersistedAppState = (): Partial<{
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  tab: Tab;
  numShots: number;
  shotSeedInput: string;
  noise: NoiseConfig;
  initialStateMode: InitialStateInputMode;
  initialQubitExprs: string[];
  statevectorExpr: string;
  shotsBasisAxes: MeasurementBasisAxis[];
  symbolBindings: SymbolBinding[];
  stepCol: number | null;
}> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(APP_STATE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ReturnType<typeof loadPersistedAppState>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const App: React.FC = () => {
  const initialWorkspace = loadDraftWorkspace(INIT);
  const persisted = useMemo(() => loadPersistedAppState(), []);
  const { circuit, setCircuit, undo, redo, reset, canUndo, canRedo } = useCircuitHistory(initialWorkspace.activeCircuit);
  const { mode: themeMode, cycleThemeMode } = useTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(persisted.sidebarCollapsed ?? false);
  const [stepCol, setStepCol] = useState<number | null>(persisted.stepCol ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(persisted.tab ?? 'prob');
  const [numShots, setNumShots] = useState(persisted.numShots ?? 1024);
  const [shotSeedInput, setShotSeedInput] = useState(persisted.shotSeedInput ?? '');
  const [shotsResult, setShotsResult] = useState<Map<string, number> | null>(null);
  const [noisyShotsResult, setNoisyShotsResult] = useState<Map<string, number> | null>(null);
  const [noise, setNoise] = useState<NoiseConfig>(persisted.noise ?? defaultNoise);
  const [showGateModal, setShowGateModal] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(persisted.sidebarWidth ?? 200);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [initialStateMode, setInitialStateMode] = useState<InitialStateInputMode>(persisted.initialStateMode ?? 'qubit');
  const [initialQubitExprs, setInitialQubitExprs] = useState<string[]>(() => persisted.initialQubitExprs ?? Array(INIT.numQubits).fill('0'));
  const [statevectorExpr, setStatevectorExpr] = useState<string>(persisted.statevectorExpr ?? '');
  const [activeInitTarget, setActiveInitTarget] = useState<{ mode: InitialStateInputMode; qubit?: number } | null>(null);
  const [shotsBasisAxes, setShotsBasisAxes] = useState<MeasurementBasisAxis[]>(() => persisted.shotsBasisAxes ?? Array(INIT.numQubits).fill('Z'));
  const [symbolBindings, setSymbolBindings] = useState<SymbolBinding[]>(() => persisted.symbolBindings ?? defaultSymbolBindings());
  const [liveMessage, setLiveMessage] = useState('');
  const qubitInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const statevectorInputRef = useRef<HTMLTextAreaElement | null>(null);
  const appStateImportRef = useRef<HTMLInputElement | null>(null);

  // Keyboard shortcuts are defined after handlers to avoid stale references.

  // Sidebar resizer handlers
  const startResizingSidebar = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingSidebar(true);
  }, []);

  const stopResizingSidebar = useCallback(() => {
    setIsResizingSidebar(false);
  }, []);

  const resizeSidebar = useCallback((e: MouseEvent) => {
    if (isResizingSidebar) {
      setSidebarWidth(Math.min(Math.max(160, e.clientX), 400));
    }
  }, [isResizingSidebar]);

  useEffect(() => {
    if (isResizingSidebar) {
      window.addEventListener('mousemove', resizeSidebar);
      window.addEventListener('mouseup', stopResizingSidebar);
      return () => {
        window.removeEventListener('mousemove', resizeSidebar);
        window.removeEventListener('mouseup', stopResizingSidebar);
      };
    }
  }, [isResizingSidebar, resizeSidebar, stopResizingSidebar]);

  useEffect(() => {
    try {
      localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify({
        sidebarCollapsed,
        sidebarWidth,
        tab,
        numShots,
        shotSeedInput,
        noise,
        initialStateMode,
        initialQubitExprs,
        statevectorExpr,
        shotsBasisAxes,
        symbolBindings,
        stepCol,
      }));
    } catch {
      // Ignore localStorage write failures.
    }
  }, [
    sidebarCollapsed,
    sidebarWidth,
    tab,
    numShots,
    shotSeedInput,
    noise,
    initialStateMode,
    initialQubitExprs,
    statevectorExpr,
    shotsBasisAxes,
    symbolBindings,
    stepCol,
  ]);

  const normalizedQubitExprs = useMemo(
    () => fitArray(initialQubitExprs, circuit.numQubits, '0'),
    [initialQubitExprs, circuit.numQubits],
  );

  const normalizedShotsBasisAxes = useMemo(
    () => fitArray(shotsBasisAxes, circuit.numQubits, 'Z' as MeasurementBasisAxis),
    [shotsBasisAxes, circuit.numQubits],
  );

  const boundInitialQubitExprs = useMemo(
    () => normalizedQubitExprs.map((expr) => applySymbolBindings(expr, symbolBindings)),
    [normalizedQubitExprs, symbolBindings],
  );

  const boundStatevectorExpr = useMemo(
    () => applySymbolBindings(statevectorExpr, symbolBindings),
    [statevectorExpr, symbolBindings],
  );

  const initialConfig = useMemo(
    () => buildInitialStateFromInput(circuit.numQubits, initialStateMode, boundInitialQubitExprs, boundStatevectorExpr),
    [circuit.numQubits, initialStateMode, boundInitialQubitExprs, boundStatevectorExpr],
  );

  const initialState = initialConfig.state;
  const initialQubitLabels = initialConfig.qubitLabels;

  const initialQubitValidation = useMemo(
    () => Array.from({ length: circuit.numQubits }, (_, q) => parseInitialQubitStateDetailed(boundInitialQubitExprs[q] ?? '0')),
    [circuit.numQubits, boundInitialQubitExprs],
  );

  // Live simulation
  const simResult = useMemo(() => {
    const col = stepCol ?? undefined;
    return runCircuit(circuit, col, true, initialState);
  }, [circuit, stepCol, initialState]);

  const blochVectors = useMemo(() =>
    Array.from({ length: circuit.numQubits }, (_, i) =>
      getBlochVector(simResult.state, i, circuit.numQubits)
    ), [simResult.state, circuit.numQubits]);

  const unitaryMatrix = useMemo(() => computeUnitary(circuit), [circuit]);

  const selectedGate = useMemo(() =>
    circuit.gates.find(g => g.id === selectedId) ?? null,
  [circuit.gates, selectedId]);

  const clearTransientResults = useCallback(() => {
    setSelectedId(null);
    setShotsResult(null);
    setNoisyShotsResult(null);
    setStepCol(null);
  }, []);

  const {
    drafts,
    activeDraft,
    activeDraftId,
    switchDraft,
    createNewDraft,
    duplicateActiveDraft,
    renameActiveDraft,
    deleteActiveDraft,
  } = useCircuitDrafts({
    initialDrafts: initialWorkspace.drafts,
    initialActiveDraftId: initialWorkspace.activeDraftId,
    activeCircuit: circuit,
    resetCircuit: reset,
    clearTransient: clearTransientResults,
    announce: setLiveMessage,
  });

  const paramEdit = useMemo(() => {
    if (!selectedGate || !isParametric(selectedGate.gate)) return null;
    return { id: selectedGate.id, value: selectedGate.params[0] ?? Math.PI / 2 };
  }, [selectedGate]);

  // ──── Circuit mutations ────

  const handlePlaceGate = useCallback((g: Omit<PlacedGate, 'id'>) => {
    const newGate: PlacedGate = { ...g, id: newGateId() };
    setCircuit((prev) => {
      // Auto-expand columns when placing near the end
      let cols = prev.numColumns;
      if (newGate.column >= cols - 2) {
        cols = newGate.column + 4;
      }
      const occupiedByNew = new Set<number>([...newGate.targets, ...newGate.controls]);

      return {
        ...prev,
        numColumns: cols,
        gates: prev.gates.filter(
          (x) => {
            if (x.column !== newGate.column) return true;
            const occupiedByExisting = [...x.targets, ...x.controls];
            const conflicts = occupiedByExisting.some((q) => occupiedByNew.has(q));
            return !conflicts;
          }
        ).concat(newGate),
      };
    });
  }, [setCircuit]);

  const handleRemoveGate = useCallback((id: string) => {
    setCircuit((prev) => ({ ...prev, gates: prev.gates.filter((g) => g.id !== id) }));
  }, [setCircuit]);

  const handleUpdateGate = useCallback((id: string, updates: Partial<PlacedGate>) => {
    setCircuit((prev) => ({
      ...prev,
      gates: prev.gates.map((g) => g.id === id ? { ...g, ...updates } : g),
    }));
  }, [setCircuit]);

  const handleSetQubits = (n: number) => {
    if (!validateQubitCount(n)) return;
    const filtered = circuit.gates.filter(g =>
      g.targets.every(t => t < n) && g.controls.every(c => c < n)
    );
    setCircuit({ ...circuit, numQubits: n, gates: filtered });
  };

  const handleSetColumns = (n: number) => {
    if (!validateColumnCount(n)) return;
    // Remove gates that fall outside the new range
    const filtered = circuit.gates.filter(g => g.column < n);
    setCircuit({ ...circuit, numColumns: n, gates: filtered });
  };

  const handleRunShots = () => {
    const parsedSeed = Number(shotSeedInput.trim());
    const hasSeed = shotSeedInput.trim().length > 0 && Number.isFinite(parsedSeed);
    const samplingOptions = hasSeed ? { seed: Math.trunc(parsedSeed) } : undefined;

    const effectiveNoise: NoiseConfig = {
      ...noise,
      enabled:
        noise.depolarizing1q > 0 ||
        noise.depolarizing2q > 0 ||
        noise.amplitudeDamping > 0 ||
        noise.bitFlip > 0 ||
        noise.phaseFlip > 0 ||
        noise.readoutError > 0 ||
        noise.t1Microseconds > 0 ||
        noise.t2Microseconds > 0,
    };
    const hist = runWithShots(circuit, numShots, initialState, normalizedShotsBasisAxes, samplingOptions);
    setShotsResult(hist);
    setNoisyShotsResult(runWithNoiseShots(circuit, numShots, effectiveNoise, initialState, normalizedShotsBasisAxes, samplingOptions));
    setNoise(effectiveNoise);
    setTab('shots');
    setLiveMessage(`Shots completed with ${numShots} samples${hasSeed ? ` (seed ${Math.trunc(parsedSeed)})` : ''}.`);
  };

  const applyStatevectorExpression = useCallback((expr: string) => {
    setInitialStateMode('statevector');
    setStatevectorExpr(expr);
    setActiveInitTarget({ mode: 'statevector' });
  }, []);

  const applyQubitExpressions = useCallback((exprs: string[]) => {
    setInitialStateMode('qubit');
    setInitialQubitExprs((prev) => Array.from({ length: circuit.numQubits }, (_, q) => exprs[q] ?? prev[q] ?? '0'));
    setActiveInitTarget({ mode: 'qubit', qubit: 0 });
  }, [circuit.numQubits]);

  const applyMacroCircuit = useCallback((next: CircuitState) => {
    reset(next);
    setInitialQubitExprs(Array(next.numQubits).fill('0'));
    setStatevectorExpr('');
    setShotsBasisAxes(Array(next.numQubits).fill('Z'));
    setSelectedId(null);
    setShotsResult(null);
    setNoisyShotsResult(null);
    setStepCol(null);
  }, [reset]);

  const updateNoise = (patch: Partial<NoiseConfig>) => {
    setNoise((prev) => {
      const next: NoiseConfig = { ...prev, ...patch };
      next.enabled =
        next.depolarizing1q > 0 ||
        next.depolarizing2q > 0 ||
        next.amplitudeDamping > 0 ||
        next.bitFlip > 0 ||
        next.phaseFlip > 0 ||
        next.readoutError > 0 ||
        next.t1Microseconds > 0 ||
        next.t2Microseconds > 0;
      return next;
    });
  };

  const updateNumShots = (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(1, Math.min(100000, Math.round(parsed)));
    setNumShots(clamped);
  };

  const resetNoise = () => {
    setNoise(defaultNoise);
  };

  const insertInitToken = (token: string) => {
    const caretOffset = token.endsWith('()') ? token.length - 1 : token.length;

    if (activeInitTarget?.mode === 'statevector' || initialStateMode === 'statevector') {
      const input = statevectorInputRef.current;
      const value = input?.value ?? statevectorExpr;
      const start = input?.selectionStart ?? value.length;
      const end = input?.selectionEnd ?? value.length;
      const nextValue = `${value.slice(0, start)}${token}${value.slice(end)}`;
      const nextCaret = start + caretOffset;

      setStatevectorExpr(nextValue);
      requestAnimationFrame(() => {
        const el = statevectorInputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(nextCaret, nextCaret);
      });
      return;
    }

    const q = activeInitTarget?.mode === 'qubit' && activeInitTarget.qubit !== undefined
      ? activeInitTarget.qubit
      : 0;
    const input = qubitInputRefs.current[q];
    const value = input?.value ?? (initialQubitExprs[q] ?? '');
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    const nextValue = `${value.slice(0, start)}${token}${value.slice(end)}`;
    const nextCaret = start + caretOffset;

    setInitialQubitExprs((prev) => {
      const next = [...prev];
      next[q] = nextValue;
      return next;
    });

    requestAnimationFrame(() => {
      const el = qubitInputRefs.current[q];
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const handleClear = () => {
    reset({ ...circuit, gates: [] });
    setSelectedId(null);
    setShotsResult(null);
    setNoisyShotsResult(null);
    setStepCol(null);
    setLiveMessage('Circuit cleared.');
  };

  const handleTemplate = (build: () => CircuitState) => {
    const c = build();
    reset(c);
    setInitialQubitExprs(Array(c.numQubits).fill('0'));
    setStatevectorExpr('');
    setSelectedId(null);
    setShotsResult(null);
    setNoisyShotsResult(null);
    setStepCol(null);
    setLiveMessage('Template loaded.');
  };

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (isTextEntryTarget(e.target)) return;

    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Z') { e.preventDefault(); redo(); }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedId && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        handleRemoveGate(selectedId);
        setSelectedId(null);
      }
    }
    if (e.key === 'ArrowLeft') setStepCol(prev => prev === null ? circuit.numColumns - 2 : Math.max(0, prev - 1));
    if (e.key === 'ArrowRight') setStepCol(prev => prev === null ? 0 : prev >= circuit.numColumns - 1 ? null : prev + 1);

    // Gate keyboard shortcuts (1-6 on selected gate's qubit column+1)
    if (!selectedGate) return;
    if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
      const map: Record<string, 'H' | 'X' | 'Y' | 'Z' | 'S' | 'T'> = {
        '1': 'H', '2': 'X', '3': 'Y', '4': 'Z', '5': 'S', '6': 'T',
      };
      const gate = map[e.key];
      if (gate) {
        const baseCol = selectedGate.column + 1;
        const tgt = selectedGate.targets[0];
        if (baseCol < circuit.numColumns) {
          handlePlaceGate({ gate, column: baseCol, targets: [tgt], controls: [], params: [] });
        }
      }
    }
  }, [selectedId, selectedGate, undo, redo, circuit.numColumns, handleRemoveGate, handlePlaceGate]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (!liveMessage) return;
    const timer = window.setTimeout(() => setLiveMessage(''), 2600);
    return () => window.clearTimeout(timer);
  }, [liveMessage]);

  const maxStepCol = circuit.numColumns - 1;

  const topOutcome = (hist: Map<string, number> | null): string | null => {
    if (!hist || hist.size === 0) return null;
    let bestKey: string | null = null;
    let bestCount = -1;
    for (const [key, count] of hist.entries()) {
      if (count > bestCount) {
        bestKey = key;
        bestCount = count;
      }
    }
    return bestKey;
  };

  const toPct = (x: number) => `${(x * 100).toFixed(1)}%`;

  const shotsInsights = useMemo(() => {
    if (!shotsResult || !noisyShotsResult) return null;

    const dim = 1 << circuit.numQubits;
    const idealTop = topOutcome(shotsResult);
    const idealTopCount = idealTop ? (shotsResult.get(idealTop) ?? 0) : 0;
    const idealTopProb = numShots > 0 ? idealTopCount / numShots : 0;

    const noisyTop = topOutcome(noisyShotsResult);
    const noisyTopCount = noisyTop ? (noisyShotsResult.get(noisyTop) ?? 0) : 0;
    const noisyTopProb = numShots > 0 ? noisyTopCount / numShots : 0;

    let l1 = 0;
    for (let i = 0; i < dim; i += 1) {
      const key = i.toString(2).padStart(circuit.numQubits, '0');
      const p = (shotsResult.get(key) ?? 0) / numShots;
      const q = (noisyShotsResult.get(key) ?? 0) / numShots;
      l1 += Math.abs(p - q);
    }

    const idealStdErr = Math.sqrt((idealTopProb * (1 - idealTopProb)) / Math.max(1, numShots));
    const noisyStdErr = Math.sqrt((noisyTopProb * (1 - noisyTopProb)) / Math.max(1, numShots));

    return {
      idealTop,
      idealTopProb,
      noisyTop,
      noisyTopProb,
      tvDistance: 0.5 * l1,
      idealTopCI95: 1.96 * idealStdErr,
      noisyTopCI95: 1.96 * noisyStdErr,
    };
  }, [shotsResult, noisyShotsResult, numShots, circuit.numQubits]);

  const handleResultsTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const key = e.key;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
    e.preventDefault();

    let nextIdx = idx;
    if (key === 'ArrowRight') nextIdx = (idx + 1) % TABS.length;
    if (key === 'ArrowLeft') nextIdx = (idx - 1 + TABS.length) % TABS.length;
    if (key === 'Home') nextIdx = 0;
    if (key === 'End') nextIdx = TABS.length - 1;

    const nextTab = TABS[nextIdx];
    setTab(nextTab.key);
    document.getElementById(`results-tab-${nextTab.key}`)?.focus();
  };

  const exportAppState = () => {
    try {
      const localStorageEntries: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (!EXPORTABLE_LOCALSTORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
        const value = localStorage.getItem(key);
        if (value === null) continue;
        localStorageEntries[key] = value;
      }

      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        localStorageEntries,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `quantum-sim-app-state-${Date.now()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setLiveMessage('App state exported.');
    } catch {
      setLiveMessage('Failed to export app state.');
    }
  };

  const importAppStateText = (raw: string) => {
    try {
      const parsed = JSON.parse(raw) as { version?: number; localStorageEntries?: Record<string, string> };
      if (parsed.version !== 1 || !parsed.localStorageEntries || typeof parsed.localStorageEntries !== 'object') {
        setLiveMessage('Invalid app-state file format.');
        return;
      }

      for (const [key, value] of Object.entries(parsed.localStorageEntries)) {
        if (!EXPORTABLE_LOCALSTORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
        localStorage.setItem(key, value);
      }

      setLiveMessage('App state imported. Reloading...');
      window.setTimeout(() => window.location.reload(), 350);
    } catch {
      setLiveMessage('Failed to import app state.');
    }
  };

  const onImportAppStateFile: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') importAppStateText(reader.result);
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  return (
    <div className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <AppHeader
        numQubits={circuit.numQubits}
        numColumns={circuit.numColumns}
        canUndo={canUndo}
        canRedo={canRedo}
        numShots={numShots}
        themeMode={themeMode}
        onSetQubits={handleSetQubits}
        onSetColumns={handleSetColumns}
        onUndo={undo}
        onRedo={redo}
        onClear={handleClear}
        onShowGates={() => setShowGateModal(true)}
        onCycleTheme={cycleThemeMode}
        onRunShots={handleRunShots}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
      />

      <div className="drafts-bar" aria-label="Circuit drafts">
        <label className="drafts-label" htmlFor="draft-select">Circuit</label>
        <select id="draft-select" className="drafts-select" value={activeDraftId} onChange={(e) => switchDraft(e.target.value)}>
          {drafts.map((draft) => (
            <option key={draft.id} value={draft.id}>{draft.name}</option>
          ))}
        </select>
        <button className="btn" onClick={createNewDraft}>New</button>
        <button className="btn" onClick={duplicateActiveDraft} disabled={!activeDraft}>Duplicate</button>
        <button className="btn" onClick={renameActiveDraft} disabled={!activeDraft}>Rename</button>
        <button className="btn" onClick={deleteActiveDraft} disabled={!activeDraft}>Delete</button>
        <button className="btn" onClick={exportAppState}>Export App State</button>
        <button className="btn" onClick={() => appStateImportRef.current?.click()}>Import App State</button>
        <input
          ref={appStateImportRef}
          type="file"
          accept="application/json"
          onChange={onImportAppStateFile}
          style={{ display: 'none' }}
        />
      </div>

      {/* ─── Body ─── */}
      <div className="app-body">
        {/* ─── Left Sidebar ─── */}
        <aside
          className="sidebar"
          aria-hidden={sidebarCollapsed}
          aria-label="Gate library and circuit templates"
          hidden={sidebarCollapsed}
          style={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
        >
          <div className="sidebar-content">
            <section className="sidebar-primary-section">
              <h3 className="sidebar-heading">Gate Library</h3>
              <GatePalette />
            </section>
            
            <div className="sidebar-divider" />
            
            <section className="sidebar-section sidebar-secondary-section">
              <h3 className="sidebar-heading">Templates</h3>
              <p className="sidebar-note">Start from a template, tweak gates, then run.</p>
              {TEMPLATE_GROUPS.map((group) => (
                <div key={group.name} className="template-group">
                  <div className="template-group-title">{group.name}</div>
                  {group.templates.map((t) => (
                    <button key={t.name} className="template-btn" onClick={() => handleTemplate(t.build)}>
                      <span>{t.name}</span>
                      <span className="template-badge">{t.qubits}q</span>
                    </button>
                  ))}
                </div>
              ))}
            </section>
          </div>
          <div 
            className={`sidebar-resizer ${isResizingSidebar ? 'resizing' : ''}`} 
            onMouseDown={startResizingSidebar} 
          />
        </aside>

        {/* ─── Main Area ─── */}
        <main className="main-area" id="main-content" aria-label="Circuit workspace">
          {/* ─── Circuit Canvas ─── */}
          <div className="circuit-scroll">
            <CircuitGrid
              circuit={circuit}
              onPlace={handlePlaceGate}
              onRemove={handleRemoveGate}
              selectedId={selectedId}
              onSelect={setSelectedId}
              stepCol={stepCol}
              qubitStateLabels={initialQubitLabels}
            />
            {/* Stepper bar */}
            <div className="stepper-row">
              <span className="stepper-label">Execution:</span>
              <input
                type="range"
                min={0}
                max={maxStepCol + 1}
                value={stepCol === null ? maxStepCol + 1 : stepCol}
                onChange={e => { const v = +e.target.value; setStepCol(v > maxStepCol ? null : v); }}
                className="ui-slider stepper-slider"
                aria-label="Execution step"
              />
              <span className="stepper-val">{stepCol === null ? 'All' : `Col ${stepCol}`}</span>
              <label className="stepper-shots">
                <span className="stepper-label">Shots</span>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={numShots}
                  onChange={e => updateNumShots(e.target.value)}
                  className="shots-input"
                />
              </label>

              <label className="stepper-shots">
                <span className="stepper-label">Seed (optional)</span>
                <input
                  type="number"
                  value={shotSeedInput}
                  onChange={(e) => setShotSeedInput(e.target.value)}
                  className="shots-input"
                  placeholder="auto"
                />
              </label>
            </div>

            <div className="init-state-row">
              <div className="init-state-header">
                <span className="stepper-label">Initial state</span>
                <div className="init-state-mode-switch" role="tablist" aria-label="Initial state mode">
                  <button
                    type="button"
                    className={`init-mode-btn${initialStateMode === 'qubit' ? ' active' : ''}`}
                    onClick={() => setInitialStateMode('qubit')}
                  >
                    Per qubit
                  </button>
                  <button
                    type="button"
                    className={`init-mode-btn${initialStateMode === 'statevector' ? ' active' : ''}`}
                    onClick={() => setInitialStateMode('statevector')}
                  >
                    Statevector
                  </button>
                </div>
              </div>

              {initialStateMode === 'qubit' ? (
                <div className="init-state-inputs">
                  {Array.from({ length: circuit.numQubits }, (_, q) => (
                    <label key={q} className={`init-state-item${initialQubitValidation[q]?.valid ? '' : ' invalid'}`}>
                      <span>q{q}</span>
                      <input
                        ref={(el) => { qubitInputRefs.current[q] = el; }}
                        value={normalizedQubitExprs[q] ?? '0'}
                        onFocus={() => setActiveInitTarget({ mode: 'qubit', qubit: q })}
                        onChange={(e) => {
                          const v = e.target.value;
                          setInitialQubitExprs((prev) => {
                            const next = [...prev];
                            next[q] = v;
                            return next;
                          });
                        }}
                        placeholder="0"
                        title="Use presets: 0, 1, +, -, i, -i or expressions: a,b. Complex supported (e.g. 1/sqrt(2),i/sqrt(2))."
                      />
                      <small className={`init-state-hint${initialQubitValidation[q]?.valid ? '' : ' error'}`}>
                        {initialQubitValidation[q]?.message}
                      </small>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="statevector-input-wrap">
                  <label className={`statevector-input-label${initialConfig.valid ? '' : ' invalid'}`}>
                    <span>Statevector expression</span>
                    <textarea
                      ref={statevectorInputRef}
                      value={statevectorExpr}
                      onFocus={() => setActiveInitTarget({ mode: 'statevector' })}
                      onChange={(e) => setStatevectorExpr(e.target.value)}
                      placeholder="(1/sqrt(2))*|00⟩ + (i/sqrt(2))*|11⟩"
                    />
                  </label>
                  <small className={`init-state-hint${initialConfig.valid ? '' : ' error'}`}>{initialConfig.message}</small>
                </div>
              )}

              <div className="formula-pad" aria-label="Formula pad">
                {['0', '1', '+', '-', '*', '/', '^', '(', ')', ',', 'i', 'pi', 'sqrt()', 'sin()', 'cos()', 'exp()', '|0⟩', '|1⟩', `|${'0'.repeat(circuit.numQubits)}⟩`, `|${'1'.repeat(circuit.numQubits)}⟩`].map((token) => (
                  <button key={token} type="button" className="formula-pad-btn" onClick={() => insertInitToken(token)}>
                    {token}
                  </button>
                ))}
              </div>

              <div className="inline-symbol-editor">
                <div className="inline-symbol-title">Symbols</div>
                <div className="inline-symbol-grid">
                  {symbolBindings.map((binding, idx) => (
                    <div key={`${binding.name}-${idx}`} className="inline-symbol-row">
                      <input
                        value={binding.name}
                        onChange={(e) => setSymbolBindings((prev) => prev.map((row, i) => (i === idx ? { ...row, name: e.target.value } : row)))}
                        placeholder="name"
                      />
                      <input
                        value={binding.value}
                        onChange={(e) => setSymbolBindings((prev) => prev.map((row, i) => (i === idx ? { ...row, value: e.target.value } : row)))}
                        placeholder="value"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ─── Param Editor (conditional) ─── */}
          {paramEdit && selectedGate && (
            <div className="info-card param-card">
              <h4>{gateDisplayName[selectedGate.gate]} Parameter</h4>
              <div className="param-row">
                <input
                  type="range"
                  min={0}
                  max={Math.PI * 4}
                  step={0.01}
                  value={paramEdit.value}
                  onChange={e => {
                    const v = +e.target.value;
                    handleUpdateGate(paramEdit.id, { params: [v] });
                  }}
                  className="ui-slider"
                  aria-label="Gate parameter"
                />
                <input
                  type="number"
                  step={0.01}
                  value={+(paramEdit.value / Math.PI).toFixed(4)}
                  onChange={e => {
                    const v = +e.target.value * Math.PI;
                    handleUpdateGate(paramEdit.id, { params: [v] });
                  }}
                />
                <span>× π</span>
                <button className="btn" onClick={() => { handleRemoveGate(paramEdit.id); setSelectedId(null); }}>🗑</button>
              </div>
            </div>
          )}

          {/* ─── Gate Details (conditional) ─── */}
          {selectedGate && isSingleQubit(selectedGate.gate) && (
            <div className="info-card">
              <GateDetailsPanel gate={selectedGate} />
            </div>
          )}

          {/* ─── Results Panel ─── */}
          <div className="results-panel">
            <div className="results-tabs" role="tablist" aria-label="Result views">
              {TABS.map((t, idx) => (
                <button
                  key={t.key}
                  id={`results-tab-${t.key}`}
                  className={`results-tab${tab === t.key ? ' active' : ''}`}
                  onClick={() => setTab(t.key)}
                  role="tab"
                  aria-selected={tab === t.key}
                  aria-controls={tab === t.key ? 'results-panel-active' : undefined}
                  tabIndex={tab === t.key ? 0 : -1}
                  onKeyDown={(e) => handleResultsTabKeyDown(e, idx)}
                >
                  <span className="results-tab-icon" aria-hidden="true">{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            <div
              className="results-content"
              id="results-panel-active"
              role="tabpanel"
              aria-labelledby={`results-tab-${tab}`}
            >
              {tab === 'prob' && (
                <ProbabilityChart state={simResult.state} numQubits={circuit.numQubits} />
              )}

              {tab === 'bloch' && (
                <Suspense fallback={<p className="empty-msg">Loading Bloch view...</p>}>
                  <div className="bloch-grid">
                    {blochVectors.map((v, i) => (
                      <BlochSphere key={i} vector={v} label={`q${i}`} />
                    ))}
                  </div>
                </Suspense>
              )}

              {tab === 'dirac' && (
                <Suspense fallback={<p className="empty-msg">Loading Dirac view...</p>}>
                  <DiracNotation state={simResult.state} numQubits={circuit.numQubits} />
                </Suspense>
              )}

              {tab === 'math' && (
                <div className="math-panel">
                  {unitaryMatrix ? (
                    <div>
                      <h4>Overall Unitary ({1 << circuit.numQubits}×{1 << circuit.numQubits})</h4>
                      <div className="matrix-wrap">
                        <table className="matrix-table">
                          <tbody>
                            {unitaryMatrix.map((row, i) => (
                              <tr key={i}>
                                {row.map((z, j) => (
                                  <td key={j} className="mat-cell">{formatComplex(z, 3)}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <p className="empty-msg">Unable to compute unitary for this circuit configuration.</p>
                  )}
                </div>
              )}

              {tab === 'shots' && (
                <div className="shots-panel">
                  <div className="shots-header-row">
                    <p className="shots-subtitle">
                      Compare ideal and noisy measurement distributions.
                    </p>
                    <div className="shots-header-actions">
                      <span className={`shots-noise-state${noise.enabled ? ' on' : ''}`}>
                        Noise {noise.enabled ? 'ON' : 'OFF'}
                      </span>
                      <button className="btn" onClick={resetNoise} disabled={!noise.enabled}>Reset Noise</button>
                    </div>
                  </div>

                  <div className="shots-basis-editor">
                    <div className="shots-basis-title">Measurement basis (applied before readout)</div>
                    <div className="shots-basis-grid">
                      {Array.from({ length: circuit.numQubits }, (_, q) => (
                        <label key={q} className="shots-basis-item">
                          <span>q{q}</span>
                          <select
                            value={normalizedShotsBasisAxes[q] ?? 'Z'}
                            onChange={(e) => {
                              const axis = e.target.value as MeasurementBasisAxis;
                              setShotsBasisAxes((prev) => {
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
                  </div>

                  <div className="noise-controls">
                    <label>
                      <span>Depolarizing (1q)</span>
                      <input type="range" min={0} max={0.2} step={0.005} value={noise.depolarizing1q}
                        className="ui-slider"
                        aria-label="Depolarizing 1-qubit noise"
                        onChange={(e) => updateNoise({ depolarizing1q: Number(e.target.value) })} />
                      <strong className="noise-value">{toPct(noise.depolarizing1q)}</strong>
                    </label>
                    <label>
                      <span>Depolarizing (2q+)</span>
                      <input type="range" min={0} max={0.35} step={0.005} value={noise.depolarizing2q}
                        className="ui-slider"
                        aria-label="Depolarizing 2-qubit noise"
                        onChange={(e) => updateNoise({ depolarizing2q: Number(e.target.value) })} />
                      <strong className="noise-value">{toPct(noise.depolarizing2q)}</strong>
                    </label>
                    <label>
                      <span>Amplitude damping</span>
                      <input type="range" min={0} max={0.2} step={0.005} value={noise.amplitudeDamping}
                        className="ui-slider"
                        aria-label="Amplitude damping noise"
                        onChange={(e) => updateNoise({ amplitudeDamping: Number(e.target.value) })} />
                      <strong className="noise-value">{toPct(noise.amplitudeDamping)}</strong>
                    </label>
                    <label>
                      <span>Readout error</span>
                      <input type="range" min={0} max={0.15} step={0.005} value={noise.readoutError}
                        className="ui-slider"
                        aria-label="Readout error noise"
                        onChange={(e) => updateNoise({ readoutError: Number(e.target.value) })} />
                      <strong className="noise-value">{toPct(noise.readoutError)}</strong>
                    </label>
                    <label>
                      <span>Bit flip</span>
                      <input type="range" min={0} max={0.2} step={0.005} value={noise.bitFlip}
                        className="ui-slider"
                        aria-label="Bit flip noise"
                        onChange={(e) => updateNoise({ bitFlip: Number(e.target.value) })} />
                      <strong className="noise-value">{toPct(noise.bitFlip)}</strong>
                    </label>
                    <label>
                      <span>Phase flip</span>
                      <input type="range" min={0} max={0.2} step={0.005} value={noise.phaseFlip}
                        className="ui-slider"
                        aria-label="Phase flip noise"
                        onChange={(e) => updateNoise({ phaseFlip: Number(e.target.value) })} />
                      <strong className="noise-value">{toPct(noise.phaseFlip)}</strong>
                    </label>
                    <label>
                      <span>T1 (microseconds)</span>
                      <input
                        type="number"
                        min={0}
                        max={100000}
                        step={1}
                        value={noise.t1Microseconds}
                        onChange={(e) => updateNoise({ t1Microseconds: Math.max(0, Number(e.target.value) || 0) })}
                      />
                      <strong className="noise-value">{noise.t1Microseconds.toFixed(0)} us</strong>
                    </label>
                    <label>
                      <span>T2 (microseconds)</span>
                      <input
                        type="number"
                        min={0}
                        max={100000}
                        step={1}
                        value={noise.t2Microseconds}
                        onChange={(e) => updateNoise({ t2Microseconds: Math.max(0, Number(e.target.value) || 0) })}
                      />
                      <strong className="noise-value">{noise.t2Microseconds.toFixed(0)} us</strong>
                    </label>
                    <label>
                      <span>1q gate time (ns)</span>
                      <input
                        type="number"
                        min={1}
                        max={100000}
                        step={1}
                        value={noise.gateTime1qNs}
                        onChange={(e) => updateNoise({ gateTime1qNs: Math.max(1, Number(e.target.value) || 1) })}
                      />
                      <strong className="noise-value">{noise.gateTime1qNs.toFixed(0)} ns</strong>
                    </label>
                    <label>
                      <span>2q gate time (ns)</span>
                      <input
                        type="number"
                        min={1}
                        max={100000}
                        step={1}
                        value={noise.gateTime2qNs}
                        onChange={(e) => updateNoise({ gateTime2qNs: Math.max(1, Number(e.target.value) || 1) })}
                      />
                      <strong className="noise-value">{noise.gateTime2qNs.toFixed(0)} ns</strong>
                    </label>
                    <label>
                      <span>Idle step time (ns)</span>
                      <input
                        type="number"
                        min={1}
                        max={100000}
                        step={1}
                        value={noise.idleTimeNs}
                        onChange={(e) => updateNoise({ idleTimeNs: Math.max(1, Number(e.target.value) || 1) })}
                      />
                      <strong className="noise-value">{noise.idleTimeNs.toFixed(0)} ns</strong>
                    </label>
                  </div>
                  {shotsResult && noisyShotsResult ? (
                    <>
                      {shotsInsights && (
                        <div className="shots-summary-grid">
                          <div className="shots-summary-card">
                            <div className="shots-summary-label">Top ideal outcome</div>
                            <div className="shots-summary-value">
                              {shotsInsights.idealTop ? `|${shotsInsights.idealTop}⟩` : 'n/a'}
                            </div>
                            <div className="shots-summary-note">{toPct(shotsInsights.idealTopProb)} of samples</div>
                            <div className="shots-summary-note">95% CI: ±{toPct(shotsInsights.idealTopCI95)}</div>
                          </div>

                          <div className="shots-summary-card">
                            <div className="shots-summary-label">Top noisy outcome</div>
                            <div className="shots-summary-value">
                              {shotsInsights.noisyTop ? `|${shotsInsights.noisyTop}⟩` : 'n/a'}
                            </div>
                            <div className="shots-summary-note">{toPct(shotsInsights.noisyTopProb)} of samples</div>
                            <div className="shots-summary-note">95% CI: ±{toPct(shotsInsights.noisyTopCI95)}</div>
                          </div>

                          <div className="shots-summary-card">
                            <div className="shots-summary-label">Distribution shift</div>
                            <div className="shots-summary-value">{toPct(shotsInsights.tvDistance)}</div>
                            <div className="shots-summary-note">Total variation distance</div>
                          </div>
                        </div>
                      )}

                      <div className="shots-compare-grid">
                        <section className="shots-chart-card">
                          <h4 className="shots-title">Ideal</h4>
                          <ShotsHistogram histogram={shotsResult} numQubits={circuit.numQubits} totalShots={numShots} />
                        </section>
                        <section className="shots-chart-card">
                          <h4 className="shots-title">Noisy</h4>
                          <ShotsHistogram histogram={noisyShotsResult} numQubits={circuit.numQubits} totalShots={numShots} />
                        </section>
                      </div>
                    </>
                  ) : (
                    <div className="shots-empty">
                      <p className="empty-msg">Run shots to generate measurement statistics.</p>
                      <p className="shots-empty-note">Tip: 1024 is default; 512 to 4096 works well for comparisons.</p>
                    </div>
                  )}
                </div>
              )}

              {tab === 'analysis' && (
                <div className="analysis-tab-wrap">
                  <Suspense fallback={<p className="empty-msg">Loading state insights...</p>}>
                    <QuantumStateInsightsPanel
                      state={simResult.state}
                      numQubits={circuit.numQubits}
                      shotsResult={shotsResult}
                      noisyShotsResult={noisyShotsResult}
                      noiseEnabled={noise.enabled}
                    />
                  </Suspense>
                  
                  <div className="sidebar-divider" style={{ margin: '0' }} />
                  
                  <Suspense fallback={<p className="empty-msg">Loading analysis...</p>}>
                    <CircuitAnalysisPanel circuit={circuit} />
                  </Suspense>

                  <div className="sidebar-divider" style={{ margin: '0' }} />

                  <Suspense fallback={<p className="empty-msg">Loading insights workspace...</p>}>
                    <ExperimentWorkbenchPanel
                      circuit={circuit}
                      state={simResult.state}
                      shotsResult={shotsResult}
                      noisyShotsResult={noisyShotsResult}
                      noise={noise}
                      numShots={numShots}
                    />
                  </Suspense>
                </div>
              )}

              {tab === 'sim' && (
                <Suspense fallback={<p className="empty-msg">Loading simulator lab...</p>}>
                  <SimulatorLabPanel
                    state={simResult.state}
                    numQubits={circuit.numQubits}
                    circuit={circuit}
                    initialState={initialState}
                    noise={noise}
                    numShots={numShots}
                    shotsBasisAxes={shotsBasisAxes}
                    symbolBindings={symbolBindings}
                    onSetSymbolBindings={setSymbolBindings}
                    onApplyShotsConfig={(config) => {
                      setNumShots(config.numShots);
                      setNoise(config.noise);
                      setShotsBasisAxes(config.shotsBasisAxes);
                    }}
                    onApplyMacroCircuit={applyMacroCircuit}
                    onApplyStatevectorExpression={applyStatevectorExpression}
                    onApplyQubitExpressions={applyQubitExpressions}
                  />
                </Suspense>
              )}

            </div>
          </div>
        </main>
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{liveMessage}</p>
      <Suspense fallback={null}>
        <GateDescriptionsModal isOpen={showGateModal} onClose={() => setShowGateModal(false)} />
      </Suspense>
    </div>
  );
};

export default App;