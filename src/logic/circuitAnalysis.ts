/**
 * Circuit Analysis Utilities
 */

import type { CircuitState, GateName } from './circuitTypes';

export interface CircuitMetrics {
  totalGates: number;
  gateCount: Record<GateName, number>;
  circuitDepth: number;
  twoQubitGateCount: number;
  estimatedQubits: number;
}

/**
 * Count gates and compute circuit depth
 */
export const analyzeCircuit = (circuit: CircuitState): CircuitMetrics => {
  const gateCount: Record<string, number> = {};
  let twoQubitCount = 0;
  let maxGateDepth = 0;

  // Count gates by type and find critical path
  const columnGateCount = new Map<number, number>();
  
  circuit.gates.forEach(gate => {
    if (gate.gate === 'Barrier' || gate.gate === 'M') return;
    
    gateCount[gate.gate] = (gateCount[gate.gate] ?? 0) + 1;
    
    if (['CNOT', 'CZ', 'SWAP', 'iSWAP', 'XX', 'YY', 'ZZ', 'CCX'].includes(gate.gate)) {
      twoQubitCount++;
    }
    
    const currentDepth = columnGateCount.get(gate.column) ?? 0;
    columnGateCount.set(gate.column, currentDepth + 1);
    maxGateDepth = Math.max(maxGateDepth, currentDepth + 1);
  });

  const totalGates = circuit.gates.filter(g => g.gate !== 'Barrier').length;
  const referencedQubits = circuit.gates.flatMap((g) => [...g.targets, ...g.controls]);
  const highestReferenced = referencedQubits.length > 0 ? Math.max(...referencedQubits) : -1;
  const estimatedQubits = Math.max(circuit.numQubits, highestReferenced + 1);

  return {
    totalGates,
    gateCount: gateCount as Record<GateName, number>,
    circuitDepth: circuit.numColumns,
    twoQubitGateCount: twoQubitCount,
    estimatedQubits,
  };
};

/**
 * Highlight duplicate or inefficient gates
 */
export const findOptimizations = (circuit: CircuitState): string[] => {
  const suggestions: string[] = [];
  const byCol = Array.from({ length: circuit.numColumns }, (_, col) =>
    circuit.gates.filter((g) => g.column === col && g.gate !== 'Barrier' && g.gate !== 'M')
  );

  const touches = (g: CircuitState['gates'][number]): number[] => [...g.targets, ...g.controls];
  const overlaps = (a: CircuitState['gates'][number], b: CircuitState['gates'][number]): boolean => {
    const as = touches(a);
    const bs = touches(b);
    return as.some((q) => bs.includes(q));
  };

  // Find consecutive identical single-qubit gates on same qubit (can be combined)
  for (let col = 0; col < circuit.numColumns - 1; col++) {
    const currentGates = byCol[col];
    const nextGates = byCol[col + 1];

    currentGates.forEach(g1 => {
      if (['I', 'H', 'X', 'Y', 'Z', 'S', 'Sdg', 'T', 'Tdg'].includes(g1.gate)) {
        const next = nextGates.find(g2 => g2.gate === g1.gate && g2.targets[0] === g1.targets[0]);
        if (next) {
          suggestions.push(`${g1.gate} gate appears twice on qubit ${g1.targets[0]} (columns ${col}-${col+1})`);
        }
      }

      if (['H', 'X', 'Y', 'Z'].includes(g1.gate)) {
        const inverse = nextGates.find((g2) => g2.gate === g1.gate && g2.targets[0] === g1.targets[0]);
        if (inverse) {
          suggestions.push(`${g1.gate}${g1.gate}=I on q${g1.targets[0]} (columns ${col}-${col + 1})`);
        }
      }

      if (g1.gate === 'S') {
        const inv = nextGates.find((g2) => g2.gate === 'Sdg' && g2.targets[0] === g1.targets[0]);
        if (inv) suggestions.push(`S followed by S† on q${g1.targets[0]} cancels to I`);
      }

      if (g1.gate === 'T') {
        const inv = nextGates.find((g2) => g2.gate === 'Tdg' && g2.targets[0] === g1.targets[0]);
        if (inv) suggestions.push(`T followed by T† on q${g1.targets[0]} cancels to I`);
      }

      if (g1.gate === 'CNOT') {
        const inv = nextGates.find(
          (g2) => g2.gate === 'CNOT' && g2.targets[0] === g1.targets[0] && g2.controls[0] === g1.controls[0]
        );
        if (inv) suggestions.push(`Consecutive CNOT with same control/target cancels (columns ${col}-${col + 1})`);
      }
    });
  }

  // XX, YY, ZZ with θ=0
  circuit.gates.forEach(g => {
    if (['XX', 'YY', 'ZZ'].includes(g.gate) && Math.abs(g.params[0] ?? 0) < 0.001) {
      suggestions.push(`${g.gate}(0) does nothing and can be removed`);
    }
  });

  // Rx, Ry, Rz with θ=0
  circuit.gates.forEach(g => {
    if (['Rx', 'Ry', 'Rz'].includes(g.gate) && Math.abs(g.params[0] ?? 0) < 0.001) {
      suggestions.push(`${g.gate}(0) is equivalent to Identity`);
    }
  });

  // H + H = I
  for (let col = 0; col < circuit.numColumns - 1; col++) {
    const currentH = byCol[col].filter(g => g.gate === 'H');
    const nextH = byCol[col + 1].filter(g => g.gate === 'H');

    currentH.forEach(h1 => {
      nextH.forEach(h2 => {
        if (h1.targets[0] === h2.targets[0]) {
          suggestions.push(`H-H sequence on qubit ${h1.targets[0]} can be replaced with I`);
        }
      });
    });
  }

  // Identify commutation opportunities for adjacent columns on disjoint qubits
  for (let col = 0; col < circuit.numColumns - 1; col += 1) {
    const current = byCol[col];
    const next = byCol[col + 1];
    if (current.length !== 1 || next.length !== 1) continue;
    const gA = current[0];
    const gB = next[0];
    if (!overlaps(gA, gB)) {
      suggestions.push(`Columns ${col} and ${col + 1} act on disjoint qubits; gates commute and may be reordered`);
    }
  }

  // Decomposition hints
  circuit.gates.forEach((g) => {
    if (g.gate === 'CCX') {
      suggestions.push('CCX can be decomposed into H/T/CNOT layers to fit native 1q+CX hardware');
    }
    if (g.gate === 'SWAP') {
      suggestions.push('SWAP can be decomposed into 3 CNOTs; check hardware connectivity before transpiling');
    }
    if (['XX', 'YY', 'ZZ'].includes(g.gate)) {
      suggestions.push(`${g.gate} can be decomposed into basis changes + CNOT + Rz + CNOT for hardware-native execution`);
    }
  });

  // SWAP-chain optimization hint
  for (let col = 0; col < circuit.numColumns - 1; col += 1) {
    const s1 = byCol[col].find((g) => g.gate === 'SWAP');
    const s2 = byCol[col + 1].find((g) => g.gate === 'SWAP');
    if (!s1 || !s2) continue;
    const a = new Set(s1.targets);
    const b = new Set(s2.targets);
    const overlapCount = Array.from(a).filter((q) => b.has(q)).length;
    if (overlapCount === 1) {
      suggestions.push(`Adjacent SWAP chain at columns ${col}-${col + 1}; consider logical remapping to reduce swaps`);
    }
  }

  return Array.from(new Set(suggestions));
};

/**
 * Get gate cost estimate (for error analysis)
 */
export const estimateGateCost = (gate: GateName): number => {
  const costs: Record<GateName, number> = {
    'I': 0, 'H': 1, 'X': 1, 'Y': 1, 'Z': 1,
    'S': 1, 'Sdg': 1, 'T': 10, 'Tdg': 10, // T gates are expensive
    'Rx': 1, 'Ry': 1, 'Rz': 1, 'P': 1,
    'CNOT': 10, 'CZ': 10, 'SWAP': 30,
    'CCX': 100, 'iSWAP': 10, 'XX': 10, 'YY': 10, 'ZZ': 10,
    'M': 0, 'Barrier': 0,
  };
  return costs[gate] ?? 1;
};

/**
 * Calculate total circuit cost
 */
export const calculateCircuitCost = (circuit: CircuitState): number => {
  return circuit.gates.reduce((sum, gate) => sum + estimateGateCost(gate.gate), 0);
};
