/**
 * Gate Descriptions and Educational Content
 */

export const GATE_DESCRIPTIONS: Record<string, {
  name: string;
  description: string;
  formula?: string;
  uses: string[];
}> = {
  'I': {
    name: 'Identity',
    description: 'No operation. Leaves the quantum state unchanged.',
    formula: '|ψ⟩ → |ψ⟩',
    uses: ['Placeholder', 'Spacing'],
  },
  'H': {
    name: 'Hadamard',
    description: 'Creates equal superposition of basis states. Fundamental for querying.',
    formula: 'H = (X + Z)/√2',
    uses: ['Superposition', 'Fourier transform', 'Algorithm basis'],
  },
  'X': {
    name: 'Pauli-X (NOT)',
    description: 'Bit flip. Swaps |0⟩ with |1⟩.',
    formula: '|0⟩ → |1⟩, |1⟩ → |0⟩',
    uses: ['State preparation', 'Error correction'],
  },
  'Y': {
    name: 'Pauli-Y',
    description: 'Rotation around Y-axis by π. Combined bit-phase flip.',
    formula: '|0⟩ → i|1⟩, |1⟩ → -i|0⟩',
    uses: ['Rotation', 'Tomography'],
  },
  'Z': {
    name: 'Pauli-Z',
    description: 'Phase flip. Applies phase -1 to |1⟩.',
    formula: '|0⟩ → |0⟩, |1⟩ → -|1⟩',
    uses: ['Phase kickback', 'Measurement in Z-basis'],
  },
  'S': {
    name: 'S Gate (√Z)',
    description: 'Quarter turn around Z-axis. Phase gate with θ=π/2.',
    formula: '|0⟩ → |0⟩, |1⟩ → i|1⟩',
    uses: ['T=SS', 'Phase accumulation'],
  },
  'T': {
    name: 'T Gate (⁴√Z)',
    description: 'Eighth turn around Z-axis. Universal for quantum computation.',
    formula: '|0⟩ → |0⟩, |1⟩ → e^(iπ/4)|1⟩',
    uses: ['Universality', 'Phase precision'],
  },
  'Rx': {
    name: 'Rotation X',
    description: 'Rotation around X-axis by angle θ.',
    formula: 'Rx(θ) = e^(-i θ X/2)',
    uses: ['Generic rotation', 'VQE ansatz'],
  },
  'Ry': {
    name: 'Rotation Y',
    description: 'Rotation around Y-axis by angle θ.',
    formula: 'Ry(θ) = e^(-i θ Y/2)',
    uses: ['Generic rotation', 'Bloch sphere exploration'],
  },
  'Rz': {
    name: 'Rotation Z',
    description: 'Rotation around Z-axis by angle θ.',
    formula: 'Rz(θ) = e^(-i θ Z/2)',
    uses: ['Generic rotation', 'Relative phase'],
  },
  'P': {
    name: 'Phase Gate',
    description: 'Applies phase e^(iθ) to |1⟩.',
    formula: '|0⟩ → |0⟩, |1⟩ → e^(iθ)|1⟩',
    uses: ['Controlled phase', 'QFT'],
  },
  'CNOT': {
    name: 'CNOT (CX)',
    description: 'Controlled-NOT. Flips target if control is |1⟩.',
    formula: '|0⟩|ψ⟩ → |0⟩|ψ⟩, |1⟩|ψ⟩ → |1⟩X|ψ⟩',
    uses: ['Entanglement', 'Bell pairs', 'Ansatz'],
  },
  'CZ': {
    name: 'Controlled-Z',
    description: 'Applies Z if both qubits are |1⟩.',
    formula: 'CZ|11⟩ → -|11⟩',
    uses: ['Entanglement', 'Graph states'],
  },
  'SWAP': {
    name: 'SWAP',
    description: 'Exchanges quantum states of two qubits.',
    formula: '|ab⟩ → |ba⟩',
    uses: ['Qubit rearrangement', 'Routing'],
  },
  'iSWAP': {
    name: 'iSWAP',
    description: 'Swaps and applies phase i to swapped states.',
    formula: '= SWAP · (CZ + phase)',
    uses: ['Heisenberg-type interactions', 'Certain hardware'],
  },
  'XX': {
    name: 'XX Interaction',
    description: 'Ising XX coupling. Parametric two-qubit gate.',
    formula: 'XX(θ) = e^(-i θ X⊗X/2)',
    uses: ['Ising model', 'QAOA', 'VQE'],
  },
  'YY': {
    name: 'YY Interaction',
    description: 'Ising YY coupling. Parametric two-qubit gate.',
    formula: 'YY(θ) = e^(-i θ Y⊗Y/2)',
    uses: ['Ising model', 'QAOA'],
  },
  'ZZ': {
    name: 'ZZ Interaction',
    description: 'Ising ZZ coupling. Parametric two-qubit gate.',
    formula: 'ZZ(θ) = e^(-i θ Z⊗Z/2)',
    uses: ['Ising model', 'Heisenberg XX Z model'],
  },
  'CCX': {
    name: 'Toffoli (CCX)',
    description: 'Controlled-Controlled-NOT. Flips target if both controls are |1⟩.',
    formula: '|11⟩|ψ⟩ → |11⟩X|ψ⟩',
    uses: ['Universality (with H)', 'Reversible computing', 'Error correction'],
  },
  'M': {
    name: 'Measurement',
    description: 'Measures qubit in computational basis. Collapses to |0⟩ or |1⟩.',
    formula: '|ψ⟩ → |0⟩ or |1⟩',
    uses: ['Result extraction', 'Conditional logic'],
  },
};
