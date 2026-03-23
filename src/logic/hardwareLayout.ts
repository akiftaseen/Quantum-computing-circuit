import type { CircuitState, GateName, PlacedGate } from './circuitTypes';
import { newGateId } from './circuitTypes';
import type { HardwareProfile } from './hardwareProfiles';

export interface HardwareLayoutReport {
  routedCircuit: CircuitState;
  swapInserted: number;
  unroutableGates: number;
  depthBefore: number;
  depthAfter: number;
  notes: string[];
}

const twoQubitGates = new Set<GateName>(['CNOT', 'CZ', 'SWAP', 'iSWAP', 'XX', 'YY', 'ZZ']);

const edgeKey = (a: number, b: number): string => {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return `${lo}-${hi}`;
};

const isAdjacent = (edges: Array<[number, number]>, a: number, b: number): boolean => {
  if (edges.length === 0) return true;
  const allowed = new Set(edges.map(([x, y]) => edgeKey(x, y)));
  return allowed.has(edgeKey(a, b));
};

const shortestPath = (edges: Array<[number, number]>, start: number, goal: number): number[] | null => {
  if (start === goal) return [start];
  const adj = new Map<number, number[]>();
  for (const [a, b] of edges) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  }

  const queue: number[] = [start];
  const prev = new Map<number, number | null>([[start, null]]);

  while (queue.length > 0) {
    const node = queue.shift()!;
    const nexts = adj.get(node) ?? [];
    for (const next of nexts) {
      if (prev.has(next)) continue;
      prev.set(next, node);
      if (next === goal) {
        const path: number[] = [];
        let cur: number | null = goal;
        while (cur !== null) {
          path.push(cur);
          cur = prev.get(cur) ?? null;
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }

  return null;
};

const mkGate = (
  gate: GateName,
  column: number,
  targets: number[],
  controls: number[] = [],
  params: number[] = [],
): PlacedGate => ({
  id: newGateId(),
  gate,
  column,
  targets,
  controls,
  params,
});

const depthOf = (c: CircuitState): number => {
  if (c.gates.length === 0) return 0;
  return Math.max(...c.gates.map((g) => g.column)) + 1;
};

export const routeCircuitForHardware = (
  circuit: CircuitState,
  profile: HardwareProfile,
): HardwareLayoutReport => {
  if (profile.couplingEdges.length === 0) {
    return {
      routedCircuit: { ...circuit, gates: circuit.gates.map((g) => ({ ...g })) },
      swapInserted: 0,
      unroutableGates: 0,
      depthBefore: depthOf(circuit),
      depthAfter: depthOf(circuit),
      notes: ['All-to-all backend: no routing needed.'],
    };
  }

  const sorted = [...circuit.gates].sort((a, b) => (a.column - b.column) || a.id.localeCompare(b.id));
  const out: PlacedGate[] = [];
  let col = 0;
  let swapInserted = 0;
  let unroutableGates = 0;

  for (const gate of sorted) {
    if (!twoQubitGates.has(gate.gate)) {
      out.push({ ...gate, id: newGateId(), column: col });
      col += 1;
      continue;
    }

    const wires = [...gate.controls, ...gate.targets];
    if (wires.length < 2) {
      out.push({ ...gate, id: newGateId(), column: col });
      col += 1;
      continue;
    }

    const qA = wires[0];
    const qB = wires[1];
    if (isAdjacent(profile.couplingEdges, qA, qB)) {
      out.push({ ...gate, id: newGateId(), column: col });
      col += 1;
      continue;
    }

    const path = shortestPath(profile.couplingEdges, qA, qB);
    if (!path || path.length < 2) {
      unroutableGates += 1;
      out.push({ ...gate, id: newGateId(), column: col });
      col += 1;
      continue;
    }

    const forwardSwapEdges: Array<[number, number]> = [];
    for (let i = 0; i < path.length - 2; i += 1) {
      const a = path[i];
      const b = path[i + 1];
      out.push(mkGate('SWAP', col, [a, b]));
      forwardSwapEdges.push([a, b]);
      swapInserted += 1;
      col += 1;
    }

    const moved = path[path.length - 2];
    const fixed = path[path.length - 1];

    if (gate.gate === 'CNOT' || gate.gate === 'CZ') {
      const controlOriginallyFirst = gate.controls[0] === qA;
      const control = controlOriginallyFirst ? moved : fixed;
      const target = controlOriginallyFirst ? fixed : moved;
      out.push(mkGate(gate.gate, col, [target], [control], gate.params));
    } else {
      out.push(mkGate(gate.gate, col, [moved, fixed], [], gate.params));
    }
    col += 1;

    for (let i = forwardSwapEdges.length - 1; i >= 0; i -= 1) {
      const [a, b] = forwardSwapEdges[i];
      out.push(mkGate('SWAP', col, [a, b]));
      swapInserted += 1;
      col += 1;
    }
  }

  const routedCircuit: CircuitState = {
    numQubits: circuit.numQubits,
    numColumns: Math.max(8, col + 2),
    gates: out,
  };

  const notes: string[] = [];
  if (swapInserted > 0) notes.push(`Inserted ${swapInserted} SWAP gates to satisfy connectivity.`);
  if (unroutableGates > 0) notes.push(`${unroutableGates} gate(s) were left unrouted due to disconnected coupling graph.`);
  if (swapInserted === 0 && unroutableGates === 0) notes.push('Circuit already respects hardware connectivity.');

  return {
    routedCircuit,
    swapInserted,
    unroutableGates,
    depthBefore: depthOf(circuit),
    depthAfter: depthOf(routedCircuit),
    notes,
  };
};
