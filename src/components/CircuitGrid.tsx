import React, { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import type { CircuitState, PlacedGate, GateName } from '../logic/circuitTypes';
import { isMultiQubit, isParametric, gateDisplayName } from '../logic/circuitTypes';
import { isPlacementValid, offsetsFromGate, projectOffsetsAtQubit } from '../logic/circuitEditing';

/* ------------------------------------------------------------------ */
/*  Props - aligned with App.tsx                                       */
/* ------------------------------------------------------------------ */
interface CircuitGridProps {
  circuit: CircuitState;
  onPlace: (gate: Omit<PlacedGate, 'id'>) => void;
  onRemove: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  stepCol: number | null;
  qubitStateLabels?: string[];
  theme?: 'light' | 'dark';
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
const LIGHT_GATE_COLORS: Record<string, [string, string, string]> = {
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

const DARK_GATE_COLORS: Record<string, [string, string, string]> = {
  H:   ['#1e3a5f', '#60a5fa', '#dbeafe'],
  X:   ['#4c1d1d', '#f87171', '#fecaca'],
  Y:   ['#4b3a06', '#facc15', '#fde68a'],
  Z:   ['#312e81', '#818cf8', '#e0e7ff'],
  S:   ['#3b1f65', '#a78bfa', '#ede9fe'],
  T:   ['#3b1f65', '#a78bfa', '#ede9fe'],
  Sdg: ['#3b1f65', '#a78bfa', '#ede9fe'],
  Tdg: ['#3b1f65', '#a78bfa', '#ede9fe'],
  Rx:  ['#0f3d34', '#34d399', '#ccfbf1'],
  Ry:  ['#0f3d34', '#34d399', '#ccfbf1'],
  Rz:  ['#0f3d34', '#34d399', '#ccfbf1'],
  P:   ['#4b3a06', '#facc15', '#fde68a'],
  I:   ['#1f2937', '#4b5563', '#d1d5db'],
  M:   ['#1f2d3d', '#64748b', '#dbe7f5'],
};

const DEFAULT_LIGHT_GATE_COLOR: [string, string, string] = ['#f3f4f6', '#d1d5db', '#374151'];
const DEFAULT_DARK_GATE_COLOR: [string, string, string] = ['#1f2937', '#4b5563', '#d1d5db'];

const gateColorsFor = (gateName: string, isDarkTheme: boolean): [string, string, string] => {
  if (isDarkTheme) return DARK_GATE_COLORS[gateName] ?? DEFAULT_DARK_GATE_COLOR;
  return LIGHT_GATE_COLORS[gateName] ?? DEFAULT_LIGHT_GATE_COLOR;
};

interface DragMeta {
  gateId?: string;
  gateName?: GateName;
  targetOffsets: number[];
  controlOffsets: number[];
}

const placementIssue = (occupied: number[], numQubits: number): string | null => {
  if (occupied.some((q) => q < 0 || q >= numQubits)) {
    return 'Invalid drop: gate footprint exceeds qubit range.';
  }
  if (new Set(occupied).size !== occupied.length) {
    return 'Invalid drop: control and target lines overlap.';
  }
  return null;
};

/* ================================================================== */
const CircuitGrid: React.FC<CircuitGridProps> = ({
  circuit,
  onPlace,
  onRemove,
  selectedId,
  onSelect,
  stepCol,
  qubitStateLabels,
  theme = 'light',
}) => {
  const { numQubits, numColumns, gates } = circuit;
  const isDarkTheme = theme === 'dark';
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingGateId, setDraggingGateId] = useState<string | null>(null);
  const [dragHover, setDragHover] = useState<{ col: number; qubit: number } | null>(null);
  const [dragMeta, setDragMeta] = useState<DragMeta | null>(null);
  const [showDiscardHint, setShowDiscardHint] = useState(false);
  const [pointerMoveGateId, setPointerMoveGateId] = useState<string | null>(null);
  const [pointerDragBehavior, setPointerDragBehavior] = useState<'move' | 'copy'>('move');
  const pointerDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const pointerDragMovedRef = useRef(false);

  const W = PAD_L + numColumns * COL_W + PAD_R;
  const H = PAD_T + Math.max(numQubits - 1, 0) * ROW_H + BOX + PAD_B;

  const qy = (q: number) => PAD_T + q * ROW_H + BOX / 2;
  const sx = (s: number) => PAD_L + s * COL_W + COL_W / 2;

  const formatQubitTargets = (qs: number[]) => qs.map((q) => `q${q}`).join(', ');

  const gateAriaLabel = useCallback((g: PlacedGate) => {
    const gateName = gateDisplayName[g.gate] ?? g.gate;
    const controls = g.controls.length > 0 ? `, controls ${formatQubitTargets(g.controls)}` : '';
    return `${gateName} gate at column ${g.column}, targets ${formatQubitTargets(g.targets)}${controls}`;
  }, []);

  const handleGateKeyDown = useCallback((e: React.KeyboardEvent<SVGGElement>, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(id);
    }
  }, [onSelect]);

  const gateInteractionProps = useCallback((g: PlacedGate) => ({
    onClick: () => onSelect(g.id),
    onKeyDown: (e: React.KeyboardEvent<SVGGElement>) => handleGateKeyDown(e, g.id),
    tabIndex: 0,
    role: 'button' as const,
    'aria-pressed': g.id === selectedId,
    'aria-label': gateAriaLabel(g),
  }), [gateAriaLabel, handleGateKeyDown, onSelect, selectedId]);

  const getPaletteOffsets = useCallback((gateName: GateName): { targetOffsets: number[]; controlOffsets: number[] } => {
    if (gateName === 'CCX') {
      return { targetOffsets: [2], controlOffsets: [0, 1] };
    }
    if (gateName === 'SWAP' || gateName === 'iSWAP' || gateName === 'XX' || gateName === 'YY' || gateName === 'ZZ') {
      return { targetOffsets: [0, 1], controlOffsets: [] };
    }
    if (gateName === 'CNOT' || gateName === 'CZ') {
      return { targetOffsets: [1], controlOffsets: [0] };
    }
    return { targetOffsets: [0], controlOffsets: [] };
  }, []);

  const getGridAnchorFromClientPoint = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const col = Math.round((clientX - rect.left - PAD_L - COL_W / 2) / COL_W);
    const qubit = Math.round((clientY - rect.top - PAD_T - BOX / 2) / ROW_H);
    const inBounds = col >= 0 && col < numColumns && qubit >= 0 && qubit < numQubits;
    const outsideRect = clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom;
    return { col, qubit, inBounds, outsideRect };
  }, [numColumns, numQubits]);

  const movePlacedGate = useCallback((existing: PlacedGate, col: number, anchorQubit: number) => {
    const offsets = offsetsFromGate(existing);
    const placement = projectOffsetsAtQubit(offsets, anchorQubit);
    if (!isPlacementValid(placement, numQubits)) return false;

    onRemove(existing.id);
    onPlace({
      gate: existing.gate,
      column: col,
      targets: placement.targets,
      controls: placement.controls,
      params: [...existing.params],
      classicalBit: existing.classicalBit,
      condition: existing.condition,
    });
    return true;
  }, [numQubits, onPlace, onRemove]);

  /* ---- Drag and drop ---- */
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const moveGateId = e.dataTransfer.getData('moveGateId');
      const gateName = e.dataTransfer.getData('gateId') as GateName;
      if (!gateName && !moveGateId) return;
      if (!svgRef.current) return;

      const rect = svgRef.current.getBoundingClientRect();
      const col = Math.round((e.clientX - rect.left - PAD_L - COL_W / 2) / COL_W);
      const qubit = Math.round((e.clientY - rect.top - PAD_T - BOX / 2) / ROW_H);

      if (col < 0 || col >= numColumns || qubit < 0 || qubit >= numQubits) {
        setDragHover(null);
        setShowDiscardHint(false);
        return;
      }

      if (moveGateId) {
        const existing = gates.find((x) => x.id === moveGateId);
        if (!existing) return;
        const moved = movePlacedGate(existing, col, qubit);
        if (!moved) return;
        setDraggingGateId(null);
        setDragHover(null);
        setDragMeta(null);
        setShowDiscardHint(false);
        return;
      }

      if (!gateName) return;

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
      setDragHover(null);
      setDragMeta(null);
      setShowDiscardHint(false);
    },
    [gates, movePlacedGate, numColumns, numQubits, onPlace],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!svgRef.current) return;

    const moveGateId = e.dataTransfer.getData('moveGateId');
    const paletteGateId = e.dataTransfer.getData('gateId') as GateName;

    if (moveGateId) {
      const existing = gates.find((x) => x.id === moveGateId);
      if (existing) {
        const occupied = [...existing.targets, ...existing.controls];
        const anchor = Math.min(...occupied);
        setDragMeta({
          gateId: moveGateId,
          gateName: existing.gate,
          targetOffsets: existing.targets.map((t) => t - anchor),
          controlOffsets: existing.controls.map((c) => c - anchor),
        });
      }
    } else if (paletteGateId) {
      const offsets = getPaletteOffsets(paletteGateId);
      setDragMeta({
        gateName: paletteGateId,
        targetOffsets: offsets.targetOffsets,
        controlOffsets: offsets.controlOffsets,
      });
    }

    const rect = svgRef.current.getBoundingClientRect();
    const col = Math.round((e.clientX - rect.left - PAD_L - COL_W / 2) / COL_W);
    const qubit = Math.round((e.clientY - rect.top - PAD_T - BOX / 2) / ROW_H);

    const inBounds = col >= 0 && col < numColumns && qubit >= 0 && qubit < numQubits;
    setDragHover(inBounds ? { col, qubit } : null);

    if (draggingGateId) {
      const outsideRect =
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom;
      setShowDiscardHint(outsideRect);
    }

    const dropMode = moveGateId ? 'move' : 'copy';
    e.dataTransfer.dropEffect = inBounds ? dropMode : 'none';
  }, [draggingGateId, gates, getPaletteOffsets, numColumns, numQubits]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!svgRef.current) return;
    const nextTarget = e.relatedTarget as Node | null;
    if (nextTarget && svgRef.current.contains(nextTarget)) return;
    setDragHover(null);
    setDragMeta(null);
    setShowDiscardHint(Boolean(draggingGateId));
  }, [draggingGateId]);

  useEffect(() => {
    if (!pointerMoveGateId) return;

    const onPointerMove = (e: PointerEvent) => {
      const start = pointerDragStartRef.current;
      if (start) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (!pointerDragMovedRef.current && Math.hypot(dx, dy) < 4) {
          return;
        }
        pointerDragMovedRef.current = true;
      }

      const gridPoint = getGridAnchorFromClientPoint(e.clientX, e.clientY);
      if (!gridPoint) return;

      setDragHover(gridPoint.inBounds ? { col: gridPoint.col, qubit: gridPoint.qubit } : null);
      setShowDiscardHint(pointerDragBehavior === 'move' && gridPoint.outsideRect);
    };

    const onPointerUp = (e: PointerEvent) => {
      const existing = gates.find((gate) => gate.id === pointerMoveGateId);
      const gridPoint = getGridAnchorFromClientPoint(e.clientX, e.clientY);

      if (!pointerDragMovedRef.current) {
        setPointerMoveGateId(null);
        setDraggingGateId(null);
        setDragHover(null);
        setDragMeta(null);
        setShowDiscardHint(false);
        setPointerDragBehavior('move');
        pointerDragStartRef.current = null;
        pointerDragMovedRef.current = false;
        return;
      }

      if (existing && gridPoint) {
        if (gridPoint.outsideRect && pointerDragBehavior === 'move') {
          onRemove(existing.id);
          onSelect(null);
        } else if (gridPoint.inBounds) {
          if (pointerDragBehavior === 'copy') {
            const placement = projectOffsetsAtQubit(offsetsFromGate(existing), gridPoint.qubit);
            if (isPlacementValid(placement, numQubits)) {
              onPlace({
                gate: existing.gate,
                column: gridPoint.col,
                targets: placement.targets,
                controls: placement.controls,
                params: [...existing.params],
                classicalBit: existing.classicalBit,
                condition: existing.condition,
              });
            }
          } else {
            movePlacedGate(existing, gridPoint.col, gridPoint.qubit);
          }
        }
      }

      setPointerMoveGateId(null);
      setDraggingGateId(null);
      setDragHover(null);
      setDragMeta(null);
      setShowDiscardHint(false);
      setPointerDragBehavior('move');
      pointerDragStartRef.current = null;
      pointerDragMovedRef.current = false;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [gates, getGridAnchorFromClientPoint, movePlacedGate, numQubits, onPlace, onRemove, onSelect, pointerDragBehavior, pointerMoveGateId]);

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
              {qubitStateLabels?.[q] ?? '|0⟩'}
            </text>
            <line x1={PAD_L - 6} y1={y} x2={wireEnd} y2={y}
              stroke="var(--text-3, #94a3b8)" strokeWidth={1} />
          </g>
        );
      }),
    [numQubits, numColumns, qubitStateLabels],
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
      const occupied = [...g.targets, ...g.controls];
      const anchor = Math.min(...occupied);
      const targetOffsets = g.targets.map((t) => t - anchor);
      const controlOffsets = g.controls.map((c) => c - anchor);

      const pointerDragProps = {
        onPointerDown: (e: React.PointerEvent<SVGGElement>) => {
          if (e.button !== 0) return;
          e.preventDefault();
          onSelect(g.id);
          pointerDragStartRef.current = { x: e.clientX, y: e.clientY };
          pointerDragMovedRef.current = false;
          setDraggingGateId(g.id);
          setPointerMoveGateId(g.id);
          setPointerDragBehavior(e.altKey ? 'copy' : 'move');
          setDragMeta({
            gateId: g.id,
            gateName: g.gate,
            targetOffsets,
            controlOffsets,
          });
          setShowDiscardHint(false);
        },
      };
      const gateClassName = `qgate${draggingGateId === g.id ? ' dragging' : ''}`;

      /* ---------- CNOT ---------- */
      if (g.gate === 'CNOT' && g.controls.length > 0) {
        const cy = qy(g.controls[0]);
        const ty = qy(g.targets[0]);
        els.push(
          <g key={g.id} className={gateClassName} {...gateInteractionProps(g)} {...pointerDragProps}>
            <line x1={x} y1={cy} x2={x} y2={ty} stroke={accent ?? (isDarkTheme ? '#93c5fd' : '#1e40af')} strokeWidth={sw} />
            <circle cx={x} cy={cy} r={5} fill={accent ?? (isDarkTheme ? '#93c5fd' : '#1e40af')} />
            <circle cx={x} cy={ty} r={R_TGT} fill="var(--card, #fff)" stroke={accent ?? (isDarkTheme ? '#93c5fd' : '#1e40af')} strokeWidth={sw} />
            <line x1={x - R_TGT} y1={ty} x2={x + R_TGT} y2={ty} stroke={accent ?? (isDarkTheme ? '#93c5fd' : '#1e40af')} strokeWidth={1.5} />
            <line x1={x} y1={ty - R_TGT} x2={x} y2={ty + R_TGT} stroke={accent ?? (isDarkTheme ? '#93c5fd' : '#1e40af')} strokeWidth={1.5} />
          </g>,
        );
        return;
      }

      /* ---------- CZ ---------- */
      if (g.gate === 'CZ' && g.controls.length > 0) {
        const cy = qy(g.controls[0]);
        const ty = qy(g.targets[0]);
        els.push(
          <g key={g.id} className={gateClassName} {...gateInteractionProps(g)} {...pointerDragProps}>
            <line x1={x} y1={cy} x2={x} y2={ty} stroke={accent ?? (isDarkTheme ? '#c4b5fd' : '#4527a0')} strokeWidth={sw} />
            <circle cx={x} cy={cy} r={5} fill={accent ?? (isDarkTheme ? '#c4b5fd' : '#4527a0')} />
            <circle cx={x} cy={ty} r={5} fill={accent ?? (isDarkTheme ? '#c4b5fd' : '#4527a0')} />
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
          <g key={g.id} className={gateClassName} {...gateInteractionProps(g)} {...pointerDragProps}>
            <line x1={x} y1={y1} x2={x} y2={y2} stroke={accent ?? (isDarkTheme ? '#fdba74' : '#c2410c')} strokeWidth={sw} />
            <line x1={x - d} y1={y1 - d} x2={x + d} y2={y1 + d} stroke={accent ?? (isDarkTheme ? '#fdba74' : '#c2410c')} strokeWidth={2.2} />
            <line x1={x + d} y1={y1 - d} x2={x - d} y2={y1 + d} stroke={accent ?? (isDarkTheme ? '#fdba74' : '#c2410c')} strokeWidth={2.2} />
            <line x1={x - d} y1={y2 - d} x2={x + d} y2={y2 + d} stroke={accent ?? (isDarkTheme ? '#fdba74' : '#c2410c')} strokeWidth={2.2} />
            <line x1={x + d} y1={y2 - d} x2={x - d} y2={y2 + d} stroke={accent ?? (isDarkTheme ? '#fdba74' : '#c2410c')} strokeWidth={2.2} />
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
          <g key={g.id} className={gateClassName} {...gateInteractionProps(g)} {...pointerDragProps}>
            <line x1={x} y1={y1} x2={x} y2={y2} stroke={accent ?? (isDarkTheme ? '#5eead4' : '#0f766e')} strokeWidth={sw} />
            <circle cx={x} cy={y1} r={4.5} fill={accent ?? (isDarkTheme ? '#5eead4' : '#0f766e')} />
            <circle cx={x} cy={y2} r={4.5} fill={accent ?? (isDarkTheme ? '#5eead4' : '#0f766e')} />
            <rect x={x - 13} y={mid - 10} width={26} height={20} rx={4} fill={isDarkTheme ? '#12363a' : '#ecfeff'} stroke={accent ?? (isDarkTheme ? '#5eead4' : '#0f766e')} strokeWidth={1.5} />
            <text x={x} y={mid} textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={700} fill={isDarkTheme ? '#99f6e4' : '#115e59'}>{label}</text>
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
          <g key={g.id} className={gateClassName} {...gateInteractionProps(g)} {...pointerDragProps}>
            <line x1={x} y1={Math.min(c1, c2)} x2={x} y2={Math.max(c1, c2)} stroke={accent ?? (isDarkTheme ? '#c4b5fd' : '#5b21b6')} strokeWidth={sw} />
            <line x1={x} y1={Math.min(c1, c2)} x2={x} y2={ty} stroke={accent ?? (isDarkTheme ? '#c4b5fd' : '#5b21b6')} strokeWidth={sw} />
            <circle cx={x} cy={c1} r={5} fill={accent ?? (isDarkTheme ? '#c4b5fd' : '#5b21b6')} />
            <circle cx={x} cy={c2} r={5} fill={accent ?? (isDarkTheme ? '#c4b5fd' : '#5b21b6')} />
            <circle cx={x} cy={ty} r={R_TGT} fill="var(--card, #fff)" stroke={accent ?? (isDarkTheme ? '#c4b5fd' : '#5b21b6')} strokeWidth={sw} />
            <line x1={x - R_TGT} y1={ty} x2={x + R_TGT} y2={ty} stroke={accent ?? (isDarkTheme ? '#c4b5fd' : '#5b21b6')} strokeWidth={1.5} />
            <line x1={x} y1={ty - R_TGT} x2={x} y2={ty + R_TGT} stroke={accent ?? (isDarkTheme ? '#c4b5fd' : '#5b21b6')} strokeWidth={1.5} />
          </g>,
        );
        return;
      }

      /* ---------- Single-qubit gates ---------- */
      const tgt = g.targets[0];
      const y = qy(tgt);
      const [fl, st, tx] = gateColorsFor(g.gate, isDarkTheme);
      const label = gateDisplayName[g.gate] ?? g.gate;
      const fontSize = label.length > 2 ? 10 : 14;

      els.push(
        <g key={g.id} className={gateClassName} {...gateInteractionProps(g)} {...pointerDragProps}>
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
  }, [gates, onSelect, selectedId, draggingGateId, gateInteractionProps, isDarkTheme]);

  const dragPreview = useMemo(() => {
    if (!dragHover || !dragMeta) return null;
    const placement = projectOffsetsAtQubit(
      { targetOffsets: dragMeta.targetOffsets, controlOffsets: dragMeta.controlOffsets },
      dragHover.qubit,
    );
    const issue = placementIssue(placement.occupied, numQubits);
    const valid = issue === null;

    const previewRows = placement.occupied.filter((q) => q >= 0 && q < numQubits);
    if (previewRows.length === 0) return null;

    const targets = new Set(placement.targets);
    const controls = new Set(placement.controls);
    const previewClass = (isTarget: boolean) => `drop-preview ${isTarget ? 'target' : 'control'}${valid ? '' : ' invalid'}`;

    const visibleControls = [...controls].filter((q) => q >= 0 && q < numQubits);
    const visibleTargets = [...targets].filter((q) => q >= 0 && q < numQubits);

    return (
      <g className="drop-preview-group" pointerEvents="none">
        {previewRows.map((q) => (
          <rect
            key={`preview-${q}`}
            className={previewClass(targets.has(q))}
            x={sx(dragHover.col) - COL_W / 2 + 2}
            y={qy(q) - ROW_H / 2 + 2}
            width={COL_W - 4}
            height={ROW_H - 4}
            rx={7}
          />
        ))}
        {visibleControls.length > 0 && visibleTargets.length > 0 && (
          <line
            className={`drop-preview-link${valid ? '' : ' invalid'}`}
            x1={sx(dragHover.col)}
            y1={qy(Math.min(...visibleControls))}
            x2={sx(dragHover.col)}
            y2={qy(Math.max(...visibleTargets))}
          />
        )}
      </g>
    );
  }, [dragHover, dragMeta, numQubits]);

  const invalidHint = useMemo(() => {
    if (!dragHover || !dragMeta) return null;
    const placement = projectOffsetsAtQubit(
      { targetOffsets: dragMeta.targetOffsets, controlOffsets: dragMeta.controlOffsets },
      dragHover.qubit,
    );
    const issue = placementIssue(placement.occupied, numQubits);
    if (!issue) return null;

    return (
      <g className="drag-invalid-hint" pointerEvents="none">
        <rect x={12} y={10} width={320} height={24} rx={12} />
        <text x={172} y={22} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
          {issue}
        </text>
      </g>
    );
  }, [dragHover, dragMeta, numQubits]);

  const discardHint = useMemo(() => {
    if (!showDiscardHint || !draggingGateId) return null;
    return (
      <g className="drag-discard-hint" pointerEvents="none">
        <rect x={W - 212} y={10} width={200} height={24} rx={12} />
        <text x={W - 112} y={22} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
          Release outside to discard gate
        </text>
      </g>
    );
  }, [W, showDiscardHint, draggingGateId]);

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
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleBgClick}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onSelect(null);
      }}
      className="circuit-svg"
      role="img"
      aria-label="Quantum circuit grid. Drag a gate to place it. Press Enter on a focused gate to select it."
    >
      <title>Quantum circuit grid</title>
      <rect className="bg-rect" width={W} height={H} fill="var(--card, #fff)" rx={10} />
      {stepHighlight}
      {dragPreview}
      {invalidHint}
      {discardHint}
      {dropZones}
      {wires}
      {gateElements}
      {stepLabels}
    </svg>
  );
};

export default CircuitGrid;