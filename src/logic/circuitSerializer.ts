import type { CircuitState, GateName, PlacedGate } from './circuitTypes';
import { newGateId } from './circuitTypes';

type MaybeGate = {
  id?: string;
  gate?: GateName;
  column?: number;
  targets?: number[];
  controls?: number[];
  params?: number[];
  classicalBit?: number;
  condition?: number;
  qubit?: number;
} & Record<string, unknown>;

type MaybeCircuit = {
  numQubits?: number;
  numColumns?: number;
  gates?: MaybeGate[];
};

const deserializeCircuit = (json: string): CircuitState => {
  const p = JSON.parse(json) as MaybeCircuit;
  const gates: PlacedGate[] = (p.gates ?? []).map((g) => ({
    id: g.id ?? newGateId(),
    gate: g.gate ?? 'I',
    column: g.column ?? 0,
    targets: g.targets ?? [g.qubit ?? 0],
    controls: g.controls ?? [],
    params: g.params ?? [],
    ...(typeof g.classicalBit === 'number' ? { classicalBit: g.classicalBit } : {}),
    ...(typeof g.condition === 'number' ? { condition: g.condition } : {}),
  }));

  return {
    numQubits: p.numQubits ?? 2,
    numColumns: p.numColumns ?? 10,
    gates,
  };
};

const decodeFromURL = (s: string): CircuitState =>
  deserializeCircuit(decodeURIComponent(escape(atob(s))));

export const loadFromURL = (): CircuitState | null => {
  const p = new URLSearchParams(location.search).get('circuit');
  if (!p) return null;
  try { return decodeFromURL(p); } catch { return null; }
};