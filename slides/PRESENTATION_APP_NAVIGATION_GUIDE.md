# Quantum Circuit Simulator: Presentation-Day Navigation Guide

Last updated: 2026-04-20
Audience: You presenting tomorrow with minimal prep time

This guide is written as a practical walkthrough so you can confidently demo the app even if you are new to it.

## 1. What This App Does (Simple Version)

The app is a browser-based quantum circuit simulator.

You can:
- Build circuits using drag-and-drop gates.
- Run ideal simulations and shot-based sampling.
- Turn on realistic noise models and compare ideal vs noisy outcomes.
- Inspect results in multiple views (probabilities, Bloch, Dirac, matrix, analysis).
- Use advanced tools in Simulator Lab (optimization, sweeps, import/export, calibration, hardware checks).

Important honest framing for presentation:
- This is a local simulator, not a real quantum hardware runner.
- It is designed for learning, analysis, and rapid experimentation.

## 2. Fast Startup (Do This First)

From project root:

```bash
nvm use
npm install
npm run dev
```

Then open the local URL shown in terminal (usually http://localhost:5173).

If you only have a few minutes, you can skip reinstall and just run:

```bash
npm run dev
```

## 3. UI Map: What You’re Looking At

## 3.1 Top Header

- Qubits control: increase/decrease number of qubits.
- Columns control: increase/decrease circuit length.
- Undo/Redo buttons.
- Clear circuit button.
- Gate reference button.
- Sidebar toggle button.
- Theme toggle button.
- Run button: executes shots immediately.

## 3.2 Drafts Bar (Under Header)

- Circuit selector: switch active draft.
- New / Duplicate / Rename / Delete draft.
- Export App State: saves app state JSON.
- Import App State: load previous app state JSON.

## 3.3 Left Sidebar

- Gate Library: all available gates.
- Templates: ready-made circuits (Bell, GHZ, QFT, etc.) to start quickly.

## 3.4 Main Workspace

- Circuit grid: place, move, duplicate, delete gates.
- Execution slider: step column-by-column or view full run.
- Shots input: sample count (default 1024).
- Seed input: optional reproducibility.
- Initial state controls:
  - Per qubit mode
  - Basis mode
  - Statevector mode
- Symbol/formula support for expressions.

## 3.5 Results Panel (Tabs)

Tabs in order:
- Probabilities
- Bloch Spheres
- Dirac
- Math Lens
- Shots
- Analysis & State
- Simulator Lab

## 4. End-to-End Basic Workflow (Recommended)

Use this exact sequence for a clean demo:

1. Choose a template from sidebar (Bell is best for short demo).
2. Show the circuit grid and one or two gates.
3. Click Run (shots).
4. Open Probabilities tab.
5. Open Shots tab.
6. Enable noise and re-run.
7. Compare ideal vs noisy histograms.
8. Open Analysis & State to show diagnostics.
9. Open Simulator Lab and run one advanced action.
10. Show export capability (JSON or QASM).

## 5. Tab-by-Tab Explanation (What to Say)

## 5.1 Probabilities

What it shows:
- Probability distribution over basis states from current simulated state.

What to say:
- This is the deterministic probability view from the current circuit configuration.

## 5.2 Bloch Spheres

What it shows:
- One Bloch vector per qubit.

What to say:
- This gives geometric intuition for single-qubit state orientation.

## 5.3 Dirac

What it shows:
- Ket-style amplitude view.

What to say:
- This is the amplitude/phase view in standard quantum notation.

## 5.4 Math Lens

What it shows:
- Overall unitary matrix (when computable).

What to say:
- This is the matrix-level representation of circuit action.

## 5.5 Shots

What it shows:
- Sampling outcomes (ideal and noisy).
- Measurement basis per qubit (X/Y/Z).
- Noise sliders and timing parameters.

What to say:
- This is the statistical execution view and the easiest place to compare ideal vs noisy behavior.

## 5.6 Analysis & State

What it shows:
- State insights panel.
- Circuit analysis panel.
- Experiment workbench panel.

What to say:
- This area explains behavior, not just raw output.

## 5.7 Simulator Lab

What it shows:
- Advanced tools: optimization, sweeps, import/export, calibration, packs, interop.

What to say:
- This is the advanced engineering workspace for deeper experiments.

## 6. Simulator Lab: Three Reliable Demo Actions

If you are short on time, do only these:

1. Qiskit OSS Toolkit section:
- Click Build OpenQASM 2.0.
- Optionally click Download .qasm.

2. Export and Import Tools section:
- Click Export Circuit JSON.
- Explain it supports JSON import back into the app.

3. Parameter Optimizer or Noise Calibration:
- Run one workflow and show output message.

## 7. Screenshot Placeholders: What You Still Need

You already added most screenshots. Missing ones based on files in slides folder are PH_04 and PH_10.

## 7.1 PH_04_TEST_EVIDENCE_TERMINAL

How to get it:

```bash
npm run test
```

Take screenshot of terminal final summary where tests pass.

If full test run is too long, use this faster fallback:

```bash
npm run test -- --run src/logic/complex.test.ts
```

## 7.2 PH_10_EXPORT_OUTPUTS

Yes, your JSON sample is valid for placeholder 10.

Best way:
1. Open Simulator Lab tab.
2. Go to Export and Import Tools.
3. Click Export Circuit JSON.
4. Open downloaded file and screenshot the JSON content.

Alternative valid screenshot:
- OpenQASM export section with generated QASM text or download action.

## 8. 10-Minute Demo Script (Safe and Clear)

Minute 0-1:
- Explain purpose: local-first quantum simulator for learning + analysis.

Minute 1-3:
- Show circuit editor, templates, and run button.

Minute 3-5:
- Run Bell template and show Probabilities + Shots.

Minute 5-7:
- Turn on noise and compare ideal vs noisy outcomes.

Minute 7-8:
- Open Analysis & State and point to insights.

Minute 8-9:
- Open Simulator Lab and do one tool (JSON export or QASM build).

Minute 9-10:
- State honest limits and close with Q&A.

## 9. Honest Limits to Mention (Important)

Use these exact safe points:
- Current practical cap is 6 qubits.
- Routing and optimization are heuristic-based.
- OpenQASM support is intentionally a practical lite subset.
- It is a browser simulator, not direct hardware execution.

## 10. Keyboard Shortcuts You Can Mention

- Cmd/Ctrl + Z: Undo
- Cmd/Ctrl + Shift + Z: Redo
- Delete/Backspace: Remove selected gate
- Arrow Left/Right: Move execution step
- Option + drag gate: Duplicate

## 11. If You Freeze During Presentation

Say this and continue:
- I will show one complete workflow from template to result comparison to export.
- The main value is interactive learning plus analysis in one local tool.
- The advanced tab extends this with optimization and interop utilities.

Then do:
1. Load Bell template.
2. Run shots.
3. Open Shots tab and toggle noise.
4. Show Export Circuit JSON.

That alone is enough for a credible demo.

## 12. Final Pre-Presentation Checklist

- App launches with npm run dev.
- Bell template loads.
- Run button works.
- Noise comparison works in Shots tab.
- At least one Simulator Lab action works.
- PH_04 and PH_10 screenshots added.
- slides/slides.html opens and all placeholders are replaced.
