import React from 'react';
import type { ThemeMode } from '../hooks/useTheme';
import { CIRCUIT_CONSTRAINTS } from '../logic/constants';

import { Undo2, Redo2, Trash2, Info, PanelLeftClose, PanelLeftOpen, Sun, Moon, Monitor } from 'lucide-react';

interface Props {
  numQubits: number;
  numColumns: number;
  canUndo: boolean;
  canRedo: boolean;
  numShots: number;
  themeMode: ThemeMode;
  sidebarCollapsed: boolean;
  onSetQubits: (n: number) => void;
  onSetColumns: (n: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onShowGates: () => void;
  onCycleTheme: () => void;
  onRunShots: () => void;
  onToggleSidebar: () => void;
}

const themeLabel = (mode: ThemeMode) => {
  if (mode === 'dark') return 'Dark';
  if (mode === 'light') return 'Light';
  return 'Auto';
};

const ThemeIcon = ({ mode, size }: { mode: ThemeMode, size: number }) => {
  if (mode === 'dark') return <Moon size={size} strokeWidth={2} className="btn-icon-svg" />;
  if (mode === 'light') return <Sun size={size} strokeWidth={2} className="btn-icon-svg" />;
  return <Monitor size={size} strokeWidth={2} className="btn-icon-svg" />;
};

const AppHeader: React.FC<Props> = ({
  numQubits,
  numColumns,
  canUndo,
  canRedo,
  numShots,
  themeMode,
  sidebarCollapsed,
  onSetQubits,
  onSetColumns,
  onUndo,
  onRedo,
  onClear,
  onShowGates,
  onCycleTheme,
  onRunShots,
  onToggleSidebar,
}) => {
  const canDecQubits = numQubits > CIRCUIT_CONSTRAINTS.MIN_QUBITS;
  const canIncQubits = numQubits < CIRCUIT_CONSTRAINTS.MAX_QUBITS;
  const canDecColumns = numColumns > CIRCUIT_CONSTRAINTS.MIN_COLUMNS;
  const canIncColumns = numColumns < CIRCUIT_CONSTRAINTS.MAX_COLUMNS;

  return (
    <header className="app-header">
      <h1 className="app-title">
        <span className="app-title-emphasis">Quantum</span>
        <span className="app-title-rest">Circuit Tutor</span>
      </h1>

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

      <div className="header-actions">
        <button className="btn btn-icon" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
          <Undo2 size={18} strokeWidth={2} className="btn-icon-svg" />
        </button>
        <button className="btn btn-icon" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
          <Redo2 size={18} strokeWidth={2} className="btn-icon-svg" />
        </button>
        <button className="btn btn-icon" onClick={onClear} title="Clear circuit" aria-label="Clear circuit">
          <Trash2 size={18} strokeWidth={2} className="btn-icon-svg" />
        </button>
        <div className="header-divider" />
        <button className="btn btn-icon" onClick={onShowGates} title="Gate reference" aria-label="Gate reference">
          <Info size={18} strokeWidth={2} className="btn-icon-svg" />
        </button>
        <button
          className="btn btn-icon"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? 'Show toolbox' : 'Hide toolbox'}
          aria-label={sidebarCollapsed ? 'Show toolbox' : 'Hide toolbox'}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen size={18} strokeWidth={2} className="btn-icon-svg" />
          ) : (
            <PanelLeftClose size={18} strokeWidth={2} className="btn-icon-svg" />
          )}
        </button>
        <button
          className="btn btn-icon"
          onClick={onCycleTheme}
          title={`Theme: ${themeLabel(themeMode)} (click to cycle)`}
          aria-label={`Theme: ${themeLabel(themeMode)}`}
        >
          <ThemeIcon mode={themeMode} size={18} />
        </button>
        <div className="header-divider" />
        <button className="btn btn-primary" onClick={onRunShots} title={`Run ${numShots} shots`}>
          Run
        </button>
      </div>
    </header>
  );
};

export default React.memo(AppHeader);
