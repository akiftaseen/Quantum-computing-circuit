import type { CircuitState } from './circuitTypes';
import { diffCircuits } from './circuitDiff';
import { exportOpenQasm2 } from './qiskitOss';
import { parseOpenQasmLite } from './openqasmLite';

export interface QasmRoundTripReport {
  valid: boolean;
  message: string;
  qasm: string;
  reparsedQasm: string;
  diffSummary: {
    changed: number;
    added: number;
    removed: number;
    depthDelta: number;
  };
}

export const runQasmRoundTrip = (circuit: CircuitState): QasmRoundTripReport => {
  const qasm = exportOpenQasm2(circuit);
  const parsed = parseOpenQasmLite(qasm, circuit.numQubits);
  if (!parsed.valid) {
    return {
      valid: false,
      message: `Round-trip parse failed: ${parsed.message}`,
      qasm,
      reparsedQasm: '',
      diffSummary: { changed: 0, added: 0, removed: 0, depthDelta: 0 },
    };
  }

  const reparsedQasm = exportOpenQasm2(parsed.circuit);
  const diff = diffCircuits(circuit, parsed.circuit);
  const stable = diff.changed === 0 && diff.added === 0 && diff.removed === 0;

  return {
    valid: stable,
    message: stable
      ? 'Round-trip passed with no structural differences.'
      : `Round-trip differs: changed ${diff.changed}, added ${diff.added}, removed ${diff.removed}.`,
    qasm,
    reparsedQasm,
    diffSummary: {
      changed: diff.changed,
      added: diff.added,
      removed: diff.removed,
      depthDelta: diff.depthDelta,
    },
  };
};
