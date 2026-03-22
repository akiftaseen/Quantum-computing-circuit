import type { CircuitState } from './circuitTypes';

const parseAngle = (expr: string): number => {
  const s = expr.replace(/\s+/g, '').toLowerCase();
  if (/^[+-]?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s === 'pi') return Math.PI;
  if (s === '-pi') return -Math.PI;
  const m = s.match(/^([+-]?\d+(?:\.\d+)?)?\*?pi(?:\/([+-]?\d+(?:\.\d+)?))?$/);
  if (m) {
    const mul = m[1] !== undefined ? Number(m[1]) : 1;
    const div = m[2] !== undefined ? Number(m[2]) : 1;
    return (mul * Math.PI) / div;
  }
  return Number.isFinite(Number(s)) ? Number(s) : 0;
};

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

export const exportToCirq = (circuit: CircuitState): string => {
  const { numQubits, gates } = circuit;
  const lines = [
    'import cirq',
    'import numpy as np',
    '',
    `q = cirq.LineQubit.range(${numQubits})`,
    'circuit = cirq.Circuit()',
    '',
  ];

  const sorted = [...gates].sort((a, b) => a.column - b.column || a.targets[0] - b.targets[0]);
  for (const g of sorted) {
    const t0 = g.targets[0];
    switch (g.gate) {
      case 'H': lines.push(`circuit.append(cirq.H(q[${t0}]))`); break;
      case 'X': lines.push(`circuit.append(cirq.X(q[${t0}]))`); break;
      case 'Y': lines.push(`circuit.append(cirq.Y(q[${t0}]))`); break;
      case 'Z': lines.push(`circuit.append(cirq.Z(q[${t0}]))`); break;
      case 'S': lines.push(`circuit.append(cirq.S(q[${t0}]))`); break;
      case 'Sdg': lines.push(`circuit.append(cirq.S(q[${t0}])**-1)`); break;
      case 'T': lines.push(`circuit.append(cirq.T(q[${t0}]))`); break;
      case 'Tdg': lines.push(`circuit.append(cirq.T(q[${t0}])**-1)`); break;
      case 'Rx': lines.push(`circuit.append(cirq.rx(${g.params[0]})(q[${t0}]))`); break;
      case 'Ry': lines.push(`circuit.append(cirq.ry(${g.params[0]})(q[${t0}]))`); break;
      case 'Rz': lines.push(`circuit.append(cirq.rz(${g.params[0]})(q[${t0}]))`); break;
      case 'P': lines.push(`circuit.append(cirq.ZPowGate(exponent=${(g.params[0] ?? 0) / Math.PI})(q[${t0}]))`); break;
      case 'CNOT': lines.push(`circuit.append(cirq.CNOT(q[${g.controls[0]}], q[${t0}]))`); break;
      case 'CZ': lines.push(`circuit.append(cirq.CZ(q[${g.controls[0]}], q[${t0}]))`); break;
      case 'SWAP': lines.push(`circuit.append(cirq.SWAP(q[${g.targets[0]}], q[${g.targets[1]}]))`); break;
      case 'iSWAP': lines.push(`circuit.append(cirq.ISWAP(q[${g.targets[0]}], q[${g.targets[1]}]))`); break;
      case 'XX': lines.push(`circuit.append(cirq.XXPowGate(exponent=${(g.params[0] ?? 0) / Math.PI})(q[${g.targets[0]}], q[${g.targets[1]}]))`); break;
      case 'YY': lines.push(`circuit.append(cirq.YYPowGate(exponent=${(g.params[0] ?? 0) / Math.PI})(q[${g.targets[0]}], q[${g.targets[1]}]))`); break;
      case 'ZZ': lines.push(`circuit.append(cirq.ZZPowGate(exponent=${(g.params[0] ?? 0) / Math.PI})(q[${g.targets[0]}], q[${g.targets[1]}]))`); break;
      case 'CCX': lines.push(`circuit.append(cirq.CCX(q[${g.controls[0]}], q[${g.controls[1]}], q[${t0}]))`); break;
      case 'M': lines.push(`circuit.append(cirq.measure(q[${t0}], key='m${t0}'))`); break;
      default: break;
    }
  }
  lines.push('', 'print(circuit)');
  return lines.join('\n');
};

export const exportToLatex = (circuit: CircuitState): string => {
  const { numQubits, numColumns, gates } = circuit;
  const grid: string[][] = Array.from({ length: numQubits }, () =>
    Array.from({ length: numColumns }, () => '\\qw')
  );

  for (const g of gates) {
    const c = g.column;
    if (c < 0 || c >= numColumns) continue;
    if (g.gate === 'CNOT') {
      const ctrl = g.controls[0];
      const tgt = g.targets[0];
      grid[ctrl][c] = `\\ctrl{${tgt - ctrl}}`;
      grid[tgt][c] = '\\targ{}';
      continue;
    }
    if (g.gate === 'CZ') {
      const ctrl = g.controls[0];
      const tgt = g.targets[0];
      grid[ctrl][c] = `\\ctrl{${tgt - ctrl}}`;
      grid[tgt][c] = '\\control{}';
      continue;
    }
    if (g.gate === 'SWAP' || g.gate === 'iSWAP') {
      const q1 = g.targets[0];
      const q2 = g.targets[1];
      grid[q1][c] = `\\swap{${q2 - q1}}`;
      grid[q2][c] = '\\targX{}';
      continue;
    }
    if (g.gate === 'CCX') {
      const c1 = g.controls[0];
      const c2 = g.controls[1];
      const t = g.targets[0];
      grid[c1][c] = `\\ctrl{${t - c1}}`;
      grid[c2][c] = `\\ctrl{${t - c2}}`;
      grid[t][c] = '\\targ{}';
      continue;
    }
    if (g.gate === 'M') {
      grid[g.targets[0]][c] = '\\meter{}';
      continue;
    }
    if (g.gate === 'Barrier') {
      for (let q = 0; q < numQubits; q++) grid[q][c] = '\\slice{}';
      continue;
    }
    const label = ['Rx', 'Ry', 'Rz', 'P', 'XX', 'YY', 'ZZ'].includes(g.gate)
      ? `${g.gate}(${(g.params[0] ?? 0).toFixed(3)})`
      : g.gate;
    grid[g.targets[0]][c] = `\\gate{${label}}`;
  }

  const rows = grid.map((row, q) => `\\lstick{q_${q}} & ${row.join(' & ')} & \\qw`).join(' \\\n');
  return [
    '\\begin{quantikz}',
    rows,
    '\\end{quantikz}',
  ].join('\n');
};

export const importFromQASM = (qasm: string): CircuitState => {
  const lines = qasm
    .split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .filter(Boolean);

  let numQubits = 2;
  let col = 0;
  const gates: CircuitState['gates'] = [];

  for (const line of lines) {
    const qreg = line.match(/^qreg\s+\w+\[(\d+)\];?$/i);
    if (qreg) {
      numQubits = Math.max(1, Number(qreg[1]));
      continue;
    }

    const oneQ = line.match(/^(h|x|y|z|s|sdg|t|tdg)\s+\w+\[(\d+)\];?$/i);
    if (oneQ) {
      const map: Record<string, CircuitState['gates'][number]['gate']> = {
        h: 'H', x: 'X', y: 'Y', z: 'Z', s: 'S', sdg: 'Sdg', t: 'T', tdg: 'Tdg',
      };
      gates.push({ id: `qasm-${col}-${gates.length}`, gate: map[oneQ[1].toLowerCase()], column: col++, targets: [Number(oneQ[2])], controls: [], params: [] });
      continue;
    }

    const param1 = line.match(/^(rx|ry|rz|p)\(([^)]+)\)\s+\w+\[(\d+)\];?$/i);
    if (param1) {
      const map: Record<string, CircuitState['gates'][number]['gate']> = { rx: 'Rx', ry: 'Ry', rz: 'Rz', p: 'P' };
      gates.push({ id: `qasm-${col}-${gates.length}`, gate: map[param1[1].toLowerCase()], column: col++, targets: [Number(param1[3])], controls: [], params: [parseAngle(param1[2])] });
      continue;
    }

    const twoQParam = line.match(/^(rxx|ryy|rzz)\(([^)]+)\)\s+\w+\[(\d+)\],\s*\w+\[(\d+)\];?$/i);
    if (twoQParam) {
      const map: Record<string, CircuitState['gates'][number]['gate']> = { rxx: 'XX', ryy: 'YY', rzz: 'ZZ' };
      gates.push({ id: `qasm-${col}-${gates.length}`, gate: map[twoQParam[1].toLowerCase()], column: col++, targets: [Number(twoQParam[3]), Number(twoQParam[4])], controls: [], params: [parseAngle(twoQParam[2])] });
      continue;
    }

    const cx = line.match(/^cx\s+\w+\[(\d+)\],\s*\w+\[(\d+)\];?$/i);
    if (cx) {
      gates.push({ id: `qasm-${col}-${gates.length}`, gate: 'CNOT', column: col++, targets: [Number(cx[2])], controls: [Number(cx[1])], params: [] });
      continue;
    }

    const cz = line.match(/^cz\s+\w+\[(\d+)\],\s*\w+\[(\d+)\];?$/i);
    if (cz) {
      gates.push({ id: `qasm-${col}-${gates.length}`, gate: 'CZ', column: col++, targets: [Number(cz[2])], controls: [Number(cz[1])], params: [] });
      continue;
    }

    const ccx = line.match(/^ccx\s+\w+\[(\d+)\],\s*\w+\[(\d+)\],\s*\w+\[(\d+)\];?$/i);
    if (ccx) {
      gates.push({ id: `qasm-${col}-${gates.length}`, gate: 'CCX', column: col++, targets: [Number(ccx[3])], controls: [Number(ccx[1]), Number(ccx[2])], params: [] });
      continue;
    }

    const swap = line.match(/^swap\s+\w+\[(\d+)\],\s*\w+\[(\d+)\];?$/i);
    if (swap) {
      gates.push({ id: `qasm-${col}-${gates.length}`, gate: 'SWAP', column: col++, targets: [Number(swap[1]), Number(swap[2])], controls: [], params: [] });
      continue;
    }

    const measure = line.match(/^measure\s+\w+\[(\d+)\]\s*->\s*\w+\[(\d+)\];?$/i);
    if (measure) {
      gates.push({ id: `qasm-${col}-${gates.length}`, gate: 'M', column: col++, targets: [Number(measure[1])], controls: [], params: [], classicalBit: Number(measure[2]) });
      continue;
    }
  }

  return {
    numQubits,
    numColumns: Math.max(10, col + 2),
    gates,
  };
};