import React, { useRef, useMemo, useCallback } from 'react';
import type { CircuitState, PlacedGate, GateName } from '../logic/circuitTypes';
import { isMultiQubit, isParametric, gateDisplayName } from '../logic/circuitTypes';

/* ------------------------------------------------------------------ */
/*  Props - aligned with App.tsx                                       */
/* ------------------------------------------------------------------ */
interface CircuitGridProps {
  circuit: CircuitState;
  onPlace: (gate: Omit<PlacedGate, 'id'>) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<PlacedGate>) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  stepCol: number | null;
}

/* ---- Layout constants ---- */
const PAD_L = 72;
const PAD_T = 28;
const PAD_R = 36;
const PAD_B = 28;
const ROW_H = 52;
const COL_W = 60;
const BOX = 34;
const R_TGT = 11;

/* ---- Gate colors [fill, stroke, text] ---- */
const COLORS: Record<string, [string, string, string]> = {
  H:   ['#dbeafe', '#60a5fa', '#1e40af'],
  X:   ['#fee2e2', '#f87171', '#b91c1c'],
  Y:   ['#fef9c3', '#facc15', '#854d0e'],
  Z:   ['#e0e7ff', '#818cf8', '#3730a3'],
  S:   ['#ede9fe', '#a78bfa', '#5b21b6'],
  T:   ['#ede9fe', '#a78bfa', '#5b21b6'],
  Sdg: ['#ede9fe', '#a78bfa', '#5b21b6'],
  Tdg: ['#ede9fe', '#a78bfa', '#5b21b6'],
  Rx:  ['#d1fae5', '#6ee7b7', '#065f46'],
  Ry:  ['#d1fae5', '#6ee7b7', '#065f46'],
  Rz:  ['#d1fae5', '#6ee7b7', '#065f46'],
  P:   ['#fef9c3', '#facc15', '#854d0e'],
  I:   ['#f3f4f6', '#d1d5db', '#6b7280'],
  M:   ['#f1f5f9', '#64748b', '#334155'],
};
const DEFAULT_C: [string, string, string] = ['#f3f4f6', '#d1d5db', '#374151'];
const gc = (g: string) => COLORS[g] ?? DEFAULT_C;

/* ================================================================== */
const CircuitGrid: React.FC<CircuitGridProps> = ({
  circuit,
  onPlace,
  selectedId,
  onSelect,
  stepCol,
}) => {
  const { numQubits, numColumns, gates } = circuit;
  const svgRef = useRef<SVGSVGElement>(null);

  const W = PAD_L + numColumns * COL_W + PAD_R;
  const H = PAD_T + Math.max(numQubits - 1, 0) * ROW_H + BOX + PAD_B;

  const qy = (q: number) => PAD_T + q * ROW_H + BOX / 2;
  const sx = (s: number) => PAD_L + s * COL_W + COL_W / 2;

  /* ---- Drag and drop ---- */
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const gateName = e.dataTransfer.getData('gateId') as GateName;
      if (!gateName || !svgRef.current) return;

      const rect = svgRef.current.getBoundingClientRect();
      const col = Math.round((e.clientX - rect.left - PAD_L - COL_W / 2) / COL_W);
      const qubit = Math.round((e.clientY - rect.top - PAD_T - BOX / 2) / ROW_H);

      if (col < 0 || col >= numColumns || qubit < 0 || qubit >= numQubits) return;

      if (isMultiQubit(gateName)) {
        const control = qubit;
        const target = qubit + 1 < numQubits ? qubit + 1 : qubit - 1;
        if (target < 0 || target >= numQubits) return;

        if (gateName === 'SWAP') {
          onPlace({ gate: 'SWAP', column: col, targets: [control, target], controls: [], params: [] });
        } else if (gateName === 'iSWAP' || gateName === 'XX' || gateName === 'YY' || gateName === 'ZZ') {
          const params = gateName === 'iSWAP' ? [] : [Math.PI / 4];
          onPlace({ gate: gateName, column: col, targets: [control, target], controls: [], params });
        } else if (gateName === 'CCX') {
          const c1 = qubit;
          const c2 = qubit + 1 < numQubits ? qubit + 1 : qubit - 1;
          const t = qubit + 2 < numQubits ? qubit + 2 : qubit - 2;
          if (c2 < 0 || c2 >= numQubits || t < 0 || t >= numQubits) return;
          onPlace({ gate: 'CCX', column: col, targets: [t], controls: [c1, c2], params: [] });
        } else {
          onPlace({ gate: gateName, column: col, targets: [target], controls: [control], params: [] });
        }
      } else {
        const params = isParametric(gateName) ? [Math.PI / 2] : [];
        onPlace({ gate: gateName, column: col, targets: [qubit], controls: [], params });
      }
    },
    [numColumns, numQubits, onPlace],
  );

  /* ---- Deselect on blank click ---- */
  const handleBgClick = useCallback(
    (e: React.MouseEvent) => {
      const t = e.target as SVGElement;
      if (t === svgRef.current || t.classList.contains('drop-zone') || t.classList.contains('bg-rect')) {
        onSelect(null);
      }
    },
    [onSelect],
  );

  /* ---- Wires ---- */
  const wires = useMemo(
    () =>
      Array.from({ length: numQubits }, (_, q) => {
        const y = qy(q);
        const wireEnd = PAD_L + (numColumns - 1) * COL_W + COL_W / 2 + 20;
        return (
          <g key={`wire-${q}`}>
            <text x={14} y={y} dominantBaseline="central" fontSize={13}
              fontFamily="var(--font-mono)" fill="var(--text-3, #64748b)">
              q<tspan fontSize={10} dy={2}>{q}</tspan>
            </text>
            <text x={42} y={y} dominantBaseline="central" fontSize={12}
              fontFamily="var(--font-sans)" fill="var(--text-3, #94a3b8)">
              |0⟩
            </text>
            <line x1={PAD_L - 6} y1={y} x2={wireEnd} y2={y}
              stroke="var(--text-3, #94a3b8)" strokeWidth={1} />
          </g>
        );
      }),
    [numQubits, numColumns],
  );

  /* ---- Step highlight column ---- */
  const stepHighlight = useMemo(() => {
    if (stepCol === null) return null;
    if (stepCol < 0 || stepCol >= numColumns) return null;
    return (
      <rect
        x={sx(stepCol) - COL_W / 2}
        y={0}
        width={COL_W}
        height={H}
        fill="rgba(99, 102, 241, 0.08)"
        rx={4}
      />
    );
  }, [stepCol, numColumns, H]);

  /* ---- Render all gates ---- */
  const gateElements = useMemo(() => {
    const els: React.ReactNode[] = [];

    gates.forEach((g) => {
      const x = sx(g.column);
      const isSel = g.id === selectedId;
      const accent = isSel ? '#6366f1' : undefined;
      const sw = isSel ? 2.8 : 1.5;

      /* ---------- CNOT ---------- */
      if (g.gate === 'CNOT' && g.controls.length > 0) {
        const cy = qy(g.controls[0]);
        const ty = qy(g.targets[0]);
        els.push(
          <g key={g.id} className="qgate" onClick={() => onSelect(g.id)}>
            <line x1={x} y1={cy} x2={x} y2={ty} stroke={accent ?? '#1e40af'} strokeWidth={sw} />
            <circle cx={x} cy={cy} r={5} fill={accent ?? '#1e40af'} />
            <circle cx={x} cy={ty} r={R_TGT} fill="var(--card, #fff)" stroke={accent ?? '#1e40af'} strokeWidth={sw} />
            <line x1={x - R_TGT} y1={ty} x2={x + R_TGT} y2={ty} stroke={accent ?? '#1e40af'} strokeWidth={1.5} />
            <line x1={x} y1={ty - R_TGT} x2={x} y2={ty + R_TGT} stroke={accent ?? '#1e40af'} strokeWidth={1.5} />
          </g>,
        );
        return;
      }

      /* ---------- CZ ---------- */
      if (g.gate === 'CZ' && g.controls.length > 0) {
        const cy = qy(g.controls[0]);
        const ty = qy(g.targets[0]);
        els.push(
          <g key={g.id} className="qgate" onClick={() => onSelect(g.id)}>
            <line x1={x} y1={cy} x2={x} y2={ty} stroke={accent ?? '#4527a0'} strokeWidth={sw} />
            <circle cx={x} cy={cy} r={5} fill={accent ?? '#4527a0'} />
            <circle cx={x} cy={ty} r={5} fill={accent ?? '#4527a0'} />
          </g>,
        );
        return;
      }

      /* ---------- SWAP ---------- */
      if (g.gate === 'SWAP' && g.targets.length >= 2) {
        const y1 = qy(g.targets[0]);
        const y2 = qy(g.targets[1]);
        const d = 7;
        els.push(
          <g key={g.id} className="qgate" onClick={() => onSelect(g.id)}>
            <line x1={x} y1={y1} x2={x} y2={y2} stroke={accent ?? '#c2410c'} strokeWidth={sw} />
            <line x1={x - d} y1={y1 - d} x2={x + d} y2={y1 + d} stroke={accent ?? '#c2410c'} strokeWidth={2.2} />
            <line x1={x + d} y1={y1 - d} x2={x - d} y2={y1 + d} stroke={accent ?? '#c2410c'} strokeWidth={2.2} />
            <line x1={x - d} y1={y2 - d} x2={x + d} y2={y2 + d} stroke={accent ?? '#c2410c'} strokeWidth={2.2} />
            <line x1={x + d} y1={y2 - d} x2={x - d} y2={y2 + d} stroke={accent ?? '#c2410c'} strokeWidth={2.2} />
          </g>,
        );
        return;
      }

      /* ---------- iSWAP / XX / YY / ZZ ---------- */
      if ((g.gate === 'iSWAP' || g.gate === 'XX' || g.gate === 'YY' || g.gate === 'ZZ') && g.targets.length >= 2) {
        const y1 = qy(g.targets[0]);
        const y2 = qy(g.targets[1]);
        const mid = (y1 + y2) / 2;
        const label = gateDisplayName[g.gate] ?? g.gate;
        els.push(
          <g key={g.id} className="qgate" onClick={() => onSelect(g.id)}>
            <line x1={x} y1={y1} x2={x} y2={y2} stroke={accent ?? '#0f766e'} strokeWidth={sw} />
            <circle cx={x} cy={y1} r={4.5} fill={accent ?? '#0f766e'} />
            <circle cx={x} cy={y2} r={4.5} fill={accent ?? '#0f766e'} />
            <rect x={x - 13} y={mid - 10} width={26} height={20} rx={4} fill="#ecfeff" stroke={accent ?? '#0f766e'} strokeWidth={1.5} />
            <text x={x} y={mid} textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={700} fill="#115e59">{label}</text>
          </g>,
        );
        return;
      }

      /* ---------- CCX ---------- */
      if (g.gate === 'CCX' && g.controls.length >= 2 && g.targets.length > 0) {
        const c1 = qy(g.controls[0]);
        const c2 = qy(g.controls[1]);
        const ty = qy(g.targets[0]);
        els.push(
          <g key={g.id} className="qgate" onClick={() => onSelect(g.id)}>
            <line x1={x} y1={Math.min(c1, c2)} x2={x} y2={Math.max(c1, c2)} stroke={accent ?? '#5b21b6'} strokeWidth={sw} />
            <line x1={x} y1={Math.min(c1, c2)} x2={x} y2={ty} stroke={accent ?? '#5b21b6'} strokeWidth={sw} />
            <circle cx={x} cy={c1} r={5} fill={accent ?? '#5b21b6'} />
            <circle cx={x} cy={c2} r={5} fill={accent ?? '#5b21b6'} />
            <circle cx={x} cy={ty} r={R_TGT} fill="var(--card, #fff)" stroke={accent ?? '#5b21b6'} strokeWidth={sw} />
            <line x1={x - R_TGT} y1={ty} x2={x + R_TGT} y2={ty} stroke={accent ?? '#5b21b6'} strokeWidth={1.5} />
            <line x1={x} y1={ty - R_TGT} x2={x} y2={ty + R_TGT} stroke={accent ?? '#5b21b6'} strokeWidth={1.5} />
          </g>,
        );
        return;
      }

      /* ---------- Single-qubit gates ---------- */
      const tgt = g.targets[0];
      const y = qy(tgt);
      const [fl, st, tx] = gc(g.gate);
      const label = gateDisplayName[g.gate] ?? g.gate;
      const fontSize = label.length > 2 ? 10 : 14;

      els.push(
        <g key={g.id} className="qgate" onClick={() => onSelect(g.id)}>
          <rect x={x - BOX / 2} y={y - BOX / 2} width={BOX} height={BOX}
            fill="var(--card, #fff)" />
          <rect x={x - BOX / 2} y={y - BOX / 2} width={BOX} height={BOX} rx={4}
            fill={fl} stroke={isSel ? '#6366f1' : st} strokeWidth={isSel ? 2.8 : 1.4} />
          <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
            fontSize={fontSize} fontWeight={600} fill={tx} fontFamily="var(--font-mono)">
            {label}
          </text>
        </g>,
      );
    });

    return els;
  }, [gates, selectedId, onSelect]);

  /* ---- Empty drop zones ---- */
  const dropZones = useMemo(() => {
    const zones: React.ReactNode[] = [];
    for (let s = 0; s < numColumns; s++) {
      for (let q = 0; q < numQubits; q++) {
        zones.push(
          <rect key={`z-${s}-${q}`} className="drop-zone"
            x={sx(s) - COL_W / 2} y={qy(q) - ROW_H / 2}
            width={COL_W} height={ROW_H} fill="transparent" />,
        );
      }
    }
    return zones;
  }, [numColumns, numQubits]);

  /* ---- Column labels ---- */
  const stepLabels = useMemo(
    () =>
      Array.from({ length: numColumns }, (_, s) => (
        <text key={`sl-${s}`} x={sx(s)} y={H - 6} textAnchor="middle"
          fontSize={9} fill="var(--text-3, #cbd5e1)" fontFamily="var(--font-mono)">
          {s}
        </text>
      )),
    [numColumns, H],
  );

  return (
    <svg
      ref={svgRef}
      width={W}
      height={H}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onClick={handleBgClick}
      className="circuit-svg"
    >
      <rect className="bg-rect" width={W} height={H} fill="var(--card, #fff)" rx={10} />
      {stepHighlight}
      {dropZones}
      {wires}
      {gateElements}
      {stepLabels}
    </svg>
  );
};

export default CircuitGrid;