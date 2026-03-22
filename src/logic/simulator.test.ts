import { describe, it, expect } from 'vitest';
import { initZeroState, measureQubit, applySingleQubitGate } from '../logic/simulator';
import { H_GATE, X_GATE } from '../logic/gate';

describe('Quantum Simulator', () => {
  it('should initialize zero state correctly', () => {
    const state = initZeroState(1);
    expect(state.length).toBe(2);
    expect(state[0].re).toBe(1);
    expect(state[0].im).toBe(0);
    expect(state[1].re).toBe(0);
    expect(state[1].im).toBe(0);
  });

  it('should initialize multi-qubit zero state', () => {
    const state = initZeroState(3);
    expect(state.length).toBe(8);
    expect(state[0].re).toBe(1);
    for (let i = 1; i < 8; i++) {
      expect(state[i].re).toBe(0);
      expect(state[i].im).toBe(0);
    }
  });

  it('should apply Hadamard gate correctly', () => {
    const state = initZeroState(1);
    const result = applySingleQubitGate(state, H_GATE, 0, 1);
    
    // After Hadamard, should be (|0⟩ + |1⟩)/√2
    const invSqrt2 = 1 / Math.sqrt(2);
    expect(result[0].re).toBeCloseTo(invSqrt2, 5);
    expect(result[1].re).toBeCloseTo(invSqrt2, 5);
  });

  it('should apply Pauli-X gate correctly', () => {
    const state = initZeroState(1);
    const result = applySingleQubitGate(state, X_GATE, 0, 1);
    
    // After X gate on |0⟩, should get |1⟩
    expect(result[0].re).toBe(0);
    expect(result[1].re).toBe(1);
  });

  it('should measure qubit correctly', () => {
    const state = initZeroState(1);
    const { outcome, prob } = measureQubit(state, 0, 1);
    
    // Measuring |0⟩ should always give 0
    expect(outcome).toBe(0);
    expect(prob).toBeCloseTo(1, 5);
  });

  it('should measure qubit with 50-50 superposition', () => {
    const state = initZeroState(1);
    const superposition = applySingleQubitGate(state, H_GATE, 0, 1);
    
    // Can't guarantee outcome, but probability should be ~0.5
    const { prob } = measureQubit(superposition, 0, 1);
    expect(prob).toBeGreaterThan(0.4);
    expect(prob).toBeLessThan(0.6);
  });
});
