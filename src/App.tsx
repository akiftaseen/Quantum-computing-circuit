import React, { useState } from 'react';
import './App.css';

import { type Complex, formatComplex, cAbs2 } from './logic/complex';
import ProbabilityChart from './components/ProbabilityChart';

import type { SimpleCircuit, PlacedGate } from './logic/circuitTypes';
import { runSimpleCircuit } from './logic/circuitRunner';

import GatePalette from './components/GatePalette';
import CircuitGrid from './components/CircuitGrid';

const NUM_QUBITS = 1;
const NUM_COLUMNS = 8;

const App: React.FC = () => {
  // Circuit: gates placed on a 1-qubit timeline
  const [circuit, setCircuit] = useState<SimpleCircuit>({
    numQubits: NUM_QUBITS,
    numColumns: NUM_COLUMNS,
    gates: [],
  });

  // Quantum state resulting from "Run"
  const [state, setState] = useState<Complex[] | null>(null);

  const handlePlaceGate = (gateWithoutId: Omit<PlacedGate, 'id'>) => {
    const newGate: PlacedGate = {
      ...gateWithoutId,
      id: Math.random().toString(36).slice(2),
    };

    // If the same cell already has a gate, overwrite it
    setCircuit((prev) => {
      const filtered = prev.gates.filter(
        (g) => !(g.qubit === newGate.qubit && g.column === newGate.column)
      );
      return {
        ...prev,
        gates: [...filtered, newGate],
      };
    });
  };

  const handleRun = () => {
    const result = runSimpleCircuit(circuit);
    setState(result);
  };

  const handleClear = () => {
    setCircuit((prev) => ({ ...prev, gates: [] }));
    setState(null);
  };

  const dim = 1 << NUM_QUBITS;
  const currentState = state;

  return (
    <div className="app-container">
      <div className="sidebar">
        <GatePalette />
        <div className="controls">
          <button onClick={handleRun}>Run Circuit</button>
          <button onClick={handleClear}>Clear Circuit</button>
        </div>
      </div>

      <div className="main-panel">
        <div className="card">
          <h1>Drag-and-Drop Quantum Circuit — 1 Qubit</h1>
          <p>
            Drag H / X / Z from the left palette onto the timeline, then click
            &quot;Run Circuit&quot; to observe the final statevector and
            probabilities.
          </p>
        </div>

        <div className="card">
          <h2>Circuit Timeline</h2>
          <CircuitGrid circuit={circuit} onPlaceGate={handlePlaceGate} />
        </div>

        <div className="card">
          <h2>Statevector (Dirac notation)</h2>
          {currentState ? (
            <div className="state-list">
              {Array.from({ length: dim }, (_, i) => {
                const basis = i.toString(2).padStart(NUM_QUBITS, '0');
                const amp = currentState[i];
                const prob = cAbs2(amp);
                return (
                  <div key={i} className="state-row">
                    <span>{`|${basis}⟩`}</span>
                    <span>
                      {formatComplex(amp, 3)}{' '}
                      <span style={{ opacity: 0.7 }}>
                        (p = {prob.toFixed(3)})
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p>
              Not run yet. Place some gates on the timeline first, then click
              &quot;Run Circuit&quot;.
            </p>
          )}
        </div>

        <div className="card">
          <h2>Probability Bar Chart</h2>
          {currentState ? (
            <ProbabilityChart state={currentState} numQubits={NUM_QUBITS} />
          ) : (
            <p>No data yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;