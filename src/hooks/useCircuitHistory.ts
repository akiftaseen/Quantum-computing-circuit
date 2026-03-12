import { useReducer, useCallback } from 'react';
import type { CircuitState } from '../logic/circuitTypes';

interface HS { past: CircuitState[]; present: CircuitState; future: CircuitState[]; }
type HA = { type: 'SET'; c: CircuitState } | { type: 'UNDO' } | { type: 'REDO' } | { type: 'RESET'; c: CircuitState };

const MAX = 50;
const reducer = (s: HS, a: HA): HS => {
  switch (a.type) {
    case 'SET': return { past: [...s.past, s.present].slice(-MAX), present: a.c, future: [] };
    case 'UNDO': return s.past.length === 0 ? s : {
      past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future],
    };
    case 'REDO': return s.future.length === 0 ? s : {
      past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1),
    };
    case 'RESET': return { past: [], present: a.c, future: [] };
  }
};

export const useCircuitHistory = (init: CircuitState) => {
  const [s, d] = useReducer(reducer, { past: [], present: init, future: [] });
  return {
    circuit: s.present,
    setCircuit: useCallback((c: CircuitState) => d({ type: 'SET', c }), []),
    undo: useCallback(() => d({ type: 'UNDO' }), []),
    redo: useCallback(() => d({ type: 'REDO' }), []),
    reset: useCallback((c: CircuitState) => d({ type: 'RESET', c }), []),
    canUndo: s.past.length > 0,
    canRedo: s.future.length > 0,
  };
};