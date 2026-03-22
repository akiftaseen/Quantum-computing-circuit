import React from 'react';
import type { ThemeMode } from '../hooks/useTheme';

interface Props {
  numQubits: number;
  numColumns: number;
  canUndo: boolean;
  canRedo: boolean;
  numShots: number;
  themeMode: ThemeMode;
  onSetQubits: (n: number) => void;
  onSetColumns: (n: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onShowGates: () => void;
  onCycleTheme: () => void;
  onRunShots: () => void;
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
  onSetQubits,
  onSetColumns,
  onUndo,
  onRedo,
  onClear,
  onShowGates,
  onCycleTheme,
  onRunShots,
}) => {
  return (
    <header className="app-header">
      <h1>Quantum Circuit Tutor</h1>

      <div className="header-adjuster">
        <button onClick={() => onSetQubits(numQubits - 1)}>−</button>
        <span>{numQubits} qubits</span>
        <button onClick={() => onSetQubits(numQubits + 1)}>+</button>
      </div>

      <div className="header-adjuster">
        <button onClick={() => onSetColumns(numColumns - 2)}>−</button>
        <span>{numColumns} cols</span>
        <button onClick={() => onSetColumns(numColumns + 2)}>+</button>
      </div>

      <div className="header-spacer" />

      <button className="btn" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">Undo</button>
      <button className="btn" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">Redo</button>
      <button className="btn" onClick={onClear}>Clear</button>
      <button className="btn" onClick={onShowGates} title="Gate reference">Gate Reference</button>
      <button className="btn" onClick={onCycleTheme} title="Cycle theme mode">
        {themeLabel(themeMode)}
      </button>
      <button className="btn btn-primary" onClick={onRunShots}>Run {numShots} shots</button>
    </header>
  );
};

export default React.memo(AppHeader);
