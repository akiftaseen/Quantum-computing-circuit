import React, { useState, useMemo, useCallback, useEffect } from 'react';
import './App.css';
import { formatComplex } from './logic/complex';
import { runCircuit, runWithShots, computeUnitary2Q } from './logic/circuitRunner';
import { getBlochVector } from './logic/simulator';
import { exportToQiskit, exportToPennyLane, exportToCirq, exportToLatex, importFromQASM } from './logic/qiskitExport';
import { serializeCircuit, deserializeCircuit, generateShareURL, loadFromURL } from './logic/circuitSerializer';
import { TEMPLATES } from './logic/templates';
import { useCircuitHistory } from './hooks/useCircuitHistory';
import { useTheme } from './hooks/useTheme';
import type { CircuitState, PlacedGate } from './logic/circuitTypes';
import { isParametric, newGateId, gateDisplayName, isSingleQubit } from './logic/circuitTypes';
import { validateCircuit, validateQubitCount, validateColumnCount } from './logic/validation';

import GatePalette from './components/GatePalette';
import CircuitGrid from './components/CircuitGrid';
import ProbabilityChart from './components/ProbabilityChart';
import BlochSphere from './components/BlochSphere';
import DiracNotation from './components/DiracNotation';
import GateDetailsPanel from './components/GateDetailsPanel';
import ShotsHistogram from './components/ShotsHistogram';
import GateDescriptionsModal from './components/GateDescriptionsModal';
import CircuitAnalysisPanel from './components/CircuitAnalysisPanel';
import AppHeader from './components/AppHeader';
import ExportPanel from './components/ExportPanel';

const INIT: CircuitState = loadFromURL() || { numQubits: 2, numColumns: 10, gates: [] };

type Tab = 'prob' | 'bloch' | 'dirac' | 'math' | 'shots' | 'export';

const App: React.FC = () => {
  const { circuit, setCircuit, undo, redo, reset, canUndo, canRedo } = useCircuitHistory(INIT);
  const { mode: themeMode, cycleThemeMode } = useTheme();
  const [stepCol, setStepCol] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('prob');
  const [numShots, setNumShots] = useState(1024);
  const [shotsResult, setShotsResult] = useState<Map<string, number> | null>(null);
  const [paramEdit, setParamEdit] = useState<{ id: string; value: number } | null>(null);
  const [showExportCode, setShowExportCode] = useState<string | null>(null);
  const [exportType, setExportType] = useState<'qiskit' | 'pennylane' | 'cirq' | 'latex'>('qiskit');
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
    setTab('shots');
  };

  const handleClear = () => { reset({ ...circuit, gates: [] }); setSelectedId(null); setShotsResult(null); setStepCol(null); };

  const handleTemplate = (build: () => CircuitState) => {
    const c = build();
    reset(c);
    setSelectedId(null);
    setShotsResult(null);
    setStepCol(null);
  };

  const handleExport = (type: 'qiskit' | 'pennylane' | 'cirq' | 'latex') => {
    setExportType(type);
    if (type === 'qiskit') {
      setShowExportCode(exportToQiskit(circuit));
      return;
    }
    if (type === 'pennylane') {
      setShowExportCode(exportToPennyLane(circuit));
      return;
    }
    if (type === 'cirq') {
      setShowExportCode(exportToCirq(circuit));
      return;
    }
    setShowExportCode(exportToLatex(circuit));
  };

  const handleSaveJSON = () => {
    const blob = new Blob([serializeCircuit(circuit)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'quantum-circuit.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadJSON = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const c = deserializeCircuit(reader.result as string);
          const errors = validateCircuit(c);
          if (errors.length > 0) {
            alert(`Circuit validation errors:\n${errors.map(e => e.message).join('\n')}`);
            return;
          }
          reset(c);
          setSelectedId(null);
        } catch (e) { 
          alert(`Failed to load circuit: ${e instanceof Error ? e.message : 'Unknown error'}`);
          console.error('Invalid circuit file', e); 
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleShare = () => {
    const url = generateShareURL(circuit);
    navigator.clipboard?.writeText(url);
  };

  const handleLoadQASM = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.qasm,.txt';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = importFromQASM(String(reader.result ?? ''));
          const errors = validateCircuit(imported);
          if (errors.length > 0) {
            alert(`QASM import validation errors:\n${errors.map((e) => e.message).join('\n')}`);
            return;
          }
          reset(imported);
          setSelectedId(null);
          setStepCol(null);
          setShotsResult(null);
        } catch (err) {
          alert(`Failed to import QASM: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
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

  const TABS: { key: Tab; label: string }[] = [
    { key: 'prob', label: 'Probabilities' },
    { key: 'bloch', label: 'Bloch Spheres' },
    { key: 'dirac', label: 'Dirac ⟨ψ|' },
    { key: 'math', label: 'Math Lens' },
    { key: 'shots', label: 'Shots' },
    { key: 'export', label: 'Export' },
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
            <CircuitAnalysisPanel circuit={circuit} />
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
                <div className="bloch-grid">
                  {blochVectors.map((v, i) => (
                    <BlochSphere key={i} vector={v} label={`q${i}`} />
                  ))}
                </div>
              )}

              {tab === 'dirac' && (
                <DiracNotation state={simResult.state} numQubits={circuit.numQubits} />
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
                <div>
                  {shotsResult ? (
                    <ShotsHistogram histogram={shotsResult} numQubits={circuit.numQubits} totalShots={numShots} />
                  ) : (
                    <p className="empty-msg">Click "▶ Run" to sample measurement outcomes.</p>
                  )}
                </div>
              )}

              {tab === 'export' && (
                <ExportPanel
                  exportType={exportType}
                  code={showExportCode}
                  onExportQiskit={() => handleExport('qiskit')}
                  onExportPennyLane={() => handleExport('pennylane')}
                  onExportCirq={() => handleExport('cirq')}
                  onExportLatex={() => handleExport('latex')}
                  onSaveJSON={handleSaveJSON}
                  onLoadJSON={handleLoadJSON}
                  onLoadQASM={handleLoadQASM}
                  onShare={handleShare}
                />
              )}
            </div>
          </div>
        </div>
      </div>
      <GateDescriptionsModal isOpen={showGateModal} onClose={() => setShowGateModal(false)} />
    </div>
  );
};

export default App;