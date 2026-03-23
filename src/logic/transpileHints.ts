import type { CircuitState, GateName } from './circuitTypes';
import type { HardwareProfile } from './hardwareProfiles';

export interface TranspileHint {
  severity: 'low' | 'medium' | 'high';
  title: string;
  detail: string;
}

const inversePair = (a: GateName, b: GateName): boolean =>
  (a === 'S' && b === 'Sdg') ||
  (a === 'Sdg' && b === 'S') ||
  (a === 'T' && b === 'Tdg') ||
  (a === 'Tdg' && b === 'T') ||
  (a === b && ['H', 'X', 'Y', 'Z', 'CNOT', 'CZ', 'SWAP'].includes(a));

const wiresKey = (controls: number[], targets: number[]): string =>
  [...controls, ...targets].sort((x, y) => x - y).join(',');

const nativeSet = (profile?: HardwareProfile): Set<string> => {
  if (!profile) return new Set<string>();
  const set = new Set<string>(profile.basisGates);
  if (set.has('SX')) {
    set.add('Rx');
    set.add('Ry');
    set.add('Rz');
  }
  return set;
};

export const buildLiveTranspileHints = (circuit: CircuitState, profile?: HardwareProfile): TranspileHint[] => {
  const hints: TranspileHint[] = [];
  const sorted = [...circuit.gates].sort((a, b) => (a.column - b.column) || a.id.localeCompare(b.id));

  let cancelPairs = 0;
  let mergePairs = 0;
  let depthSpikes = 0;

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    if (prev.column !== next.column - 1) continue;
    if (wiresKey(prev.controls, prev.targets) !== wiresKey(next.controls, next.targets)) continue;

    if (inversePair(prev.gate, next.gate)) cancelPairs += 1;
    if (prev.gate === next.gate && ['Rx', 'Ry', 'Rz', 'P', 'XX', 'YY', 'ZZ'].includes(prev.gate)) mergePairs += 1;
  }

  for (let col = 0; col < circuit.numColumns; col += 1) {
    const width = circuit.gates.filter((g) => g.column === col).length;
    if (width > Math.max(2, Math.floor(circuit.numQubits / 1.5))) depthSpikes += 1;
  }

  if (cancelPairs > 0) {
    hints.push({
      severity: 'high',
      title: 'Immediate cancellation candidates',
      detail: `${cancelPairs} adjacent inverse/self-inverse gate pairs can be removed.`,
    });
  }

  if (mergePairs > 0) {
    hints.push({
      severity: 'medium',
      title: 'Rotation fusion opportunity',
      detail: `${mergePairs} adjacent parametric rotations on same wires can be merged.`,
    });
  }

  if (depthSpikes > 0) {
    hints.push({
      severity: 'low',
      title: 'Depth compaction opportunity',
      detail: `${depthSpikes} columns are dense enough for scheduling compaction.`,
    });
  }

  if (profile) {
    const native = nativeSet(profile);
    const unsupported = new Map<string, number>();
    for (const gate of circuit.gates) {
      if (!native.has(gate.gate)) unsupported.set(gate.gate, (unsupported.get(gate.gate) ?? 0) + 1);
    }
    if (unsupported.size > 0) {
      const preview = Array.from(unsupported.entries()).map(([g, c]) => `${g}×${c}`).join(', ');
      hints.push({
        severity: 'medium',
        title: 'Hardware decomposition expected',
        detail: `Selected backend is non-native for: ${preview}.`,
      });
    }
  }

  if (hints.length === 0) {
    hints.push({
      severity: 'low',
      title: 'No obvious live optimizations',
      detail: 'Circuit already looks locally optimized under current heuristics.',
    });
  }

  return hints.slice(0, 8);
};
