export type GateName =
  | 'I' | 'H' | 'X' | 'Y' | 'Z'
  | 'S' | 'Sdg' | 'T' | 'Tdg'
  | 'Rx' | 'Ry' | 'Rz' | 'P'
  | 'CNOT' | 'CZ' | 'SWAP'
  | 'CCX' | 'iSWAP' | 'XX' | 'YY' | 'ZZ'
  | 'M' | 'Barrier';

export interface PlacedGate {
  id: string;
  gate: GateName;
  column: number;
  targets: number[];
  controls: number[];
  params: number[];
  classicalBit?: number;
  condition?: number;
}

export interface CircuitState {
  numQubits: number;
  numColumns: number;
  gates: PlacedGate[];
}

export const isSingleQubit = (g: GateName) =>
  ['I','H','X','Y','Z','S','Sdg','T','Tdg','Rx','Ry','Rz','P'].includes(g);
export const isParametric = (g: GateName) => ['Rx','Ry','Rz','P','XX','YY','ZZ'].includes(g);
export const isMultiQubit = (g: GateName) => ['CNOT','CZ','SWAP','CCX','iSWAP','XX','YY','ZZ'].includes(g);

export const gateDisplayName: Record<GateName, string> = {
  I:'I', H:'H', X:'X', Y:'Y', Z:'Z', S:'S', Sdg:'S†', T:'T', Tdg:'T†',
  Rx:'Rx', Ry:'Ry', Rz:'Rz', P:'P',
  CNOT:'CX', CZ:'CZ', SWAP:'SW', CCX:'CCX', iSWAP:'iSW', XX:'XX', YY:'YY', ZZ:'ZZ',
  M:'M', Barrier:'┃',
};

export const gateColor: Record<GateName, string> = {
  I:'#94a3b8', H:'#6366f1', X:'#ef4444', Y:'#22c55e', Z:'#3b82f6',
  S:'#8b5cf6', Sdg:'#8b5cf6', T:'#d946ef', Tdg:'#d946ef',
  Rx:'#f97316', Ry:'#f97316', Rz:'#f97316', P:'#eab308',
  CNOT:'#6366f1', CZ:'#3b82f6', SWAP:'#14b8a6', CCX:'#c084fc', iSWAP:'#86efac', 
  XX:'#fbbf24', YY:'#34d399', ZZ:'#60a5fa',
  M:'#64748b', Barrier:'#cbd5e1',
};

export const newGateId = () => Math.random().toString(36).slice(2, 10);