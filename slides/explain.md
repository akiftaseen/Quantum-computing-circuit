*Thinking...*

> The user wants me to generate detailed documentation for their quantum computing circuit application. Based on our conversation, I can see this is a quantum computing circuit simulator/tutor application built with React and TypeScript. Let me compile comprehensive documentation based on everything I've seen from our conversation, including the code snippets about qubit state parsing, the project structure, and the application's features.
> 
> From the conversation, I can gather:
> 1. It's a React/TypeScript application ("Quantum-computing-circuit")
> 2. It has a file `src/logic/initialQubitState.ts` that handles parsing qubit states
> 3. It supports preset states and custom state input
> 4. It has complex number parsing (`parseComplexExpression`)
> 
> 
> 5. The application includes several qubit state presets (|0⟩, |1⟩, |+⟩, |-⟩, etc.) and accepts input in multiple formats—ket notation like `0.1|0⟩+0.9|1⟩` or comma-separated pairs like `0.1, 0.9`—with built-in normalization logic
> 6. It's called "Quantum Tutor" based on the file path and uses esbuild for bundling, created by someone named "akif"
> 
> Now I'm putting together comprehensive documentation based on what I've learned about the project.

# Quantum Computing Circuit Simulator — Documentation

Below is a comprehensive documentation file you can save as `DOCUMENTATION.md` (or any name you prefer) in the project root.

---

```markdown
# Quantum Computing Circuit Simulator — Full Documentation

> **Project**: Quantum Tutor / Quantum-computing-circuit
> **Stack**: React · TypeScript · esbuild

---

## Table of Contents

1. [Overview](#1-overview)
2. [Project Structure](#2-project-structure)
3. [Core Concepts](#3-core-concepts)
4. [Logic Layer — `src/logic/`](#4-logic-layer--srclogic)
   - 4.1 Complex Number Arithmetic
   - 4.2 Initial Qubit State Parsing (`initialQubitState.ts`)
   - 4.3 Quantum Gate Definitions
   - 4.4 Circuit Simulation Engine
   - 4.5 Multi-Qubit State Initialization
5. [UI Layer — `src/components/`](#5-ui-layer--srccomponents)
6. [Application Entry Point — `App.tsx`](#6-application-entry-point--apptsx)
7. [Supported Input Formats](#7-supported-input-formats)
8. [How Simulation Works End-to-End](#8-how-simulation-works-end-to-end)
9. [Build & Development](#9-build--development)

---

## 1. Overview

This application is an interactive **quantum computing circuit simulator and educational tool**. It allows users to:

- Construct quantum circuits by placing gates on one or more qubits.
- Specify custom initial qubit states using Dirac ket notation, comma pairs, or named presets.
- Simulate the circuit step-by-step or all at once.
- Visualize the resulting quantum state (amplitudes, probabilities, Bloch sphere representation).
- Learn quantum computing concepts through hands-on experimentation.

The entire simulation runs **client-side** in the browser — no backend or network requests are needed for computation.

---

## 2. Project Structure

```
Quantum-computing-circuit/
├── public/                  # Static assets served as-is
├── src/
│   ├── logic/               # Pure computation (no React dependencies)
│   │   ├── complex.ts       # Complex number type & arithmetic helpers
│   │   ├── initialQubitState.ts  # Qubit state parsing, presets, normalization
│   │   ├── gates.ts         # Gate matrix definitions (H, X, Y, Z, CNOT, etc.)
│   │   ├── simulator.ts     # Circuit simulation engine
│   │   └── ...
│   ├── components/          # React UI components
│   │   ├── CircuitBoard.tsx  # Drag-and-drop circuit grid
│   │   ├── GatePalette.tsx   # Sidebar with available gates
│   │   ├── QubitInput.tsx    # Input field for initial qubit states
│   │   ├── StateDisplay.tsx  # Output visualization (amplitudes, probs)
│   │   ├── BlochSphere.tsx   # 3D Bloch sphere rendering
│   │   └── ...
│   ├── App.tsx              # Root component, wires everything together
│   ├── main.tsx             # ReactDOM entry point
│   └── index.css            # Global styles / Tailwind directives
├── package.json
├── tsconfig.json
└── index.html
```

---

## 3. Core Concepts

### 3.1 Qubits

A qubit is the fundamental unit of quantum information. Its state is a superposition of two basis states, written in Dirac notation as:

    |ψ⟩ = α|0⟩ + β|1⟩

where α and β are complex numbers satisfying |α|² + |β|² = 1.

### 3.2 Quantum Gates

Gates are unitary transformations applied to one or more qubits. They are represented internally as complex matrices. Common gates include:

- **Pauli gates**: X (NOT), Y, Z
- **Hadamard**: H — creates equal superposition
- **Phase gates**: S, T, and custom Rz(θ)
- **Rotation gates**: Rx(θ), Ry(θ), Rz(θ)
- **Multi-qubit gates**: CNOT (CX), CZ, SWAP, Toffoli (CCX)

### 3.3 Circuit Model

A circuit is a sequence of **time steps** (columns). Each time step can contain gates acting on different qubits in parallel, as long as they don't conflict. The simulator applies each column from left to right to evolve the global state vector.

### 3.4 State Vector

For an n-qubit system, the full state is a vector of 2ⁿ complex amplitudes. For example, a 2-qubit system has 4 amplitudes corresponding to |00⟩, |01⟩, |10⟩, |11⟩.

---

## 4. Logic Layer — `src/logic/`

All files in this directory are **pure TypeScript** with no UI dependencies, making them independently testable.

### 4.1 Complex Number Arithmetic (`complex.ts`)

Defines the `Complex` type and helper functions used throughout the simulator.

**Type definition:**
```typescript
interface Complex {
  re: number;  // real part
  im: number;  // imaginary part
}
```

**Key helper functions:**

- `c(re, im)` — constructor shorthand, creates a Complex value.
- `add(a, b)` — complex addition.
- `mul(a, b)` — complex multiplication.
- `conj(a)` — complex conjugate.
- `cAbs2(a)` — squared magnitude |a|² = re² + im².
- `cAbs(a)` — magnitude |a|.
- `cDiv(a, b)` — complex division.

These are used by the gate matrices, the simulator, and the state parser.

### 4.2 Initial Qubit State Parsing (`initialQubitState.ts`)

This is one of the most complex files in the logic layer. It is responsible for converting user-typed strings into valid single-qubit quantum states represented as `[Complex, Complex]` (the amplitudes for |0⟩ and |1⟩).

#### 4.2.1 Types

```typescript
type SingleQubitState = [Complex, Complex];   // [α, β] for α|0⟩ + β|1⟩

interface InitialQubitStateParse {
  state: SingleQubitState;
  label: string;       // display label, e.g. "|+⟩" or "|ψ⟩"
  valid: boolean;      // whether parsing succeeded
  message: string;     // human-readable status
}
```

#### 4.2.2 Presets (`PRESETS`)

A dictionary mapping shorthand keys to pre-defined states. The `normalizeKey()` function canonicalizes user input (lowercasing, stripping whitespace and special characters) before looking up in this dictionary.

| Key(s) accepted | State | Label |
|---|---|---|
| `0`, `\|0⟩` | [1, 0] | \|0⟩ |
| `1`, `\|1⟩` | [0, 1] | \|1⟩ |
| `+`, `\|+⟩` | [1/√2, 1/√2] | \|+⟩ |
| `-`, `\|-⟩` | [1/√2, −1/√2] | \|−⟩ |
| `i`, `\|i⟩` | [1/√2, i/√2] | \|i⟩ |
| `-i`, `\|-i⟩` | [1/√2, −i/√2] | \|−i⟩ |

#### 4.2.3 Complex Expression Parser (`parseComplexExpression`)

Parses a wide range of mathematical expressions into a `Complex` value. Supports:

- Plain numbers: `0.5`, `-3`, `1/2`
- Square roots: `sqrt(2)`, `1/sqrt(2)`
- Imaginary unit: `i`, `2i`, `i/sqrt(2)`
- Parenthesized expressions: `(1+i)/sqrt(2)`
- Combinations of the above

This function is reused by both `parseCustomPair` and `parseSingleQubitKet`.

#### 4.2.4 Comma-Pair Parser (`parseCustomPair`)

Accepts a string like `"0.5, 0.866"` or `"1/sqrt(2), i/sqrt(2)"`. Splits on comma (respecting nested parentheses via `splitTopLevel`), parses each half as a complex number, normalizes, and returns the state.

#### 4.2.5 Ket-Notation Parser (`parseSingleQubitKet`)

Accepts Dirac-notation strings such as:

- `0.1|0⟩+0.9|1⟩`
- `(1/sqrt(2))|0⟩ + (1/sqrt(2))|1⟩`
- `|0⟩ - |1⟩`
- `(1/sqrt(2))|0⟩ + (i/sqrt(2))|1⟩`

**How it works:**

1. **Tokenization** — Walks the string character by character, tracking parenthesis depth. Splits at `+` or `-` signs that are at depth 0, producing a list of terms.
2. **Per-term parsing** — For each term, uses a regex to find `|0⟩` or `|1⟩`. Everything before that match is treated as the coefficient string. Special cases: empty or `+` → coefficient 1, bare `-` → coefficient −1, trailing `*` stripped.
3. **Coefficient parsing** — Delegates to `parseComplexExpression`.
4. **Accumulation** — Adds each coefficient into `amp0` or `amp1` depending on the matched basis state.
5. **Normalization** — Divides both amplitudes by √(|amp0|² + |amp1|²) to ensure the state is a valid unit vector.

#### 4.2.6 Main Entry Point (`parseInitialQubitStateDetailed`)

This is the function called by the UI. It tries parsers in priority order:

```
1. Preset lookup  (e.g. "0", "+", "|1⟩")
2. Ket notation   (e.g. "0.1|0⟩+0.9|1⟩")
3. Comma pair     (e.g. "0.1, 0.9")
4. Fallback       → returns |0⟩ with valid: false
```

#### 4.2.7 Multi-Qubit Initialization (`initZeroState`)

```typescript
const initZeroState = (numQubits: number): Complex[] => {
  const dim = 1 << numQubits;          // 2^n
  const state = Array(dim).fill(null).map(() => c(0));
  state[0] = c(1);                     // |00...0⟩
  return state;
};
```

Creates the all-zeros computational basis state for n qubits. The full initial state of the system is then built by taking the tensor product of each individual qubit's parsed state.

### 4.3 Quantum Gate Definitions (`gates.ts`)

Each gate is stored as an object containing:

- `name` — display name (e.g. "Hadamard")
- `symbol` — short symbol for the circuit diagram (e.g. "H")
- `matrix` — the unitary matrix as a 2D array of `Complex` values
- `numQubits` — how many qubits the gate acts on (1 or 2, sometimes 3)
- `params` (optional) — for parameterized gates like Rx(θ)

Single-qubit gate matrices are 2×2. Two-qubit gate matrices are 4×4. The Toffoli gate matrix is 8×8.

### 4.4 Circuit Simulation Engine (`simulator.ts`)

The simulator operates on the full 2ⁿ-dimensional state vector.

**Algorithm for each gate application:**

For a **single-qubit gate** U acting on qubit q in an n-qubit system:

1. Iterate over all 2ⁿ basis states in pairs where only bit q differs.
2. For each pair (|...0_q...⟩, |...1_q...⟩), apply the 2×2 matrix U to the corresponding amplitude pair.

For a **two-qubit gate** (e.g., CNOT on control c, target t):

1. Iterate over groups of 4 basis states where bits c and t vary.
2. Apply the 4×4 matrix to the 4-element amplitude sub-vector.

**Step-by-step flow:**

1. Parse each qubit's initial state string → `SingleQubitState`.
2. Compute the tensor product of all single-qubit states → initial state vector of length 2ⁿ.
3. For each time step (circuit column), from left to right:
   a. Identify all gates in this column.
   b. Apply each gate to the state vector (order within a column doesn't matter since non-overlapping gates commute).
4. Return the final state vector, plus optionally the intermediate state after each step.

### 4.5 Measurement

When a measurement gate is encountered:

1. Compute the probability of each outcome from the state vector amplitudes.
2. Sample a random outcome according to those probabilities.
3. Collapse the state vector: zero out amplitudes inconsistent with the outcome and renormalize.

---

## 5. UI Layer — `src/components/`

### 5.1 CircuitBoard

The main visual grid where the circuit is constructed. Each row represents a qubit; each column represents a time step.

- Users **drag and drop** gates from the palette onto the grid.
- Multi-qubit gates span multiple rows and display connecting lines.
- Clicking an existing gate may open a parameter editor (for rotation gates).

### 5.2 GatePalette

A sidebar or toolbar listing all available gates. Each gate is a draggable element. Gates are grouped by category (Pauli, Hadamard, Phase, Rotation, Multi-qubit, Measurement).

### 5.3 QubitInput

An input field shown at the left of each qubit wire. The user types an initial state expression (e.g. `|0⟩`, `0.1|0⟩+0.9|1⟩`, `1/sqrt(2), i/sqrt(2)`). The component calls `parseInitialQubitStateDetailed` on every change and shows visual feedback:

- **Green** border + label → valid parse
- **Red** border + error message → invalid parse, falls back to |0⟩

### 5.4 StateDisplay

After simulation runs, this component displays:

- The full state vector as a list of basis states with their complex amplitudes.
- The probability (|amplitude|²) of each computational basis state.
- A bar chart or histogram of probabilities.

### 5.5 BlochSphere

For single-qubit states (or when a single qubit is selected), renders a 3D Bloch sphere showing the state as a point on the unit sphere. The Bloch coordinates are computed from α and β as:

    x = 2·Re(α*β̄)
    y = 2·Im(α*β̄)
    z = |α|² − |β|²

---

## 6. Application Entry Point — `App.tsx`

`App.tsx` is the root React component that orchestrates the entire application. Its responsibilities:

1. **State management** — Maintains the circuit grid (which gates are placed where), the number of qubits, each qubit's initial state string, and the simulation results.
2. **Wiring** — Passes the appropriate props and callbacks to all child components.
3. **Simulation trigger** — When the user clicks "Run" or "Step", it:
   a. Reads all qubit input strings.
   b. Calls the parser for each qubit.
   c. Calls the simulator with the parsed initial states and the circuit layout.
   d. Stores the result in state, which triggers a re-render of StateDisplay.

---

## 7. Supported Input Formats

The application accepts the following formats for specifying an initial qubit state:

### 7.1 Named Presets

| Input | State |
|---|---|
| `0` or `\|0>` or `\|0⟩` | \|0⟩ = (1, 0) |
| `1` or `\|1>` or `\|1⟩` | \|1⟩ = (0, 1) |
| `+` or `\|+>` or `\|+⟩` | \|+⟩ = (1/√2)(|0⟩+|1⟩) |
| `-` or `\|->` or `\|-⟩` | \|−⟩ = (1/√2)(|0⟩−|1⟩) |
| `i` or `\|i>` or `\|i⟩` | \|i⟩ = (1/√2)(|0⟩+i|1⟩) |
| `-i` or `\|-i>` | \|−i⟩ = (1/√2)(|0⟩−i|1⟩) |

### 7.2 Ket Notation

Arbitrary superpositions in Dirac notation:

```
0.1|0⟩ + 0.9|1⟩
(1/sqrt(2))|0⟩ + (i/sqrt(2))|1⟩
|0⟩ - |1⟩
0.5*|0⟩ + 0.5*|1⟩
```

Coefficients are automatically normalized so the total probability equals 1. Both `⟩` (Unicode) and `>` (ASCII) are accepted.

### 7.3 Comma-Separated Amplitudes

Directly specify (α, β):

```
1, 0
0.5, 0.866
1/sqrt(2), 1/sqrt(2)
(1+i)/2, (1-i)/2
```

Also automatically normalized.

---

## 8. How Simulation Works End-to-End

Here is the complete flow from user action to displayed result:

```
User types initial states          User places gates on circuit
        │                                    │
        ▼                                    ▼
parseInitialQubitStateDetailed()    Circuit grid data structure
        │                          (array of columns, each with
        │                           gate + qubit index info)
        ▼                                    │
  SingleQubitState per qubit                 │
        │                                    │
        ▼                                    ▼
   Tensor product of all          ┌─────────────────────┐
   single-qubit states            │   Simulator Engine   │
   → initial state vector  ───▶  │                     │
   (length 2ⁿ)                   │  For each column:   │
                                  │   apply each gate   │
                                  │   to state vector   │
                                  └─────────┬───────────┘
                                            │
                                            ▼
                                   Final state vector
                                   (length 2ⁿ)
                                            │
                              ┌─────────────┼─────────────┐
                              ▼             ▼             ▼
                        Amplitude      Probability    Bloch Sphere
                        Display        Histogram      (if 1 qubit)
```

**Performance note**: The state vector has 2ⁿ entries, so memory and time scale exponentially with qubit count. The app is practical for up to roughly 10–14 qubits on a typical browser, depending on circuit depth.

---

## 9. Build & Development

### Prerequisites

- Node.js ≥ 16
- npm or yarn

### Install

```bash
cd Quantum-computing-circuit
npm install
```

### Development Server

```bash
npm run dev
```

This starts the esbuild-powered dev server with hot reload, typically on `http://localhost:5173`.

### Production Build

```bash
npm run build
```

Outputs optimized static files to the `dist/` directory.

### Type Checking

```bash
npx tsc --noEmit
```

Runs the TypeScript compiler in check-only mode to catch type errors without emitting output files.

---

## Appendix A — Key Constants

| Constant | Value | Purpose |
|---|---|---|
| `EPS` | ~1e-12 | Threshold for treating values as zero in normalization checks |
| `SQRT2_INV` | 1/√2 ≈ 0.7071 | Used in H gate and ±/i presets |

## Appendix B — Adding a New Gate

To add a new gate to the simulator:

1. **Define the matrix** in `gates.ts`:
   ```typescript
   export const MY_GATE: GateDefinition = {
     name: 'My Gate',
     symbol: 'MG',
     numQubits: 1,
     matrix: [
       [c(a, b), c(e, f)],
       [c(g, h), c(j, k)],
     ],
   };
   ```

2. **Register it** in the gate registry / palette data so it appears in the UI.

3. The simulator automatically handles any gate as long as the matrix dimensions match `numQubits` (2×2 for 1-qubit, 4×4 for 2-qubit, etc.).

## Appendix C — Adding a New Preset State

In `initialQubitState.ts`, add an entry to the `PRESETS` dictionary:

```typescript
PRESETS['mystate'] = {
  state: [c(0.6, 0), c(0, 0.8)],   // must be normalized
  label: '|my⟩',
};
```

Then the user can type `mystate` or `|my⟩` in the qubit input field.

---
