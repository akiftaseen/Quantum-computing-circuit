# Quantum Circuit Tutor

Interactive quantum circuit simulator built with React + TypeScript + Vite.

## What This App Does

- Build quantum circuits with drag-and-drop gates.
- Simulate state vectors, probabilities, Bloch vectors, and measurement shots.
- Compare ideal and noisy sampling outcomes.
- Step through execution column-by-column.
- Inspect gate matrices and overall unitary (for small systems).

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
- Circuit analysis panel (gate counts, depth, estimated cost, optimization hints, and contextual learning insights).
- Guided learning tab with lesson checklists, concept briefs, and one-click template loading.
- Interactive walkthrough tab for building and validating a Bell pair step-by-step.
- Measurement basis lab (X/Y/Z basis probabilities per qubit via Bloch-vector inference).
- Templates including Bell, GHZ, QFT, Grover, VQE, Ising examples.

### Qiskit-Inspired Free Toolkit
- Local transpile-style optimization presets (levels 0-3) for cancellation, merge, and depth compaction.
- Seeded random circuit generation for reproducible experiments.
- OpenQASM 2.0 export (`.qasm`) for interoperability with open-source quantum tooling.
- OpenQASM-lite import for bringing circuits back into the visual editor.

### Simulator Lab Advanced Suite
- Circuit diff view for comparing current and candidate circuits.
- Gate-fusion aware optimization reports and memoized simulation paths for faster local runs.
- Parameter optimizer (VQE-style grid sweep) for single-parameter tuning.
- Noise sweep dashboard with success-probability trend chart.
- Fidelity and distance metrics panel (state fidelity, trace distance approximation, KL divergence, TV distance).
- Stabilizer fast-path eligibility detection for Clifford-like circuits.
- OpenQASM interoperability diagnostics with decomposition suggestions.
- Session/project save packs (circuit + symbols + shots + notes).
- Classroom assignment mode with rubric-based auto-checks.

### Offline-First PWA Mode
- Installable Progressive Web App (PWA) with service worker caching.
- Works offline after first successful load/build.
- Optimized for open-source distribution so users can clone and run locally with minimal setup.

### Noise Exploration
- Toggle noise mode in Shots tab.
- Configure depolarizing noise, amplitude damping, and readout error.
- Side-by-side ideal vs noisy histogram comparison for intuition.

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

## Learning Workflow

- Use `Learning Studio` tab for short guided experiments and concept briefs.
- Use `Guided Lab` tab for step-by-step Bell pair construction.
- Use `Basis Explorer` tab to compare X/Y/Z measurement expectations.
- Use `Analysis` tab for complexity and optimization feedback.
- Use `Shots` tab with noise mode to understand hardware effects.
- Use templates and parameter tuning to iterate on milestone circuits and compare outcomes.

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

### PWA (Offline) Notes

- Build once with `npm run build`.
- Serve `dist/` from any static host or local static server.
- Open the app once online so the service worker caches assets.
- After caching, the app is available offline (including navigation fallback).

Recommended open-source distribution flow:

1. Push source to GitHub.
2. Users clone and run:

```bash
git clone <your-repo-url>
cd Quantum-computing-circuit
npm install
npm run dev
```

3. For static hosting (GitHub Pages/Netlify/Vercel), deploy the `dist/` output from `npm run build`.

## Testing

```bash
npm run test
npm run test:ui
npm run test:coverage
```

## Project Structure

- `src/App.tsx`: Main application composition.
- `src/components/`: UI components (`CircuitGrid`, `GatePalette`, `CircuitAnalysisPanel`, `LearningPanel`, `SaveSlotsPanel`, etc.).
- `src/logic/`: Simulation core, gates, analysis, noise modeling, and URL loading utilities.
- `src/hooks/`: Reusable hooks (`useCircuitHistory`, `useTheme`).
- `src/test/`: Test setup.

## Notes and Limits

- State-vector simulation scales exponentially with qubit count.
- Unitary visualization is intentionally limited to small systems.

## Scripts

- `npm run dev` - start development server
- `npm run build` - type-check and build
- `npm run preview` - preview built app
- `npm run lint` - run ESLint
- `npm run test` - run Vitest
- `npm run test:ui` - run Vitest UI
- `npm run test:coverage` - test coverage
