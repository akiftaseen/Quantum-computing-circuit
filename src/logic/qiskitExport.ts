import type { CircuitState } from './circuitTypes';

export const exportToQiskit = (circuit: CircuitState): string => {
  const { numQubits, gates } = circuit;
  const nCbits = gates.filter(g => g.gate === 'M').length;
  const lines = [
    'from qiskit import QuantumCircuit',
    '',
    `qc = QuantumCircuit(${numQubits}${nCbits > 0 ? `, ${nCbits}` : ''})`,
    '',
  ];
  const sorted = [...gates].sort((a, b) => a.column - b.column || a.targets[0] - b.targets[0]);
  let cIdx = 0;
  for (const g of sorted) {
    const t0 = g.targets[0];
    switch (g.gate) {
      case 'H': lines.push(`qc.h(${t0})`); break;
      case 'X': lines.push(`qc.x(${t0})`); break;
      case 'Y': lines.push(`qc.y(${t0})`); break;
      case 'Z': lines.push(`qc.z(${t0})`); break;
      case 'S': lines.push(`qc.s(${t0})`); break;
      case 'Sdg': lines.push(`qc.sdg(${t0})`); break;
      case 'T': lines.push(`qc.t(${t0})`); break;
      case 'Tdg': lines.push(`qc.tdg(${t0})`); break;
      case 'Rx': lines.push(`qc.rx(${g.params[0]}, ${t0})`); break;
      case 'Ry': lines.push(`qc.ry(${g.params[0]}, ${t0})`); break;
      case 'Rz': lines.push(`qc.rz(${g.params[0]}, ${t0})`); break;
      case 'P': lines.push(`qc.p(${g.params[0]}, ${t0})`); break;
      case 'CNOT': lines.push(`qc.cx(${g.controls[0]}, ${t0})`); break;
      case 'CZ': lines.push(`qc.cz(${g.controls[0]}, ${t0})`); break;
      case 'SWAP': lines.push(`qc.swap(${g.targets[0]}, ${g.targets[1]})`); break;
      case 'M': lines.push(`qc.measure(${t0}, ${cIdx++})`); break;
      case 'Barrier': lines.push('qc.barrier()'); break;
      default: break;
    }
  }
  lines.push('', 'print(qc.draw())');
  return lines.join('\n');
};

export const exportToPennyLane = (circuit: CircuitState): string => {
  const { numQubits, gates } = circuit;
  const lines = [
    'import pennylane as qml',
    '',
    `dev = qml.device("default.qubit", wires=${numQubits})`,
    '',
    '@qml.qnode(dev)',
    'def circuit():',
  ];
  const sorted = [...gates].sort((a, b) => a.column - b.column);
  for (const g of sorted) {
    const t0 = g.targets[0];
    switch (g.gate) {
      case 'H': lines.push(`    qml.Hadamard(wires=${t0})`); break;
      case 'X': lines.push(`    qml.PauliX(wires=${t0})`); break;
      case 'Y': lines.push(`    qml.PauliY(wires=${t0})`); break;
      case 'Z': lines.push(`    qml.PauliZ(wires=${t0})`); break;
      case 'S': lines.push(`    qml.S(wires=${t0})`); break;
      case 'T': lines.push(`    qml.T(wires=${t0})`); break;
      case 'Rx': lines.push(`    qml.RX(${g.params[0]}, wires=${t0})`); break;
      case 'Ry': lines.push(`    qml.RY(${g.params[0]}, wires=${t0})`); break;
      case 'Rz': lines.push(`    qml.RZ(${g.params[0]}, wires=${t0})`); break;
      case 'CNOT': lines.push(`    qml.CNOT(wires=[${g.controls[0]}, ${t0}])`); break;
      case 'CZ': lines.push(`    qml.CZ(wires=[${g.controls[0]}, ${t0}])`); break;
      case 'SWAP': lines.push(`    qml.SWAP(wires=[${g.targets[0]}, ${g.targets[1]}])`); break;
      default: break;
    }
  }
  lines.push(`    return qml.probs(wires=range(${numQubits}))`, '', 'print(circuit())');
  return lines.join('\n');
};