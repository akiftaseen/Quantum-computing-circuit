import { useReducer, useCallback } from 'react';
import type { CircuitState } from '../logic/circuitTypes';

interface HS { past: CircuitState[]; present: CircuitState; future: CircuitState[]; }
type CircuitUpdater = CircuitState | ((prev: CircuitState) => CircuitState);
type HA = { type: 'SET'; c: CircuitUpdater } | { type: 'UNDO' } | { type: 'REDO' } | { type: 'RESET'; c: CircuitState };

const MAX = 50;
const reducer = (s: HS, a: HA): HS => {
  switch (a.type) {
    case 'SET': {
      const next = typeof a.c === 'function'
        ? (a.c as (prev: CircuitState) => CircuitState)(s.present)
        : a.c;
      return { past: [...s.past, s.present].slice(-MAX), present: next, future: [] };
    }
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

  const setCircuit = useCallback((next: CircuitUpdater) => d({ type: 'SET', c: next }), []);

  return {
    circuit: s.present,
    setCircuit,
    undo: useCallback(() => d({ type: 'UNDO' }), []),
    redo: useCallback(() => d({ type: 'REDO' }), []),
    reset: useCallback((c: CircuitState) => d({ type: 'RESET', c }), []),
    canUndo: s.past.length > 0,
    canRedo: s.future.length > 0,
  };
};