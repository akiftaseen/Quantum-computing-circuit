# Quantum Circuit Tutor

Interactive quantum circuit simulator built with React + TypeScript + Vite.

## What This App Does

- Build quantum circuits with drag-and-drop gates.
- Simulate state vectors, probabilities, Bloch vectors, and measurement shots.
- Step through execution column-by-column.
- Inspect gate matrices and overall unitary (for small systems).
- Export circuits to multiple frameworks and formats.
- Import OpenQASM files.

## Features

### Circuit Building
- Gate palette with basic, phase, rotation, multi-qubit, and interaction gates.
- Supports up to 6 qubits.
- Auto-expands columns when placing gates near the end.
- Undo/redo history.

### Quantum Gates
- Single-qubit: `I H X Y Z S Sdg T Tdg Rx Ry Rz P`
- Multi-qubit: `CNOT CZ SWAP CCX iSWAP XX YY ZZ`
- Measurement and barrier support.

### Visualizations
- Probability bar chart.
- Interactive Dirac notation view (select basis states, phase color highlighting).
- Bloch spheres per qubit.
- Unitary matrix display (small circuits).
- Shot histogram.

### Educational Tools
- Gate reference modal with formulas and use-cases.
- Circuit analysis panel (gate counts, depth, estimated cost, optimization hints).
- Templates including Bell, GHZ, QFT, Grover, VQE, Ising examples.

### Interop and Export
- Export to:
  - Qiskit (Python)
  - PennyLane (Python)
  - Cirq (Python)
  - LaTeX `quantikz`
- Save/load JSON circuit files.
- Share circuit state by URL.
- Import `.qasm` / `.txt` OpenQASM-like files.

## Keyboard Shortcuts

- `Ctrl/Cmd + Z`: Undo
- `Ctrl/Cmd + Shift + Z`: Redo
- `Delete` / `Backspace`: Remove selected gate
- `Arrow Left` / `Arrow Right`: Move step cursor
- `1..6` with a gate selected: quick place `H X Y Z S T` on next column

## Theme

Theme mode cycles with the header button:
- Light
- Dark
- Auto (system preference)

Theme preference is persisted in local storage.

## Run Locally

### 1. Install dependencies

```bash
npm install
```

### 2. Start dev server

```bash
npm run dev
```

Open the URL shown in terminal (usually `http://localhost:5173` or next available port).

### 3. Build for production

```bash
npm run build
```

### 4. Preview production build

```bash
npm run preview
```

## Testing

```bash
npm run test
npm run test:ui
npm run test:coverage
```

## Project Structure

- `src/App.tsx`: Main application composition.
- `src/components/`: UI components (`CircuitGrid`, `GatePalette`, `ExportPanel`, etc.).
- `src/logic/`: Simulation core, gates, serializers, exporters/importers.
- `src/hooks/`: Reusable hooks (`useCircuitHistory`, `useTheme`).
- `src/test/`: Test setup.

## Notes and Limits

- State-vector simulation scales exponentially with qubit count.
- Unitary visualization is intentionally limited to small systems.
- OpenQASM import currently supports common gate statements and measurements.

## Scripts

- `npm run dev` - start development server
- `npm run build` - type-check and build
- `npm run preview` - preview built app
- `npm run lint` - run ESLint
- `npm run test` - run Vitest
- `npm run test:ui` - run Vitest UI
- `npm run test:coverage` - test coverage
