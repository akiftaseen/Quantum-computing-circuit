import { describe, expect, it } from 'vitest';
import { isPlacementValid, offsetsFromGate, projectOffsetsAtQubit } from './circuitEditing';
import type { PlacedGate } from './circuitTypes';

const sampleGate = (patch: Partial<PlacedGate>): PlacedGate => ({
  id: 'g1',
  gate: 'CNOT',
  column: 2,
  targets: [2],
  controls: [1],
  params: [],
  ...patch,
});

describe('circuitEditing placement utilities', () => {
  it('computes offsets relative to the lowest occupied qubit', () => {
    const offsets = offsetsFromGate(sampleGate({ controls: [1], targets: [3] }));
    expect(offsets.controlOffsets).toEqual([0]);
    expect(offsets.targetOffsets).toEqual([2]);
  });

  it('projects offsets at a new anchor qubit', () => {
    const offsets = offsetsFromGate(sampleGate({ controls: [1], targets: [2] }));
    const projected = projectOffsetsAtQubit(offsets, 4);
    expect(projected.controls).toEqual([4]);
    expect(projected.targets).toEqual([5]);
    expect(projected.occupied).toEqual([5, 4]);
  });

  it('accepts valid in-bounds placement', () => {
    const placement = { controls: [0], targets: [1], occupied: [0, 1] };
    expect(isPlacementValid(placement, 3)).toBe(true);
  });

  it('rejects out-of-bounds placement', () => {
    const placement = { controls: [2], targets: [3], occupied: [2, 3] };
    expect(isPlacementValid(placement, 3)).toBe(false);
  });

  it('rejects duplicate occupancy placement', () => {
    const placement = { controls: [1], targets: [1], occupied: [1, 1] };
    expect(isPlacementValid(placement, 4)).toBe(false);
  });

  it('supports CCX-like offsets for preview/move projection', () => {
    const gate = sampleGate({ gate: 'CCX', controls: [0, 1], targets: [2] });
    const projected = projectOffsetsAtQubit(offsetsFromGate(gate), 3);
    expect(projected.controls).toEqual([3, 4]);
    expect(projected.targets).toEqual([5]);
    expect(isPlacementValid(projected, 6)).toBe(true);
  });
});
