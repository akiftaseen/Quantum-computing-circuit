import React, { lazy, Suspense, useState, useMemo, useCallback, useEffect } from 'react';
import './App.css';
import { formatComplex } from './logic/complex';
import { runCircuit, runWithShots, runWithNoiseShots, computeUnitary2Q } from './logic/circuitRunner';
import { getBlochVector } from './logic/simulator';
import { loadFromURL } from './logic/circuitSerializer';
import { TEMPLATES } from './logic/templates';
import { useCircuitHistory } from './hooks/useCircuitHistory';
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
import SaveSlotsPanel from './components/SaveSlotsPanel';

const BlochSphere = lazy(() => import('./components/BlochSphere'));
const DiracNotation = lazy(() => import('./components/DiracNotation'));
const GateDescriptionsModal = lazy(() => import('./components/GateDescriptionsModal'));
const CircuitAnalysisPanel = lazy(() => import('./components/CircuitAnalysisPanel'));
const LearningPanel = lazy(() => import('./components/LearningPanel'));
const WalkthroughPanel = lazy(() => import('./components/WalkthroughPanel'));
const BasisExplorerPanel = lazy(() => import('./components/BasisExplorerPanel'));

const INIT: CircuitState = loadFromURL() || { numQubits: 2, numColumns: 10, gates: [] };

type Tab = 'prob' | 'bloch' | 'dirac' | 'math' | 'shots' | 'analysis' | 'learn' | 'walkthrough' | 'basis';

const App: React.FC = () => {
  const { circuit, setCircuit, undo, redo, reset, canUndo, canRedo } = useCircuitHistory(INIT);
  const { mode: themeMode, cycleThemeMode } = useTheme();
  const [stepCol, setStepCol] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('prob');
  const [numShots, setNumShots] = useState(1024);
  const [shotsResult, setShotsResult] = useState<Map<string, number> | null>(null);
  const [noisyShotsResult, setNoisyShotsResult] = useState<Map<string, number> | null>(null);
  const [noise, setNoise] = useState<NoiseConfig>(defaultNoise);
  const [paramEdit, setParamEdit] = useState<{ id: string; value: number } | null>(null);
  const [showGateModal, setShowGateModal] = useState(false);

  // Keyboard shortcuts are defined after handlers to avoid stale references.

  // Live simulation
  const simResult = useMemo(() => {
    const col = stepCol ?? undefined;
    return runCircuit(circuit, col, true);
  }, [circuit, stepCol]);

  const blochVectors = useMemo(() =>
    Array.from({ length: circuit.numQubits }, (_, i) =>
      getBlochVector(simResult.state, i, circuit.numQubits)
    ), [simResult.state, circuit.numQubits]);

  const unitaryMatrix = useMemo(() =>
    circuit.numQubits <= 2 ? computeUnitary2Q(circuit) : null,
  [circuit]);

  const selectedGate = useMemo(() =>
    circuit.gates.find(g => g.id === selectedId) ?? null,
  [circuit.gates, selectedId]);

  // ──── Circuit mutations ────

  const handlePlaceGate = useCallback((g: Omit<PlacedGate, 'id'>) => {
    const newGate: PlacedGate = { ...g, id: newGateId() };
    // Auto-expand columns when placing near the end
    let cols = circuit.numColumns;
    if (newGate.column >= cols - 2) {
      cols = newGate.column + 4;
    }
    setCircuit({
      ...circuit,
      numColumns: cols,
      gates: circuit.gates.filter(
        x => !(x.column === newGate.column && x.targets.some(t => newGate.targets.includes(t)) && x.controls.length === 0 && newGate.controls.length === 0)
      ).concat(newGate),
    });
  }, [circuit, setCircuit]);

  const handleRemoveGate = useCallback((id: string) => {
    setCircuit({ ...circuit, gates: circuit.gates.filter(g => g.id !== id) });
  }, [circuit, setCircuit]);

  const handleUpdateGate = useCallback((id: string, updates: Partial<PlacedGate>) => {
    setCircuit({
      ...circuit,
      gates: circuit.gates.map(g => g.id === id ? { ...g, ...updates } : g),
    });
  }, [circuit, setCircuit]);

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
    const hist = runWithShots(circuit, numShots);
    setShotsResult(hist);
    setNoisyShotsResult(runWithNoiseShots(circuit, numShots, noise));
    setTab('shots');
  };

  const handleClear = () => { reset({ ...circuit, gates: [] }); setSelectedId(null); setShotsResult(null); setNoisyShotsResult(null); setStepCol(null); };

  const handleTemplate = (build: () => CircuitState) => {
    const c = build();
    reset(c);
    setSelectedId(null);
    setShotsResult(null);
    setNoisyShotsResult(null);
    setStepCol(null);
  };

  const handleLoadTemplateByName = (name: string) => {
    const template = TEMPLATES.find((t) => t.name === name);
    if (!template) return;
    handleTemplate(template.build);
  };

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
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

  // Parametric gate editor
  useEffect(() => {
    if (selectedGate && isParametric(selectedGate.gate)) {
      setParamEdit({ id: selectedGate.id, value: selectedGate.params[0] ?? Math.PI / 2 });
    } else {
      setParamEdit(null);
    }
  }, [selectedId, selectedGate]);

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

    return {
      idealTop,
      idealTopProb,
      noisyTop,
      noisyTopProb,
      tvDistance: 0.5 * l1,
    };
  }, [shotsResult, noisyShotsResult, numShots, circuit.numQubits]);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'prob', label: 'Probabilities' },
    { key: 'bloch', label: 'Bloch Spheres' },
    { key: 'dirac', label: 'Dirac ⟨ψ|' },
    { key: 'math', label: 'Math Lens' },
    { key: 'shots', label: 'Shots' },
    { key: 'analysis', label: 'Analysis' },
    { key: 'learn', label: 'Learning Studio' },
    { key: 'walkthrough', label: 'Guided Lab' },
    { key: 'basis', label: 'Basis Explorer' },
  ];

  return (
    <div className="app-shell">
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
      />

      {/* ─── Body ─── */}
      <div className="app-body">
        {/* ─── Left Sidebar ─── */}
        <aside className="sidebar">
          <GatePalette />
          <div className="sidebar-section">
            <h3 className="sidebar-heading">Templates</h3>
            {TEMPLATES.map(t => (
              <button key={t.name} className="template-btn" onClick={() => handleTemplate(t.build)}>{t.name}</button>
            ))}
          </div>
          <div className="sidebar-section">
            <SaveSlotsPanel
              circuit={circuit}
              onLoadCircuit={(saved) => {
                reset(saved);
                setSelectedId(null);
                setShotsResult(null);
                setNoisyShotsResult(null);
                setStepCol(null);
              }}
            />
          </div>
        </aside>

        {/* ─── Main Area ─── */}
        <div className="main-area">
          {/* ─── Circuit Canvas ─── */}
          <div className="circuit-scroll">
            <CircuitGrid
              circuit={circuit}
              onPlace={handlePlaceGate}
              onRemove={handleRemoveGate}
              onUpdate={handleUpdateGate}
              selectedId={selectedId}
              onSelect={setSelectedId}
              stepCol={stepCol}
            />
            {/* Stepper bar */}
            <div className="stepper-row">
              <span className="stepper-label">Step:</span>
              <input
                type="range"
                min={0}
                max={maxStepCol + 1}
                value={stepCol === null ? maxStepCol + 1 : stepCol}
                onChange={e => { const v = +e.target.value; setStepCol(v > maxStepCol ? null : v); }}
                className="stepper-slider"
              />
              <span className="stepper-val">{stepCol === null ? 'All' : `Col ${stepCol}`}</span>
              <input
                type="number"
                min={1}
                max={100000}
                value={numShots}
                onChange={e => setNumShots(+e.target.value)}
                className="shots-input"
              />
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
                    setParamEdit({ ...paramEdit, value: v });
                    handleUpdateGate(paramEdit.id, { params: [v] });
                  }}
                />
                <input
                  type="number"
                  step={0.01}
                  value={+(paramEdit.value / Math.PI).toFixed(4)}
                  onChange={e => {
                    const v = +e.target.value * Math.PI;
                    setParamEdit({ ...paramEdit, value: v });
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
            <div className="results-tabs">
              {TABS.map(t => (
                <button
                  key={t.key}
                  className={`results-tab${tab === t.key ? ' active' : ''}`}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="results-content">
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
                      <h4>Overall Unitary ({circuit.numQubits <= 2 ? `${1 << circuit.numQubits}×${1 << circuit.numQubits}` : 'Too large'})</h4>
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
                  ) : (
                    <p className="empty-msg">Unitary display available for ≤ 2 qubits.</p>
                  )}
                </div>
              )}

              {tab === 'shots' && (
                <div className="shots-panel">
                  <p className="shots-subtitle">
                    Sample computational-basis outcomes and inspect how hardware-style noise shifts the distribution.
                  </p>

                  <div className="noise-controls">
                    <label>
                      <span>Depolarizing</span>
                      <input type="range" min={0} max={0.2} step={0.005} value={noise.depolarizing1q}
                        onChange={(e) => setNoise((prev) => ({ ...prev, depolarizing1q: Number(e.target.value) }))} />
                      <strong className="noise-value">{toPct(noise.depolarizing1q)}</strong>
                    </label>
                    <label>
                      <span>Amplitude damping</span>
                      <input type="range" min={0} max={0.2} step={0.005} value={noise.amplitudeDamping}
                        onChange={(e) => setNoise((prev) => ({ ...prev, amplitudeDamping: Number(e.target.value) }))} />
                      <strong className="noise-value">{toPct(noise.amplitudeDamping)}</strong>
                    </label>
                    <label>
                      <span>Readout error</span>
                      <input type="range" min={0} max={0.15} step={0.005} value={noise.readoutError}
                        onChange={(e) => setNoise((prev) => ({ ...prev, readoutError: Number(e.target.value) }))} />
                      <strong className="noise-value">{toPct(noise.readoutError)}</strong>
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
                          </div>

                          <div className="shots-summary-card">
                            <div className="shots-summary-label">Top noisy outcome</div>
                            <div className="shots-summary-value">
                              {shotsInsights.noisyTop ? `|${shotsInsights.noisyTop}⟩` : 'n/a'}
                            </div>
                            <div className="shots-summary-note">{toPct(shotsInsights.noisyTopProb)} of samples</div>
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
                      <p className="shots-empty-note">Tip: use 512 to 4096 shots for stable comparisons.</p>
                    </div>
                  )}
                </div>
              )}

              {tab === 'analysis' && (
                <div className="analysis-tab-wrap">
                  <Suspense fallback={<p className="empty-msg">Loading analysis...</p>}>
                    <CircuitAnalysisPanel circuit={circuit} />
                  </Suspense>
                </div>
              )}

              {tab === 'learn' && (
                <Suspense fallback={<p className="empty-msg">Loading learning guides...</p>}>
                  <LearningPanel onUseTemplate={handleLoadTemplateByName} />
                </Suspense>
              )}

              {tab === 'walkthrough' && (
                <Suspense fallback={<p className="empty-msg">Loading walkthrough...</p>}>
                  <WalkthroughPanel
                    circuit={circuit}
                    shotsResult={shotsResult}
                    onRunShots={handleRunShots}
                    onLoadTemplate={handleLoadTemplateByName}
                  />
                </Suspense>
              )}

              {tab === 'basis' && (
                <Suspense fallback={<p className="empty-msg">Loading basis explorer...</p>}>
                  <BasisExplorerPanel
                    state={simResult.state}
                    numQubits={circuit.numQubits}
                  />
                </Suspense>
              )}

            </div>
          </div>
        </div>
      </div>
      <Suspense fallback={null}>
        <GateDescriptionsModal isOpen={showGateModal} onClose={() => setShowGateModal(false)} />
      </Suspense>
    </div>
  );
};

export default App;