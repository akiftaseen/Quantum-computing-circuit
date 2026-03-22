/**
 * Validation utilities for quantum circuits
 */
import type { CircuitState, PlacedGate } from './circuitTypes';
import { CIRCUIT_CONSTRAINTS } from './constants';

export type ValidationError = {
  type: 'qubit_out_of_range' | 'column_out_of_range' | 'invalid_gate' | 'invalid_params' | 'general';
  message: string;
  gate_id?: string;
};

/**
 * Validate circuit state
 */
export const validateCircuit = (circuit: CircuitState): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Check qubit count
  if (circuit.numQubits < CIRCUIT_CONSTRAINTS.MIN_QUBITS || 
      circuit.numQubits > CIRCUIT_CONSTRAINTS.MAX_QUBITS) {
    errors.push({
      type: 'qubit_out_of_range',
      message: `Number of qubits must be between ${CIRCUIT_CONSTRAINTS.MIN_QUBITS} and ${CIRCUIT_CONSTRAINTS.MAX_QUBITS}`,
    });
  }

  // Check column count
  if (circuit.numColumns < CIRCUIT_CONSTRAINTS.MIN_COLUMNS || 
      circuit.numColumns > CIRCUIT_CONSTRAINTS.MAX_COLUMNS) {
    errors.push({
      type: 'column_out_of_range',
      message: `Number of columns must be between ${CIRCUIT_CONSTRAINTS.MIN_COLUMNS} and ${CIRCUIT_CONSTRAINTS.MAX_COLUMNS}`,
    });
  }

  // Check each gate
  circuit.gates.forEach(gate => {
    const gateErrors = validateGate(gate, circuit);
    errors.push(...gateErrors);
  });

  return errors;
};

/**
 * Validate individual gate
 */
export const validateGate = (gate: PlacedGate, circuit: CircuitState): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Check column
  if (gate.column < 0 || gate.column >= circuit.numColumns) {
    errors.push({
      type: 'column_out_of_range',
      message: `Gate column ${gate.column} out of range [0, ${circuit.numColumns - 1}]`,
      gate_id: gate.id,
    });
  }

  // Check targets
  gate.targets.forEach(target => {
    if (target < 0 || target >= circuit.numQubits) {
      errors.push({
        type: 'qubit_out_of_range',
        message: `Target qubit ${target} out of range [0, ${circuit.numQubits - 1}]`,
        gate_id: gate.id,
      });
    }
  });

  // Check controls
  gate.controls.forEach(control => {
    if (control < 0 || control >= circuit.numQubits) {
      errors.push({
        type: 'qubit_out_of_range',
        message: `Control qubit ${control} out of range [0, ${circuit.numQubits - 1}]`,
        gate_id: gate.id,
      });
    }
  });

  // Check for duplicate qubits
  const allQubits = [...gate.targets, ...gate.controls];
  const uniqueQubits = new Set(allQubits);
  if (allQubits.length !== uniqueQubits.size) {
    errors.push({
      type: 'invalid_gate',
      message: 'Gate cannot operate on the same qubit multiple times',
      gate_id: gate.id,
    });
  }

  // Check parameters for parametric gates
  if (['Rx', 'Ry', 'Rz', 'P'].includes(gate.gate) && gate.params.length === 0) {
    errors.push({
      type: 'invalid_params',
      message: `Gate ${gate.gate} requires a parameter`,
      gate_id: gate.id,
    });
  }

  return errors;
};

/**
 * Sanitize user input
 */
export const sanitizeAngle = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-100 * Math.PI, Math.min(100 * Math.PI, value));
};

/**
 * Validate qubit count
 */
export const validateQubitCount = (n: number): boolean => {
  return Number.isInteger(n) && 
         n >= CIRCUIT_CONSTRAINTS.MIN_QUBITS && 
         n <= CIRCUIT_CONSTRAINTS.MAX_QUBITS;
};

/**
 * Validate column count
 */
export const validateColumnCount = (n: number): boolean => {
  return Number.isInteger(n) && 
         n >= CIRCUIT_CONSTRAINTS.MIN_COLUMNS && 
         n <= CIRCUIT_CONSTRAINTS.MAX_COLUMNS;
};
