import type { CircuitState, PlacedGate } from './circuitTypes';

export interface OptimizationHint {
  type: 'cancellation' | 'commutation' | 'decomposition' | 'reordering';
  description: string;
  affectedGates: string[];
  suggestion: string;
}

/**
 * Detect if two gates commute (can be reordered).
 */
const gatesCommute = (g1: PlacedGate, g2: PlacedGate): boolean => {
  // Same column gates already commute via parallelism
  if (g1.column === g2.column) return true;

  // Check qubit overlap
  const g1Qubits = new Set([...g1.targets, ...g1.controls]);
  const g2Qubits = new Set([...g2.targets, ...g2.controls]);

  // Disjoint qubits always commute
  const overlap = [...g1Qubits].some((q) => g2Qubits.has(q));
  if (!overlap) return true;

  // Same target, different gates: check specific commutation rules
  if (g1.targets.every((q) => g2.targets.includes(q)) && g1.controls.length === 0 && g2.controls.length === 0) {
    // Pauli gates don't commute unless identical
    if (['X', 'Y', 'Z'].includes(g1.gate) && ['X', 'Y', 'Z'].includes(g2.gate)) {
      return g1.gate === g2.gate;
    }
    // Phase gates (S, T, Rx, Ry, Rz) commute with themselves
    if (g1.gate === g2.gate) return true;
  }

  return false;
};

/**
 * Detect gate cancellations (XX=I, HH=I, SS≠I but 4S=I, TT≠I but 8T=I).
 */
export const findCancellations = (circuit: CircuitState): OptimizationHint[] => {
  const hints: OptimizationHint[] = [];
  const processed = new Set<string>();

  for (let i = 0; i < circuit.gates.length; i += 1) {
    if (processed.has(circuit.gates[i].id)) continue;

    const g1 = circuit.gates[i];

    for (let j = i + 1; j < circuit.gates.length; j += 1) {
      const g2 = circuit.gates[j];

      // Check if gates operate on same qubits
      if (g1.targets.length === g2.targets.length && 
          g1.targets.every((q, idx) => q === g2.targets[idx]) &&
          g1.controls.length === g2.controls.length &&
          g1.controls.every((q, idx) => q === g2.controls[idx])) {
        
        // Check for direct cancellations
        if ((g1.gate === 'X' && g2.gate === 'X') ||
            (g1.gate === 'H' && g2.gate === 'H') ||
            (g1.gate === 'Z' && g2.gate === 'Z')) {
          hints.push({
            type: 'cancellation',
            description: `${g1.gate} followed by ${g2.gate} cancel out (${g1.gate}${g2.gate} = I)`,
            affectedGates: [g1.id, g2.id],
            suggestion: `Remove both ${g1.gate} gates.`,
          });
          processed.add(g1.id);
          processed.add(g2.id);
          break;
        }
      }
    }
  }

  return hints;
};

/**
 * Detect commuting gates that could be reordered for better circuit depth.
 */
export const findCommutations = (circuit: CircuitState): OptimizationHint[] => {
  const hints: OptimizationHint[] = [];

  for (let i = 0; i < circuit.gates.length - 1; i += 1) {
    const g1 = circuit.gates[i];

    for (let j = i + 1; j < Math.min(i + 5, circuit.gates.length); j += 1) {
      const g2 = circuit.gates[j];

      if (g1.column < g2.column && gatesCommute(g1, g2)) {
        // Check if moving g1 forward reduces depth
        if (g2.column - g1.column > 1) {
          hints.push({
            type: 'commutation',
            description: `${g1.gate} and ${g2.gate} commute; they can be moved together.`,
            affectedGates: [g1.id, g2.id],
            suggestion: `Reorder to reduce circuit depth.`,
          });
          break;
        }
      }
    }
  }

  return hints.slice(0, 2); // Limit to top 2 hints
};

/**
 * Suggest decompositions for multi-qubit gates.
 */
export const findDecompositions = (circuit: CircuitState): OptimizationHint[] => {
  const hints: OptimizationHint[] = [];

  for (const gate of circuit.gates) {
    if (gate.gate === 'SWAP') {
      hints.push({
        type: 'decomposition',
        description: 'SWAP can be decomposed into 3 CNOTs.',
        affectedGates: [gate.id],
        suggestion: 'Consider if decomposition reduces overall gate count.',
      });
    }

    if (gate.gate === 'CCX') {
      hints.push({
        type: 'decomposition',
        description: 'CCX (Toffoli) can be decomposed into simpler gates.',
        affectedGates: [gate.id],
        suggestion: 'Decompose if many Toffolis exist in sequence.',
      });
    }
  }

  return hints.slice(0, 2);
};

/**
 * Compute overall optimization suggestions for a circuit.
 */
export const computeOptimizationHints = (circuit: CircuitState): OptimizationHint[] => {
  const hints: OptimizationHint[] = [
    ...findCancellations(circuit),
    ...findCommutations(circuit),
    ...findDecompositions(circuit),
  ];

  return hints.slice(0, 5); // Limit to 5 top hints
};
