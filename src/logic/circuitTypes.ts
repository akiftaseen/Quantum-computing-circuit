// src/logic/circuitTypes.ts
export type GateName = 'H' | 'X' | 'Y' | 'Z' | 'S' | 'T';

export interface PlacedGate {
  id: string;
  gate: GateName;
  column: number; // time step
  qubit: number;  // which qubit line (0..NUM_QUBITS-1)
}

export interface SimpleCircuit {
  numQubits: number;
  numColumns: number;
  gates: PlacedGate[];
}