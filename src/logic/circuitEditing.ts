import type { PlacedGate } from './circuitTypes';

export interface GateOffsets {
  targetOffsets: number[];
  controlOffsets: number[];
}

export interface ProjectedPlacement {
  targets: number[];
  controls: number[];
  occupied: number[];
}

export const gateAnchor = (gate: Pick<PlacedGate, 'targets' | 'controls'>): number => {
  const occupied = [...gate.targets, ...gate.controls];
  return Math.min(...occupied);
};

export const offsetsFromGate = (gate: Pick<PlacedGate, 'targets' | 'controls'>): GateOffsets => {
  const anchor = gateAnchor(gate);
  return {
    targetOffsets: gate.targets.map((t) => t - anchor),
    controlOffsets: gate.controls.map((c) => c - anchor),
  };
};

export const projectOffsetsAtQubit = (offsets: GateOffsets, anchorQubit: number): ProjectedPlacement => {
  const targets = offsets.targetOffsets.map((off) => anchorQubit + off);
  const controls = offsets.controlOffsets.map((off) => anchorQubit + off);
  return {
    targets,
    controls,
    occupied: [...targets, ...controls],
  };
};

export const isPlacementValid = (placement: ProjectedPlacement, numQubits: number): boolean => {
  const inBounds = placement.occupied.every((q) => q >= 0 && q < numQubits);
  if (!inBounds) return false;
  return new Set(placement.occupied).size === placement.occupied.length;
};
