import React, { useState, useMemo, useCallback, useEffect } from 'react';
import './App.css';
import { type Complex, cAbs2, formatComplex } from './logic/complex';
import { runCircuit, runWithShots, computeUnitary2Q } from './logic/circuitRunner';
import { getBlochVector } from './logic/simulator';
import { exportToQiskit, exportToPennyLane } from './logic/qiskitExport';
import { serializeCircuit, deserializeCircuit, generateShareURL, loadFromURL } from './logic/circuitSerializer';
import { TEMPLATES } from './logic/templates';
import { useCircuitHistory } from './hooks/useCircuitHistory';
import type { CircuitState, PlacedGate, GateName } from './logic/circuitTypes';
import { isParametric, newGateId, gateDisplayName, isSingleQubit } from './logic/circuitTypes';

import GatePalette from './components/GatePalette';
import CircuitGrid from './components/CircuitGrid';
import ProbabilityChart from './components/ProbabilityChart';
import BlochSphere from './components/BlochSphere';
import DiracNotation from './components/DiracNotation';
import GateDetailsPanel from './components/GateDetailsPanel';
import ShotsHistogram from './components/ShotsHistogram';

const INIT: CircuitState = loadFromURL() || { numQubits: 2, numColumns: 10, gates: [] };

type Tab = 'prob' | 'bloch' | 'dirac' | 'math' | 'shots' | 'export';

const App: React.FC = () => {
  const { circuit, setCircuit, undo, redo, reset, canUndo, canRedo } = useCircuitHistory(INIT);
  const [stepCol, setStepCol] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('prob');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [numShots, setNumShots] = useState(1024);
  const [shotsResult, setShotsResult] = useState<Map<string, number> | null>(null);
  const [paramEdit, setParamEdit] = useState<{ id: string; value: number } | null>(null);
  const [showExportCode, setShowExportCode] = useState<string | null>(null);
  const [exportType, setExportType] = useState<'qiskit' | 'pennylane'>('qiskit');

  // Theme
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Z') { e.preventDefault(); redo(); }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId && !(e.target instanceof HTMLInputElement)) {
          e.preventDefault();
          handleRemoveGate(selectedId);
          setSelectedId(null);
        }
      }
      if (e.key === 'ArrowLeft') setStepCol(prev => prev === null ? circuit.numColumns - 2 : Math.max(0, prev - 1));
      if (e.key === 'ArrowRight') setStepCol(prev => prev === null ? 0 : prev >= circuit.numColumns - 1 ? null : prev + 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, undo, redo, circuit.numColumns]);

  // Live simulation
  const simResult = useMemo(() => {
    const col = stepCol ?? undefined;
    return runCircuit(circuit, col, true); // skip measurements in preview
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

  // Circuit mutations
  const handlePlaceGate = useCallback((g: Omit<PlacedGate, 'id'>) => {
    const newGate: PlacedGate = { ...g, id: newGateId() };
    setCircuit({
      ...circuit,
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
    if (n < 1 || n > 4) return;
    const filtered = circuit.gates.filter(g =>
      g.targets.every(t => t < n) && g.controls.every(c => c < n)
    );
    setCircuit({ ...circuit, numQubits: n, gates: filtered });
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

  const handleExport = (type: 'qiskit' | 'pennylane') => {
    setExportType(type);
    setShowExportCode(type === 'qiskit' ? exportToQiskit(circuit) : exportToPennyLane(circuit));
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
          reset(c);
          setSelectedId(null);
        } catch (e) { console.error('Invalid circuit file'); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleShare = () => {
    const url = generateShareURL(circuit);
    navigator.clipboard?.writeText(url);
  };

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
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <h1>⚛ Quantum Circuit Tutor</h1>
        <div className="header-controls">
          <label>Qubits:
            <select value={circuit.numQubits} onChange={e => handleSetQubits(+e.target.value)}>
              {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">↩ Undo</button>
          <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">↪ Redo</button>
          <button onClick={handleClear}>🗑 Clear</button>
          <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      <div className="app-body">
        {/* Sidebar */}
        <aside className="sidebar">
          <GatePalette />
          <div className="sidebar-section">
            <h3>Templates</h3>
            {TEMPLATES.map(t => (
              <button key={t.name} className="template-btn" onClick={() => handleTemplate(t.build)}>{t.name}</button>
            ))}
          </div>
        </aside>

        {/* Main */}
        <main className="main">
          {/* Circuit Grid */}
          <section className="card circuit-card">
            <CircuitGrid circuit={circuit} onPlace={handlePlaceGate} onRemove={handleRemoveGate}
              onUpdate={handleUpdateGate} selectedId={selectedId} onSelect={setSelectedId} stepCol={stepCol} />
            {/* Stepper */}
            <div className="stepper-row">
              <span className="stepper-label">Step:</span>
              <input type="range" min={0} max={maxStepCol + 1}
                value={stepCol === null ? maxStepCol + 1 : stepCol}
                onChange={e => { const v = +e.target.value; setStepCol(v > maxStepCol ? null : v); }}
                className="stepper-slider" />
              <span className="stepper-val">{stepCol === null ? 'All' : `Col ${stepCol}`}</span>
              <button className="shots-btn" onClick={handleRunShots}>▶ Run {numShots} shots</button>
              <input type="number" min={1} max={100000} value={numShots} onChange={e => setNumShots(+e.target.value)}
                className="shots-input" />
            </div>
          </section>

          {/* Param editor */}
          {paramEdit && selectedGate && (
            <section className="card param-card">
              <h4>{gateDisplayName[selectedGate.gate]} Parameter</h4>
              <div className="param-row">
                <input type="range" min={0} max={Math.PI * 4} step={0.01} value={paramEdit.value}
                  onChange={e => {
                    const v = +e.target.value;
                    setParamEdit({ ...paramEdit, value: v });
                    handleUpdateGate(paramEdit.id, { params: [v] });
                  }} />
                <input type="number" step={0.01} value={+(paramEdit.value / Math.PI).toFixed(4)}
                  onChange={e => {
                    const v = +e.target.value * Math.PI;
                    setParamEdit({ ...paramEdit, value: v });
                    handleUpdateGate(paramEdit.id, { params: [v] });
                  }} />
                <span>× π</span>
                <button onClick={() => { handleRemoveGate(paramEdit.id); setSelectedId(null); }}>🗑 Delete</button>
              </div>
            </section>
          )}

          {/* Gate Details */}
          {selectedGate && isSingleQubit(selectedGate.gate) && (
            <section className="card">
              <GateDetailsPanel gate={selectedGate} />
            </section>
          )}

          {/* Tabs */}
          <div className="tabs-bar">
            {TABS.map(t => (
              <button key={t.key} className={`tab-btn${tab === t.key ? ' active' : ''}`}
                onClick={() => setTab(t.key)}>{t.label}</button>
            ))}
          </div>

          <section className="card tab-content">
            {tab === 'prob' && <ProbabilityChart state={simResult.state} numQubits={circuit.numQubits} />}
            {tab === 'bloch' && (
              <div className="bloch-grid">
                {blochVectors.map((v, i) => <BlochSphere key={i} vector={v} label={`q${i}`} />)}
              </div>
            )}
            {tab === 'dirac' && <DiracNotation state={simResult.state} numQubits={circuit.numQubits} />}
            {tab === 'math' && (
              <div className="math-panel">
                {unitaryMatrix ? (
                  <div>
                    <h4>Overall Unitary ({circuit.numQubits <= 2 ? `${1 << circuit.numQubits}×${1 << circuit.numQubits}` : 'Too large'})</h4>
                    <table className="matrix-table">
                      <tbody>
                        {unitaryMatrix.map((row, i) => (
                          <tr key={i}>{row.map((z, j) => <td key={j} className="mat-cell">{formatComplex(z, 3)}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p>Unitary display available for ≤ 2 qubits.</p>}
              </div>
            )}
            {tab === 'shots' && (
              <div>
                {shotsResult ? (
                  <ShotsHistogram histogram={shotsResult} numQubits={circuit.numQubits} totalShots={numShots} />
                ) : <p>Click "Run shots" to sample measurement outcomes.</p>}
              </div>
            )}
            {tab === 'export' && (
              <div className="export-panel">
                <div className="export-buttons">
                  <button onClick={() => handleExport('qiskit')}>📋 Qiskit Code</button>
                  <button onClick={() => handleExport('pennylane')}>📋 PennyLane Code</button>
                  <button onClick={handleSaveJSON}>💾 Save JSON</button>
                  <button onClick={handleLoadJSON}>📂 Load JSON</button>
                  <button onClick={handleShare}>🔗 Copy Share URL</button>
                </div>
                {showExportCode && (
                  <div className="export-code">
                    <h4>{exportType === 'qiskit' ? 'Qiskit' : 'PennyLane'} Code</h4>
                    <pre>{showExportCode}</pre>
                  </div>
                )}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
};
export default App;