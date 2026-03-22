/**
 * Layout Constants
 * Centralized UI dimensions and spacing values
 */
export const LAYOUT = {
  // Circuit Grid
  PADDING_LEFT: 72,
  PADDING_TOP: 28,
  PADDING_RIGHT: 36,
  PADDING_BOTTOM: 28,
  ROW_HEIGHT: 52,
  COLUMN_WIDTH: 60,
  GATE_BOX_SIZE: 34,
  GATE_TARGET_RADIUS: 11,

  // Bloch Sphere
  BLOCH_RADIUS: 55,
  BLOCH_CENTER_X: 70,
  BLOCH_CENTER_Y: 70,

  // Grid
  BLOCH_CIRCLE_STEPS: 72,
} as const;

/**
 * Quantum Circuit Constraints
 */
export const CIRCUIT_CONSTRAINTS = {
  MIN_QUBITS: 1,
  MAX_QUBITS: 6,
  MIN_COLUMNS: 4,
  MAX_COLUMNS: 60,
  DEFAULT_QUBITS: 2,
  DEFAULT_COLUMNS: 10,
  AUTO_EXPAND_THRESHOLD: 2, // columns before end to auto-expand
  AUTO_EXPAND_AMOUNT: 4,
} as const;

/**
 * Simulation Parameters
 */
export const SIMULATION = {
  DEFAULT_SHOTS: 1024,
  MAX_SHOTS: 10000,
  ANGLE_PRECISION: 3,
  AMPLITUDE_THRESHOLD: 1e-10,
  NORMALIZE_EPSILON: 1e-15,
} as const;

/**
 * UI Configuration
 */
export const UI_CONFIG = {
  THEME_STORAGE_KEY: 'quantum-tutor-theme',
  CIRCUIT_STORAGE_KEY: 'quantum-tutor-circuit',
  ANIMATION_DURATION_MS: 120,
} as const;

/**
 * Gate Colors - [fill, stroke, text]
 */
export const GATE_COLORS: Record<string, readonly [string, string, string]> = {
  H: ['#dbeafe', '#60a5fa', '#1e40af'],
  X: ['#fee2e2', '#f87171', '#b91c1c'],
  Y: ['#fef9c3', '#facc15', '#854d0e'],
  Z: ['#e0e7ff', '#818cf8', '#3730a3'],
  S: ['#ede9fe', '#a78bfa', '#5b21b6'],
  T: ['#ede9fe', '#a78bfa', '#5b21b6'],
  Sdg: ['#ede9fe', '#a78bfa', '#5b21b6'],
  Tdg: ['#ede9fe', '#a78bfa', '#5b21b6'],
  Rx: ['#d1fae5', '#6ee7b7', '#065f46'],
  Ry: ['#d1fae5', '#6ee7b7', '#065f46'],
  Rz: ['#d1fae5', '#6ee7b7', '#065f46'],
  P: ['#fef9c3', '#facc15', '#854d0e'],
  I: ['#f3f4f6', '#d1d5db', '#6b7280'],
  M: ['#f1f5f9', '#64748b', '#334155'],
  CCX: ['#c084fc', '#a855f7', '#6b21a8'],
  iSWAP: ['#86efac', '#22c55e', '#166534'],
} as const;

export const DEFAULT_GATE_COLOR: readonly [string, string, string] = [
  '#f3f4f6',
  '#d1d5db',
  '#374151',
] as const;
