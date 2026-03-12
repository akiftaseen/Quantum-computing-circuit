import type { CircuitState } from './circuitTypes';

export const serializeCircuit = (c: CircuitState): string => JSON.stringify(c);

export const deserializeCircuit = (json: string): CircuitState => {
  const p = JSON.parse(json);
  return {
    numQubits: p.numQubits ?? 2,
    numColumns: p.numColumns ?? 10,
    gates: (p.gates ?? []).map((g: any) => ({
      ...g,
      targets: g.targets ?? [g.qubit ?? 0],
      controls: g.controls ?? [],
      params: g.params ?? [],
    })),
  };
};

export const encodeToURL = (c: CircuitState): string =>
  btoa(unescape(encodeURIComponent(serializeCircuit(c))));

export const decodeFromURL = (s: string): CircuitState =>
  deserializeCircuit(decodeURIComponent(escape(atob(s))));

export const generateShareURL = (c: CircuitState): string =>
  `${location.origin}${location.pathname}?circuit=${encodeToURL(c)}`;

export const loadFromURL = (): CircuitState | null => {
  const p = new URLSearchParams(location.search).get('circuit');
  if (!p) return null;
  try { return decodeFromURL(p); } catch { return null; }
};