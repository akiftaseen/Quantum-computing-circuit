import React, { lazy, Suspense, useState, useMemo, useCallback, useEffect } from 'react';
import './App.css';
import { formatComplex } from './logic/complex';
import { runCircuit, runWithShots, runWithNoiseShots, computeUnitary } from './logic/circuitRunner';
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

const BlochSphere = lazy(() => import('./components/BlochSphere'));
const DiracNotation = lazy(() => import('./components/DiracNotation'));
const GateDescriptionsModal = lazy(() => import('./components/GateDescriptionsModal'));
const CircuitAnalysisPanel = lazy(() => import('./components/CircuitAnalysisPanel'));
const QuantumStateInsightsPanel = lazy(() => import('./components/QuantumStateInsightsPanel'));

const INIT: CircuitState = loadFromURL() || { numQubits: 2, numColumns: 10, gates: [] };

type Tab = 'prob' | 'bloch' | 'dirac' | 'math' | 'shots' | 'analysis' | 'state';

const App: React.FC = () => {
  const { circuit, setCircuit, undo, redo, reset, canUndo, canRedo } = useCircuitHistory(INIT);
  const { mode: themeMode, cycleThemeMode } = useTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [stepCol, setStepCol] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('prob');
  const [numShots, setNumShots] = useState(1024);
  const [shotsResult, setShotsResult] = useState<Map<string, number> | null>(null);
  const [noisyShotsResult, setNoisyShotsResult] = useState<Map<string, number> | null>(null);
  const [noise, setNoise] = useState<NoiseConfig>(defaultNoise);
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

  const unitaryMatrix = useMemo(() => computeUnitary(circuit), [circuit]);

  const selectedGate = useMemo(() =>
    circuit.gates.find(g => g.id === selectedId) ?? null,
  [circuit.gates, selectedId]);

  const paramEdit = useMemo(() => {
    if (!selectedGate || !isParametric(selectedGate.gate)) return null;
    return { id: selectedGate.id, value: selectedGate.params[0] ?? Math.PI / 2 };
  }, [selectedGate]);

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
    const effectiveNoise: NoiseConfig = {
      ...noise,
      enabled: noise.depolarizing1q > 0 || noise.amplitudeDamping > 0 || noise.readoutError > 0,
    };
    const hist = runWithShots(circuit, numShots);
    setShotsResult(hist);
    setNoisyShotsResult(runWithNoiseShots(circuit, numShots, effectiveNoise));
    setNoise(effectiveNoise);
    setTab('shots');
  };

  const updateNoise = (patch: Partial<NoiseConfig>) => {
    setNoise((prev) => {
      const next: NoiseConfig = { ...prev, ...patch };
      next.enabled = next.depolarizing1q > 0 || next.amplitudeDamping > 0 || next.readoutError > 0;
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

  const handleClear = () => { reset({ ...circuit, gates: [] }); setSelectedId(null); setShotsResult(null); setNoisyShotsResult(null); setStepCol(null); };

  const handleTemplate = (build: () => CircuitState) => {
    const c = build();
    reset(c);
    setSelectedId(null);
    setShotsResult(null);
    setNoisyShotsResult(null);
    setStepCol(null);
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

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'prob', label: 'Probabilities', icon: '◎' },
    { key: 'bloch', label: 'Bloch Spheres', icon: '◔' },
    { key: 'dirac', label: 'Dirac ⟨ψ|', icon: 'ψ' },
    { key: 'math', label: 'Math Lens', icon: 'U' },
    { key: 'shots', label: 'Shots', icon: 'N' },
    { key: 'analysis', label: 'Analysis', icon: '∆' },
    { key: 'state', label: 'State Lens', icon: 'ρ' },
  ];

  return (
    <div className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
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

      {/* ─── Body ─── */}
      <div className="app-body">
        {/* ─── Left Sidebar ─── */}
        <aside className="sidebar" aria-hidden={sidebarCollapsed}>
          <GatePalette />
          <div className="sidebar-section">
            <h3 className="sidebar-heading">Templates</h3>
            <p className="sidebar-note">Load a circuit blueprint, then customize gates and run shots.</p>
            {TEMPLATES.map(t => (
              <button key={t.name} className="template-btn" onClick={() => handleTemplate(t.build)}>{t.name}</button>
            ))}
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
            <div className="results-tabs">
              {TABS.map(t => (
                <button
                  key={t.key}
                  className={`results-tab${tab === t.key ? ' active' : ''}`}
                  onClick={() => setTab(t.key)}
                >
                  <span className="results-tab-icon" aria-hidden="true">{t.icon}</span>
                  <span>{t.label}</span>
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
                      Sample computational-basis outcomes and inspect how hardware-style noise shifts the distribution.
                    </p>
                    <div className="shots-header-actions">
                      <span className={`shots-noise-state${noise.enabled ? ' on' : ''}`}>
                        Noise {noise.enabled ? 'ON' : 'OFF'}
                      </span>
                      <button className="btn" onClick={resetNoise} disabled={!noise.enabled}>Reset Noise</button>
                    </div>
                  </div>

                  <div className="noise-controls">
                    <label>
                      <span>Depolarizing</span>
                      <input type="range" min={0} max={0.2} step={0.005} value={noise.depolarizing1q}
                        className="ui-slider"
                        aria-label="Depolarizing noise"
                        onChange={(e) => updateNoise({ depolarizing1q: Number(e.target.value) })} />
                      <strong className="noise-value">{toPct(noise.depolarizing1q)}</strong>
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
                      <p className="shots-empty-note">Tip: default is 1024 shots; try 512 to 4096 for stable comparisons.</p>
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

              {tab === 'state' && (
                <Suspense fallback={<p className="empty-msg">Loading state insights...</p>}>
                  <QuantumStateInsightsPanel
                    state={simResult.state}
                    numQubits={circuit.numQubits}
                    shotsResult={shotsResult}
                    noisyShotsResult={noisyShotsResult}
                    noiseEnabled={noise.enabled}
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