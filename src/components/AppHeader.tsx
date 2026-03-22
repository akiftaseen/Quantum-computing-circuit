import React from 'react';
import type { ThemeMode } from '../hooks/useTheme';
import { CIRCUIT_CONSTRAINTS } from '../logic/constants';

interface Props {
  numQubits: number;
  numColumns: number;
  canUndo: boolean;
  canRedo: boolean;
  numShots: number;
  themeMode: ThemeMode;
  sidebarCollapsed: boolean;
  compactMode: boolean;
  onSetQubits: (n: number) => void;
  onSetColumns: (n: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onShowGates: () => void;
  onCycleTheme: () => void;
  onRunShots: () => void;
  onToggleSidebar: () => void;
  onToggleCompactMode: () => void;
}

const themeLabel = (mode: ThemeMode) => {
  if (mode === 'dark') return 'Dark';
  if (mode === 'light') return 'Light';
  return 'Auto';
};

const AppHeader: React.FC<Props> = ({
  numQubits,
  numColumns,
  canUndo,
  canRedo,
  numShots,
  themeMode,
  sidebarCollapsed,
  compactMode,
  onSetQubits,
  onSetColumns,
  onUndo,
  onRedo,
  onClear,
  onShowGates,
  onCycleTheme,
  onRunShots,
  onToggleSidebar,
  onToggleCompactMode,
}) => {
  const canDecQubits = numQubits > CIRCUIT_CONSTRAINTS.MIN_QUBITS;
  const canIncQubits = numQubits < CIRCUIT_CONSTRAINTS.MAX_QUBITS;
  const canDecColumns = numColumns > CIRCUIT_CONSTRAINTS.MIN_COLUMNS;
  const canIncColumns = numColumns < CIRCUIT_CONSTRAINTS.MAX_COLUMNS;

  return (
    <header className="app-header">
      <h1>Quantum Circuit Tutor</h1>

      <div className="header-adjuster" aria-label="Qubit count control">
        <button aria-label="Decrease qubits" disabled={!canDecQubits} onClick={() => onSetQubits(numQubits - 1)}>−</button>
        <span>{numQubits} qubits</span>
        <button aria-label="Increase qubits" disabled={!canIncQubits} onClick={() => onSetQubits(numQubits + 1)}>+</button>
      </div>

      <div className="header-adjuster" aria-label="Column count control">
        <button aria-label="Decrease columns" disabled={!canDecColumns} onClick={() => onSetColumns(numColumns - 2)}>−</button>
        <span>{numColumns} cols</span>
        <button aria-label="Increase columns" disabled={!canIncColumns} onClick={() => onSetColumns(numColumns + 2)}>+</button>
      </div>

      <div className="header-spacer" />

      <button className="btn" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">Undo</button>
      <button className="btn" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">Redo</button>
      <button className="btn" onClick={onClear}>Clear</button>
      <button className="btn" onClick={onShowGates} title="Gate reference">Gate Reference</button>
      <button className="btn" onClick={onToggleSidebar} title="Toggle toolbox sidebar">
        {sidebarCollapsed ? 'Show Tools' : 'Hide Tools'}
      </button>
      <button className={`btn${compactMode ? ' btn-primary' : ''}`} onClick={onToggleCompactMode} title="Toggle compact layout">
        Compact {compactMode ? 'On' : 'Off'}
      </button>
      <button className="btn" onClick={onCycleTheme} title="Cycle theme mode">
        {themeLabel(themeMode)}
      </button>
      <button className="btn btn-primary" onClick={onRunShots}>Run {numShots} shots</button>
    </header>
  );
};

export default React.memo(AppHeader);
