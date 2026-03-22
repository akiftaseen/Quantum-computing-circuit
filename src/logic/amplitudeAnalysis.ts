import type { Complex } from './complex';

/**
 * Compute phase (in radians) of a complex number.
 * Returns -π to π.
 */
export const getPhase = (z: Complex): number => {
  return Math.atan2(z.im, z.re);
};

/**
 * Compute magnitude of a complex number.
 */
export const getMagnitude = (z: Complex): number => {
  return Math.sqrt(z.re * z.re + z.im * z.im);
};

export interface AmplitudeEntry {
  basis: string;
  amplitude: Complex;
  magnitude: number;
  probability: number;
  phase: number;
}

export interface PhaseRelationship {
  fromBasis: string;
  toBasis: string;
  phaseDelta: number;
  coherenceWeight: number;
  type: 'constructive' | 'destructive' | 'neutral';
}

/**
 * Analyze state vector amplitudes and organize by basis state.
 */
export const analyzeAmplitudes = (state: Complex[]): AmplitudeEntry[] => {
  const entries: AmplitudeEntry[] = [];
  const totalAmplitudeSq = state.reduce((sum, z) => {
    const mag = getMagnitude(z);
    return sum + mag * mag;
  }, 0);

  for (let i = 0; i < state.length; i += 1) {
    const amplitude = state[i];
    const magnitude = getMagnitude(amplitude);
    const probability = (magnitude * magnitude) / totalAmplitudeSq;
    
    if (probability > 1e-10) {
      entries.push({
        basis: i.toString(2).padStart(Math.log2(state.length) || 1, '0'),
        amplitude,
        magnitude,
        probability,
        phase: getPhase(amplitude),
      });
    }
  }

  return entries.sort((a, b) => b.probability - a.probability);
};

/**
 * Compute constructive/destructive interference potential.
 * Allows qubit indices to measure which qubits have phase-sensitive behavior.
 */
export const computeInterferencePattern = (
  state: Complex[],
  qubits: number[]
): { constructive: number; destructive: number } => {
  const dim = state.length;

  let maxInterference = 0;
  let minInterference = 0;

  // Compute phase coherence between subsets
  for (let i = 0; i < dim; i += 1) {
    for (let j = i + 1; j < dim; j += 1) {
      if ((i ^ j) === (1 << qubits[0])) {
        const phase1 = getPhase(state[i]);
        const phase2 = getPhase(state[j]);
        const phaseDiff = phase1 - phase2;

        // Measure similarity of amplitudes modulo phase
        const mag1 = getMagnitude(state[i]);
        const mag2 = getMagnitude(state[j]);
        const avgMag = (mag1 + mag2) / 2;

        if (avgMag > 1e-10) {
          const coherence = Math.cos(phaseDiff);
          maxInterference = Math.max(maxInterference, coherence);
          minInterference = Math.min(minInterference, coherence);
        }
      }
    }
  }

  return {
    constructive: Math.max(0, maxInterference),
    destructive: Math.max(0, -minInterference),
  };
};

/**
 * Compute global phase coherence (how "quantum" is this state).
 * 0 = classical mixture, 1 = pure quantum superposition.
 */
export const computeCoherence = (state: Complex[]): number => {
  const dim = state.length;
  let sumPhaseProducts = 0;
  let sumProbabilities = 0;

  for (let i = 0; i < dim; i += 1) {
    for (let j = i + 1; j < dim; j += 1) {
      const magI = getMagnitude(state[i]);
      const magJ = getMagnitude(state[j]);
      const weight = magI * magJ;
      if (weight < 1e-10) continue;

      const phaseDiff = getPhase(state[i]) - getPhase(state[j]);
      sumPhaseProducts += weight * Math.abs(Math.cos(phaseDiff));
      sumProbabilities += weight;
    }
  }

  return sumProbabilities > 1e-10 ? Math.min(1, sumPhaseProducts / sumProbabilities) : 0;
};

/**
 * Pairwise phase relationships between dominant basis amplitudes.
 */
export const computePhaseRelationships = (
  state: Complex[],
  maxPairs = 12
): PhaseRelationship[] => {
  const entries = analyzeAmplitudes(state).slice(0, 10);
  const rels: PhaseRelationship[] = [];

  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const a = entries[i];
      const b = entries[j];
      const phaseDelta = a.phase - b.phase;
      const coherenceWeight = a.magnitude * b.magnitude;
      const cos = Math.cos(phaseDelta);
      const type: PhaseRelationship['type'] =
        cos > 0.25 ? 'constructive' : cos < -0.25 ? 'destructive' : 'neutral';

      rels.push({
        fromBasis: a.basis,
        toBasis: b.basis,
        phaseDelta,
        coherenceWeight,
        type,
      });
    }
  }

  return rels
    .sort((x, y) => y.coherenceWeight - x.coherenceWeight)
    .slice(0, maxPairs);
};
