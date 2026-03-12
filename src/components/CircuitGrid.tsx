import React, { useCallback } from 'react';
import type { CircuitState, PlacedGate, GateName } from '../logic/circuitTypes';
import { isParametric, gateDisplayName, gateColor, newGateId } from '../logic/circuitTypes';

interface Props {
  circuit: CircuitState;
  onPlace: (g: Omit<PlacedGate, 'id'>) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, u: Partial<PlacedGate>) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  stepCol: number | null;
}

const CS = 44, CG = 3, STEP = CS + CG;

const CircuitGrid: React.FC<Props> = ({ circuit, onPlace, onRemove, onUpdate, selectedId, onSelect, stepCol }) => {
  const { numQubits: nq, numColumns: nc, gates } = circuit;

  const cellInfo = useCallback((q: number, col: number) => {
    for (const g of gates) {
      if (g.column !== col) continue;
      if (g.targets.includes(q)) return { gate: g, role: 'target' as const };
      if (g.controls.includes(q)) return { gate: g, role: 'control' as const };
      const all = [...g.targets, ...g.controls];
      if (all.length >= 2) {
        const mn = Math.min(...all), mx = Math.max(...all);
        if (q > mn && q < mx) return { gate: g, role: 'through' as const };
      }
    }
    return { gate: null, role: null };
  }, [gates]);

  const handleDrop = (e: React.DragEvent, q: number, col: number) => {
    e.preventDefault();
    const gn = e.dataTransfer.getData('application/gate') as GateName | '';
    const gid = e.dataTransfer.getData('application/gate-move-id');
    if (gid) {
      const existing = gates.find(g => g.id === gid);
      if (existing) {
        const off = q - existing.targets[0];
        onUpdate(gid, {
          column: col,
          targets: existing.targets.map(t => Math.max(0, Math.min(nq - 1, t + off))),
          controls: existing.controls.map(c => Math.max(0, Math.min(nq - 1, c + off))),
        });
      }
      return;
    }
    if (!gn) return;
    if (gn === 'CNOT' || gn === 'CZ') {
      const tgt = q + 1 < nq ? q + 1 : q - 1;
      if (tgt < 0 || tgt >= nq) return;
      onPlace({ gate: gn, column: col, targets: [tgt], controls: [q], params: [] });
    } else if (gn === 'SWAP') {
      const q2 = q + 1 < nq ? q + 1 : q - 1;
      if (q2 < 0 || q2 >= nq) return;
      onPlace({ gate: 'SWAP', column: col, targets: [q, q2], controls: [], params: [] });
    } else if (gn === 'M') {
      const cb = gates.filter(g => g.gate === 'M').length;
      onPlace({ gate: 'M', column: col, targets: [q], controls: [], params: [], classicalBit: cb });
    } else {
      onPlace({ gate: gn, column: col, targets: [q], controls: [], params: isParametric(gn) ? [Math.PI / 2] : [] });
    }
  };

  const renderCell = (q: number, col: number) => {
    const { gate, role } = cellInfo(q, col);
    const dimmed = stepCol !== null && col > stepCol;
    const cls = `circuit-cell${dimmed ? ' dimmed' : ''}`;
    const sel = gate?.id === selectedId;

    const onGateDragStart = (e: React.DragEvent, id: string) => {
      e.dataTransfer.setData('application/gate-move-id', id);
      e.dataTransfer.effectAllowed = 'move';
    };

    let content: React.ReactNode = null;
    if (gate && role === 'target') {
      const dn = gateDisplayName[gate.gate];
      const color = gateColor[gate.gate];
      if (gate.gate === 'CNOT') {
        content = <div className={`gate-tile cnot-target${sel ? ' selected' : ''}`} style={{ borderColor: color }}
          onClick={() => onSelect(sel ? null : gate.id)} draggable onDragStart={e => onGateDragStart(e, gate.id)}>⊕</div>;
      } else if (gate.gate === 'SWAP') {
        content = <div className={`gate-tile swap-sym${sel ? ' selected' : ''}`}
          onClick={() => onSelect(sel ? null : gate.id)} draggable onDragStart={e => onGateDragStart(e, gate.id)}>×</div>;
      } else if (gate.gate === 'M') {
        content = <div className={`gate-tile measure-tile${sel ? ' selected' : ''}`}
          onClick={() => onSelect(sel ? null : gate.id)} draggable onDragStart={e => onGateDragStart(e, gate.id)}>
          <span style={{ fontSize: 10 }}>📏</span></div>;
      } else if (gate.gate === 'Barrier') {
        content = <div className="barrier-line" />;
      } else {
        content = <div className={`gate-tile${sel ? ' selected' : ''}`} style={{ background: color }}
          onClick={() => onSelect(sel ? null : gate.id)} draggable onDragStart={e => onGateDragStart(e, gate.id)}>
          {dn}{isParametric(gate.gate) && gate.params[0] !== undefined &&
            <span className="gate-param">{(gate.params[0] / Math.PI).toFixed(1)}π</span>}
        </div>;
      }
    } else if (gate && role === 'control') {
      content = <div className={`control-dot${sel ? ' selected' : ''}`}
        onClick={() => onSelect(sel ? null : gate.id)}>●</div>;
    } else if (gate && role === 'through') {
      content = <div className="through-line" />;
    }

    return (
      <div key={`${q}-${col}`} className={cls}
        onDrop={e => handleDrop(e, q, col)} onDragOver={e => e.preventDefault()}
        onClick={() => !gate && onSelect(null)}>
        {content}
      </div>
    );
  };

  return (
    <div className="circuit-grid-wrap">
      <div className="circuit-col-nums">
        <div style={{ width: 32 }} />
        {Array.from({ length: nc }, (_, i) => (
          <div key={i} className="col-num" style={{ width: CS, marginRight: CG }}>{i}</div>
        ))}
      </div>
      {Array.from({ length: nq }, (_, q) => (
        <div className="circuit-row" key={q}>
          <div className="qubit-label">q{q}</div>
          <div className="cells-row">
            <div className="wire-line" />
            {Array.from({ length: nc }, (_, col) => renderCell(q, col))}
          </div>
        </div>
      ))}
    </div>
  );
};
export default CircuitGrid;