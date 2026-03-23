import type { CircuitState, PlacedGate } from './circuitTypes';

export interface CircuitDiffRow {
  index: number;
  left: string;
  right: string;
  status: 'same' | 'changed' | 'added' | 'removed';
}

export interface CircuitDiffSummary {
  rows: CircuitDiffRow[];
  changed: number;
  added: number;
  removed: number;
  depthDelta: number;
}

const depthOf = (circuit: CircuitState): number => {
  if (circuit.gates.length === 0) return 0;
  return Math.max(...circuit.gates.map((g) => g.column)) + 1;
};

const gateText = (g: PlacedGate | undefined): string => {
  if (!g) return '-';
  const wires = [...g.controls.map((q) => `c${q}`), ...g.targets.map((q) => `t${q}`)].join(',');
  const params = g.params.length ? `(${g.params.map((v) => v.toFixed(4)).join(',')})` : '';
  return `${g.gate}${params}@${g.column}[${wires}]`;
};

const sortGates = (gates: PlacedGate[]): PlacedGate[] =>
  [...gates].sort((a, b) => (a.column - b.column) || a.id.localeCompare(b.id));

export const diffCircuits = (leftCircuit: CircuitState, rightCircuit: CircuitState): CircuitDiffSummary => {
  const left = sortGates(leftCircuit.gates);
  const right = sortGates(rightCircuit.gates);
  const maxLen = Math.max(left.length, right.length);

  const rows: CircuitDiffRow[] = [];
  let changed = 0;
  let added = 0;
  let removed = 0;

  for (let i = 0; i < maxLen; i += 1) {
    const l = left[i];
    const r = right[i];
    if (l && !r) {
      removed += 1;
      rows.push({ index: i, left: gateText(l), right: '-', status: 'removed' });
      continue;
    }
    if (!l && r) {
      added += 1;
      rows.push({ index: i, left: '-', right: gateText(r), status: 'added' });
      continue;
    }

    const leftText = gateText(l);
    const rightText = gateText(r);
    const same = leftText === rightText;
    if (!same) changed += 1;
    rows.push({ index: i, left: leftText, right: rightText, status: same ? 'same' : 'changed' });
  }

  return {
    rows,
    changed,
    added,
    removed,
    depthDelta: depthOf(rightCircuit) - depthOf(leftCircuit),
  };
};
