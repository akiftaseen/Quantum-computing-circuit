# Quantum Circuit Simulator

Comprehensive Development and Architecture Dossier for Presentation Generation

Date: 2026-04-18
Repository root: /Users/akiftaseen/Documents/fyp/Quantum-computing-circuit
Prepared for: Converting into presentation slides using another AI

---

## 0. How To Use This Document With Another AI

- This file is structured to be machine-ingestible and slide-ready.
- If you pass this to another AI, ask it to preserve section order and use the included slide blueprint.
- This dossier separates:
- Confirmed facts from code and docs
- Reasonable inferences about development timeline and process
- Presentation-specific content (talk track, demo flow, Q and A prep)

Suggested prompt to another AI:

"Use this dossier to generate a 20-30 slide technical presentation. Keep all confirmed facts intact. Mark inferred timeline items as inferred. Add diagrams for architecture, simulation pipeline, noise path, and persistence lifecycle. Include speaker notes per slide and a live demo script."

---

## 1. Verification Scope and Method

### 1.1 Source Coverage

This dossier was compiled from:

- Top-level product docs:
- README.md
- APP_REFERENCE.md
- MAINTENANCE.md
- USER_GUIDE.txt
- Runtime entrypoints and shell:
- src/main.tsx
- src/App.tsx
- UI components:
- src/components/*.tsx (15 files)
- Hooks:
- src/hooks/*.ts (3 files)
- Logic modules:
- src/logic/*.ts (37 non-test modules + 15 test modules)
- Tooling and config:
- package.json
- vite.config.ts
- vitest.config.ts
- eslint.config.js
- tsconfig*.json
- Test setup:
- src/test/setup.ts

### 1.2 Evidence Stats

Confirmed by repository scan:

- Total files under src: 76
- Component files: 15
- Logic files: 52
- Logic test files: 15
- Total logic test cases: 104
- Describe blocks: 18

---

## 2. Executive Summary

This application is a browser-native, local-first quantum circuit simulator built with React, TypeScript, and Vite. It combines educational workflows and advanced engineering tools in one interface.

At the product level, it enables users to:

- Build circuits visually with drag and drop gates.
- Simulate state-vector evolution and shot-based measurement outcomes.
- Compare ideal and noisy behavior with tunable realistic noise channels.
- Analyze circuit quality using metrics, heuristics, and insight panels.
- Run advanced workflows such as parameter sweeps, optimization, routing checks, mitigation, calibration, and interoperability checks.
- Export reports and OpenQASM artifacts for downstream usage.

At the engineering level, the app uses:

- Deterministic seeded shot sampling with alias-based sampling for speed.
- A compiled plan cache and run-result LRU cache for repeat simulation efficiency.
- Density-matrix branch evolution for realistic noisy sampling with measurement and classical feed-forward handling.
- Strong TypeScript strict-mode settings and broad logic-layer test coverage.

---

## 3. Product Goals and User Personas

### 3.1 Primary Product Goals

- Make quantum circuit behavior explorable without cloud backends.
- Keep a low-friction educational path for beginners.
- Expose deeper diagnostics and engineering workflows for advanced users.
- Stay local-first, reproducible, and open-source friendly.

### 3.2 User Personas

- Learners and educators:
- Need intuitive visual feedback (probabilities, Bloch, Dirac, insights).
- Need templates and plain language guidance.
- Need progressive disclosure instead of an overloaded UI.
- Practitioners and researchers:
- Need reproducible shot runs via seeds.
- Need optimization and benchmarking support.
- Need hardware compatibility and routing estimation.
- Need export/import interoperability for external tools.

### 3.3 Core User Workflows

- Build and inspect:
- Place gates -> run shots -> inspect probabilities, histogram, insights.
- Learn from templates:
- Load templates -> tweak parameters/gates -> compare outcomes.
- Noise analysis:
- Toggle noise and tune channels -> compare ideal versus noisy distributions.
- Advanced lab:
- Sweep, optimize, calibrate, mitigate, benchmark, and save experiment packs.
- Reporting:
- Export markdown or JSON analysis reports with confidence and A/B comparisons.

---

## 4. Technology Stack and Runtime Environment

### 4.1 Frontend Stack

- React 19.2.0
- TypeScript 5.9.x
- Vite 7.2.x
- Recharts 3.6.0 for charts
- lucide-react for iconography

### 4.2 Build and Runtime Constraints

- Node requirement in package.json engines: >= 20.19.0
- .nvmrc: 20.19.0
- Bundler mode TypeScript configs for app and node contexts

### 4.3 PWA and Offline

- Uses vite-plugin-pwa with autoUpdate service worker registration.
- Manifest configured for standalone display.
- Workbox navigation fallback to /index.html.
- Runtime caching includes Google Fonts endpoints.

---

## 5. Application Architecture

### 5.1 High-Level Layering

- UI Layer:
- React components render controls, visualizations, and advanced panels.
- Hook Layer:
- Encapsulates cross-cutting app state concerns like history, drafts, and theme.
- Logic Layer:
- Pure simulation, analysis, optimization, interop, and utility modules.

### 5.2 Entrypoint and Error Containment

- main.tsx mounts App inside ErrorBoundary under React.StrictMode.
- ErrorBoundary catches rendering errors and provides reload fallback.

### 5.3 Lazy Loading Strategy

App.tsx lazy-loads heavier feature components:

- BlochSphere
- DiracNotation
- GateDescriptionsModal
- CircuitAnalysisPanel
- QuantumStateInsightsPanel
- ExperimentWorkbenchPanel
- SimulatorLabPanel

This improves initial load time by deferring advanced panels.

### 5.4 Main Data Flow

Textual data flow diagram:

1. User edits circuit in CircuitGrid.
2. Circuit state updates via useCircuitHistory.
3. Initial state and symbol bindings are applied.
4. runCircuit computes state evolution.
5. Optional runWithShots and runWithNoiseShots compute histograms.
6. Analysis modules derive metrics and diagnostics.
7. UI tabs render visual and textual results.

---

## 6. Domain Model and Core Types

Primary domain types in src/logic/circuitTypes.ts:

- GateName union includes:
- Single-qubit gates: I, H, X, Y, Z, S, Sdg, T, Tdg, Rx, Ry, Rz, P
- Multi-qubit gates: CNOT, CZ, SWAP, CCX, iSWAP, XX, YY, ZZ
- Special: M, Barrier
- PlacedGate:
- id, gate, column, targets, controls, params, classicalBit optional, condition optional
- CircuitState:
- numQubits, numColumns, gates

Helpers:

- isSingleQubit
- isParametric
- isMultiQubit
- gateDisplayName
- gateColor
- newGateId

---

## 7. Global App Orchestration in App.tsx

### 7.1 Core Responsibilities

App.tsx is the main orchestrator. It handles:

- Circuit lifecycle and history
- Draft workspace switching and persistence
- Theme mode
- Initial-state mode and expression handling
- Symbol binding application
- Shot and noise execution
- Tabbed results rendering
- App-state export/import

### 7.2 Tabs and Surfaces

Defined tabs:

- prob: Probabilities
- bloch: Bloch Spheres
- dirac: Dirac
- math: Math Lens (unitary)
- shots: Shot statistics and noise controls
- analysis: Analysis and state insights
- sim: Simulator Lab

### 7.3 Keyboard and Interaction Design

Implemented shortcuts include:

- Undo: Cmd/Ctrl + Z
- Redo: Cmd/Ctrl + Shift + Z
- Delete selected gate: Delete/Backspace
- Step navigation: ArrowLeft/ArrowRight
- Quick gate placement with keys 1-6 when a gate is selected

### 7.4 Local App State Export/Import

- Export scans localStorage keys by prefix:
- qcs.
- qc-sim-
- Writes JSON payload with version and timestamp.
- Import validates payload version and restores matching keys.
- Triggers reload after successful import.

---

## 8. UI Component Catalog (Detailed)

### 8.1 Shell and Controls

- AppHeader.tsx:
- Qubit and column controls with min/max enforcement from constants.
- Undo/redo/clear actions.
- Theme cycle button.
- Sidebar collapse toggle.
- Run shots button.
- GatePalette.tsx:
- Categorized draggable chips (Basic, Pauli, Phase, Rotation, Multi-Qubit, Interactions).
- Injects gateId into drag dataTransfer.

### 8.2 Circuit Editing Surface

- CircuitGrid.tsx:
- SVG-based grid rendering with wires, qubit labels, and column labels.
- Drag and drop from palette to grid.
- Drag existing gate to move.
- Pointer-drag copy mode with Alt key.
- Invalid placement detection and inline error hint overlay.
- Delete by dragging outside grid (with discard hint).
- Renders specialized visuals for CNOT, CZ, SWAP, CCX, iSWAP, XX, YY, ZZ, and single-qubit gates.
- Accessibility:
- ARIA labels for gates
- Keyboard selection via Enter/Space
- Escape to clear selection

### 8.3 Visualization Components

- ProbabilityChart.tsx:
- Builds basis probability table from cAbs2(amplitude).
- Uses computeAdaptiveDomain for dynamic y-axis domain.
- Highlights top states and bars above threshold.
- ShotsHistogram.tsx:
- Displays frequency histogram from sampled counts.
- Optional reference histogram and delta view.
- Computes TV distance and max deviation state.
- DiracNotation.tsx:
- Shows sparse state decomposition with amplitudes, probabilities, and phases.
- Color-codes by phase hue.
- Interactive basis selection.
- BlochSphere.tsx:
- Projects Bloch vectors to pseudo-3D SVG representation.
- Shows axis hints and vector magnitude.

### 8.4 Analysis Surfaces

- CircuitAnalysisPanel.tsx:
- Gate/depth/cost metrics, entangling ratio, depth density.
- Optimization suggestions and operational insights.
- QuantumStateInsightsPanel.tsx:
- Amplitude/coherence/interference and phase relationships.
- Entanglement profile and pair correlation.
- CHSH and concurrence where applicable.
- Measurement and partial-collapse tools.
- Density indicators and noisy purity proxy.
- ExperimentWorkbenchPanel.tsx:
- Operational interpretation and checks.
- Confidence score.
- Snapshot A/B capture and compare.
- Export technical report in md/json.

### 8.5 Advanced Lab Surface

- SimulatorLabPanel.tsx:
- Large multi-tool engineering workspace with search and pinning.
- Persists UI filters and pinned sections.
- Contains broad advanced toolset described in Section 13.

### 8.6 Reliability and Fallback

- ErrorBoundary.tsx:
- Captures rendering errors and provides reload action.
- Logs caught errors via console.error.

---

## 9. Hooks and Shared State Utilities

### 9.1 useCircuitHistory

- Reducer-based past/present/future state model.
- Supports set, undo, redo, reset actions.
- Max history depth: 50 states.

### 9.2 useCircuitDrafts

- Multi-draft workspace with active draft switching.
- Storage key: qcs.drafts.workspace.v1
- Features:
- create draft
- duplicate active
- rename active
- delete active with fallback behavior
- Syncs active circuit into currently selected draft.
- Sanitizes persisted payload shape on load.

### 9.3 useTheme

- Theme modes: light, dark, system.
- Storage key: quantum-tutor-theme
- Sets document data-theme attribute.
- Listens to prefers-color-scheme when mode is system.

---

## 10. Core Quantum Math and Simulation Kernels

### 10.1 Complex Arithmetic (complex.ts)

- Complex model: re, im
- Operations: add, sub, mul, conj, scale, abs, abs2, phase, exp
- Formatting helper with small-value handling

### 10.2 Gate Definitions (gate.ts)

- Matrix2 and Matrix4 representations.
- Includes fixed and parametric gates:
- I, X, Y, Z, H, S, Sdg, T, Tdg
- Rx, Ry, Rz, P
- CNOT, CZ, SWAP, iSWAP, CCX
- XX, YY, ZZ interactions
- Includes tensor product and matrix multiplication helpers.

### 10.3 State Evolution Primitives (simulator.ts)

- initZeroState
- applySingleQubitGate
- applyControlledGate
- applySWAP
- apply2QubitGate
- apply3QubitGate
- measureQubit with optional forced/random source
- partialTrace
- getBlochVector

Implementation note:

- Bitwise indexing is used extensively for speed and direct basis-address computation.

---

## 11. Circuit Runner Engine (circuitRunner.ts)

This module is the execution backbone.

### 11.1 Core APIs

- getMatrix
- runCircuit
- runWithShots
- runWithNoiseShots
- computeUnitary
- computeUnitary2Q

### 11.2 Caching

- compiledCircuitCache: WeakMap of circuit to compiled column plan
- runCache: LRU-like Map with limit 256
- Additional operator caches:
- singleQubitOperatorCache
- gateOperatorCache
- projectorOperatorCache

### 11.3 Plan Compilation

compileCircuitPlan builds:

- column-indexed gate arrays
- hasMidMeasure flag (measurement followed by later non-measure operations)
- deterministic circuit signature for cache keys

### 11.4 runCircuit Behavior

- Supports upToCol partial stepping.
- Supports skipMeasure mode for pure unitary evolution preview.
- Honors gate.condition classical-bit controls.
- Handles M gate by collapsing state and storing classical bit outcomes.

### 11.5 Shot Sampling

Two paths:

- No mid-circuit measurement path:
- Single ideal evolution
- Optional basis rotation
- Probability extraction
- Alias sampler for O(1) sample draw
- Mid-circuit measurement path:
- Runs shot-by-shot evolution with stochastic measurement

### 11.6 Alias Sampling

- Uses a Vose-style alias table construction.
- Sanitizes probabilities before table build.
- Deterministic when seeded random source is provided.

### 11.7 Noise Sampling Path

runWithNoiseShots:

- If noise disabled -> delegates to runWithShots
- Else:
- Evolves density matrix with classical branch tracking
- Applies channels per active qubit and per-layer timing context
- Builds measurement probabilities from final density matrix
- Applies readout error map
- Samples with alias method

### 11.8 Density-Matrix Branch Evolution

evolveCircuitDensityWithClassicalBranches handles:

- Measurement splitting branches by outcome when classicalBit is assigned.
- Conditional gate execution against per-branch classical bits.
- Branch merge into final mixed density matrix.

### 11.9 computeUnitary

- Filters out M and Barrier.
- Evolves each basis vector to construct full unitary columns.
- Returns null if qubit count exceeds maxQubits (default from constants max qubits).

---

## 12. Measurement, Analysis, and Metrics Stack

### 12.1 Measurement Basis and Collapse

- measurementBasis.ts:
- Rotates state for X or Y basis prior to measurement
- Exposes basisDistributionFromState
- measurementCollapse.ts:
- partialMeasure
- getConditionalProbabilities
- allMeasurementOutcomes
- measurementInsights.ts:
- axisMeasurementDistribution via Bloch projection
- histogram marginalization and normalization helpers

### 12.2 Amplitude and Phase Analytics

- amplitudeAnalysis.ts:
- analyzeAmplitudes
- computeInterferencePattern
- computeCoherence
- computePhaseRelationships

### 12.3 Entanglement and Correlation

- entanglementAnalysis.ts:
- single-qubit entropy from Bloch vector radius
- concurrence for two-qubit pure-state case
- CHSH canonical estimate
- pairwise connected ZZ correlation ranking
- subsystem entropy profile

### 12.4 Density Matrix Utilities

- densityMatrix.ts:
- build pure-state density matrix
- compute purity and entropy approximations
- reduce to single-qubit density matrix

### 12.5 State Distance Metrics

- stateMetrics.ts:
- stateFidelity
- traceDistanceApprox (distribution-based approximation)
- KL divergence
- Jensen-Shannon divergence
- Bhattacharyya coefficient
- Hellinger distance
- per-qubit marginal drift summary

### 12.6 Circuit Analysis Heuristics

- circuitAnalysis.ts:
- analyzeCircuit
- findOptimizations
- estimateGateCost
- calculateCircuitCost

Heuristic signals include:

- inverse/cancel pairs
- angle-zero gate elimination
- adjacent commuting opportunities
- decomposition hints for CCX/SWAP/interaction gates

---

## 13. Simulator Lab Advanced Feature Inventory

SimulatorLabPanel contains a broad advanced toolkit. Features confirmed from code and rendered sections:

- Results Compare Tray:
- top ideal/noisy outcomes
- TV distance, KL divergence
- mitigation delta if available
- Symbolic Parameters:
- editable symbol bindings reused across multiple tools
- Entanglement Map Visualization:
- pairwise heatmap
- pair trend chart by column
- Noise Calibration Fitting:
- parse observed histogram text
- fit noise via KL-minimizing grid search
- apply fitted noise config
- Qiskit OSS Toolkit:
- optimization levels 0..3
- random circuit generation with seed
- OpenQASM preview/copy/download
- Parameter Optimizer (VQE-style grid search):
- objective by basis probability or observable expectation
- line-chart trace and best theta summary
- Noise Sweep Dashboard:
- sweep one noise parameter across range
- plot target basis success probability
- Error Mitigation Mini-Lab:
- readout mitigation and raw vs mitigated comparison
- Fidelity and Distance Metrics:
- multiple divergence and overlap metrics
- per-qubit marginal drift rows
- Stabilizer Fast Path eligibility checker:
- detects Clifford-like circuits
- OpenQASM Interop Diagnostics:
- warnings and decomposition suggestions
- Session and Project Save Packs:
- save/load/clear packs with circuit + symbols + shot config + notes
- Observable Expectations:
- multi-line Pauli-like observable evaluation
- token insertion helpers
- State Preparation Wizard:
- per-qubit theta/phi to expressions
- Initial-State Template Library:
- basis0, basis1, bell, ghz, w, uniform, cluster, stabilizer, haar, Dicke
- Parametric Sweep Studio:
- parameter scans with chart and peak extraction
- Measurement Basis Simulator:
- per-qubit measurement axis controls and top outcome summary
- Tomography Mode (Synthetic Shots):
- finite-shot Bloch estimates and selected pair correlations
- reconstructed versus ideal density display
- Circuit Profiler:
- per-column estimated runtime/cost rows
- Circuit Expression Macros:
- DSL input and apply
- Circuit Equivalence Checker:
- compares candidate and current unitaries up to global phase
- charted basis-probability deltas by column
- Reverse Engineering Assistant:
- suggest prep macro for target state expression
- Export and Import Tools:
- export circuit JSON
- export sweep CSV
- import macro/JSON/OpenQASM-lite
- Multi-Run Experiment Manager:
- save runs, compare traces, apply saved run shot config

### 13.1 Lab Usability Systems

- Feature search across titles, notes, and related terms.
- Pinning mechanism for tool cards.
- Pinned-only view toggle.
- Masonry-like row-span adjustments based on card height.

### 13.2 Lab Persistence Keys

- qc-sim-lab-ui-v1
- qc-sim-experiments-v1
- qc-sim-packs-v1

---

## 14. Interoperability and Transformation Pipeline

### 14.1 Macro DSL Parsing

- circuitMacro.ts parses statements like:
- H(0)
- CNOT(0,1)
- Rx(0,pi/2)
- repeat(3){...}
- Supports gate aliases and numeric tokens like pi, tau, pi/2.

### 14.2 OpenQASM Lite Import

- openqasmLite.ts translates supported OpenQASM lines to macro DSL then parses.
- Supports many 1q and 2q gate forms and U1/U2/U3 decomposition.
- Ignores some directives (barrier/reset) in lite mode.
- Returns unsupported-line errors for unknown syntax.
- analyzeOpenQasmInterop provides warnings/suggestions for non-lite patterns.

### 14.3 OpenQASM Export

- qiskitOss.ts exportOpenQasm2 emits:
- OPENQASM header
- qreg/creg declarations
- line-wise gate emission by sorted column order

### 14.4 Round-Trip Verification

- qasmRoundTrip.ts:
- export -> parseOpenQasmLite -> export again
- structural diff via circuitDiff.ts
- validity based on changed/added/removed gate summary

### 14.5 Transpile-Like Presets

- Level 0: copy/no optimization
- Level 1: cancellation and identity pruning
- Level 2: level 1 plus parametric angle merging
- Level 3: level 2 plus column compaction scheduling

### 14.6 Clifford Eligibility

- isCliffordLikeCircuit detects circuits that can use stabilizer-style fast paths.
- Allows rotation/phase gates only at half-pi multiples where applicable.

---

## 15. Initial State System

initialQubitState.ts implements two modes:

- Per-qubit mode:
- Presets like 0, 1, +, -, i, -i and variants
- Custom pair expressions a,b with normalization
- Statevector mode:
- Ket-superposition style expressions
- Amplitude-list style expressions
- Complex expression parser with arithmetic and functions

### 15.1 Expression Parsing Capabilities

Confirmed parser supports tokens and operations including:

- arithmetic + - * / ^
- constants pi, e, i
- function forms via parser internals
- nested parentheses

### 15.2 Template Expressions

- getStatevectorTemplateExpression supports:
- basis0, basis1, bell, ghz, w, uniform, cluster, stabilizer, haar
- getDickeTemplateExpression for Dicke(n,k)

### 15.3 Diagnostics

- parseInitialQubitStateDetailed returns validity and message.
- buildInitialStateFromInput returns state, labels, validity, and user-facing message.

---

## 16. Noise and Mitigation Stack

### 16.1 Noise Model Parameters

NoiseConfig fields include:

- depolarizing1q
- depolarizing2q
- amplitudeDamping
- bitFlip
- phaseFlip
- readoutError
- t1Microseconds
- t2Microseconds
- gateTime1qNs
- gateTime2qNs
- idleTimeNs

### 16.2 Primitive Noise Functions

noiseModel.ts includes:

- applyDepolarizing
- applyAmplitudeDamping
- flipReadout
- applyBitFlip
- applyPhaseFlip

### 16.3 Readout Mitigation

readoutMitigation.ts:

- Converts histogram <-> probability vector.
- Applies inverse of single-qubit readout confusion matrix across qubits.
- Clamps and renormalizes nonnegative outputs.

### 16.4 Noise Calibration

noiseCalibration.ts:

- parseHistogramText for input parsing.
- fitNoiseModelFromHistogram grid-searches over:
- depolarizing1q
- amplitudeDamping
- readoutError
- Grid points: [0, 0.01, 0.02, 0.04, 0.06, 0.1]
- Total combinations: 216
- Uses KL divergence score against simulated noisy shots.

---

## 17. Hardware-Aware Tooling

### 17.1 Hardware Profiles

hardwareProfiles.ts defines three profiles:

- Ideal All-to-All (Reference)
- 5Q Line (NISQ)
- 7Q Heavy-Hex Lite

Profile fields:

- basisGates
- couplingEdges
- t1/t2
- readoutError
- cxError

Compatibility report includes:

- unsupported gate counts
- edge violations
- estimated SWAP overhead
- compatibility score
- notes

### 17.2 Routing for Connectivity

hardwareLayout.ts routeCircuitForHardware:

- Uses shortest path across coupling graph.
- Inserts SWAP chains for nonadjacent 2q interactions.
- Applies forward swaps, executes gate on routed adjacency, then restores mapping.
- Returns swapInserted, unroutableGates, depth deltas, notes.

### 17.3 Live Transpile Hints

transpileHints.ts buildLiveTranspileHints:

- cancellation candidates
- rotation merge opportunities
- depth compaction opportunities
- hardware decomposition warnings

---

## 18. Persistence and State Lifecycle

### 18.1 Storage Keys in Use

- qcs.app.state.v1
- qcs.drafts.workspace.v1
- quantum-tutor-theme
- qc-sim-lab-ui-v1
- qc-sim-experiments-v1
- qc-sim-packs-v1

### 18.2 App-Level Persisted Values

App state payload includes:

- sidebarCollapsed
- sidebarWidth
- resultsPanelHeight
- active tab
- shot count and seed input
- noise config
- initial-state mode and expressions
- measurement axes
- symbol bindings
- step column

### 18.3 Draft Workspace Lifecycle

- loadDraftWorkspace sanitizes persisted schema.
- Active circuit syncs back to active draft continuously.
- Switch/create/duplicate/rename/delete actions update persisted workspace.

### 18.4 Export/Import Lifecycle

- Export reads localStorage and filters by prefixes qcs. and qc-sim-.
- Imports only whitelisted prefix keys from payload.
- Uses payload version guard.

### 18.5 Nuance: Unused Config Constant

- UI_CONFIG.CIRCUIT_STORAGE_KEY exists in constants.ts as quantum-tutor-circuit.
- No active usage was found in source scans.

---

## 19. Visual Design System and Responsiveness

### 19.1 Global Theme Tokens

- Uses CSS custom properties for color, typography, spacing, shadows.
- Light and dark themes controlled by data-theme attribute.

### 19.2 Typography

- Plus Jakarta Sans for UI text.
- JetBrains Mono for code-like and matrix displays.
- Google Fonts imported in index.css with local fallbacks.

### 19.3 Layout and Motion

- app-shell background uses layered radial gradients.
- Panels and cards use consistent border-radius/shadow tokens.
- Drop previews and tab surfaces include subtle animation and transitions.

### 19.4 Responsiveness

- Flexible grid and wrap layouts across sidebar, drafts bar, and analysis cards.
- Adaptive chart axis formatting and tick interval logic for larger state spaces.
- Panels support resizing for sidebar and results area.

### 19.5 Accessibility Measures

- Skip link to main content.
- Screen-reader live status region.
- Focus-visible styles.
- ARIA labels for key controls and tab semantics.
- Keyboard-accessible gate selection and tab navigation.

---

## 20. Tooling, Build, and Quality Pipeline

### 20.1 Scripts

From package.json:

- dev: vite
- build: tsc -b && vite build
- lint: eslint .
- preview: vite preview
- test: vitest
- test:ui: vitest --ui
- test:coverage: vitest --coverage

### 20.2 Build and Bundling

- Vite plugin-react enabled.
- PWA plugin configured.
- Rollup manual chunk strategy:
- recharts chunk isolated as vendor-recharts
- other node_modules grouped as vendor-misc

### 20.3 TypeScript Quality Settings

- strict mode enabled
- noUnusedLocals true
- noUnusedParameters true
- noFallthroughCasesInSwitch true
- bundler moduleResolution mode

### 20.4 ESLint Stack

- @eslint/js recommended
- typescript-eslint recommended
- react-hooks recommended
- react-refresh vite plugin rules

### 20.5 Test Runtime

- Vitest with jsdom environment
- setup file includes RTL cleanup and matchMedia mock

---

## 21. Test Strategy and Coverage Detail

### 21.1 Quantitative Summary

- 15 logic test files
- 104 test cases
- 18 describe suites

### 21.2 Thematic Coverage by Suite

- complex.test.ts:
- arithmetic and formatting primitives
- simulator.test.ts:
- initialization, gate effects, measurement behavior
- circuitRunner.test.ts:
- seeded reproducibility, noisy path, mid-circuit feed-forward, damping accumulation
- circuitEditing.test.ts:
- placement projections and bounds checks
- featureAccuracy.test.ts:
- validation, basis rotation, entanglement expectations, metrics bounds
- interopRobustness.test.ts:
- repeat expansion, QASM parsing, symbol escaping safety
- qiskitOssInterop.test.ts:
- transpile levels, Clifford detection, export text expectations
- optimizationAndRoutingRobustness.test.ts:
- routing and optimizer behavior
- propertyFuzzRobustness.test.ts:
- randomized parser/routing/optimizer invariant checks
- stateInitializationRobustness.test.ts:
- parser diagnostics and normalization
- readoutMitigation.test.ts:
- clamp/normalization and corrected distributions
- reverseEngineeringAndBenchmark.test.ts:
- benchmark execution and heuristic suggestion behavior
- templatePipelineRobustness.test.ts:
- deterministic templates and pipeline consistency
- templates.test.ts:
- 18 template-specific behavioral assertions
- utilitiesCoverage.test.ts:
- adaptive domains, diffs, density, observable validation

### 21.3 What This Implies

- Logic-heavy validation indicates this project prioritizes deterministic correctness and regression resistance in non-UI core functionality.

---

## 22. Performance and Scaling Characteristics

### 22.1 Fundamental Scaling

- State-vector operations scale as O(2^n) in memory and core gate application loops.
- Current hard max qubits in constraints: 6.

### 22.2 Caching and Optimization

- Compiled plan cache avoids repeated column plan rebuild.
- Run cache limit 256 reduces repeated skip-measure recomputation.
- Alias sampler reduces per-shot sampling cost after O(n) setup.

### 22.3 Practical Constraints in Code

From constants and validation:

- MIN_QUBITS 1
- MAX_QUBITS 6
- MIN_COLUMNS 4
- MAX_COLUMNS 60
- DEFAULT_SHOTS 1024
- SIMULATION.MAX_SHOTS constant 10000

Implementation nuance:

- App input handling currently clamps shots up to 100000 in App.tsx, which is higher than SIMULATION.MAX_SHOTS constant. This suggests a policy drift between constants and UI clamp logic.

---

## 23. Known Sensitive Areas and Risk Notes

Confirmed from docs and code inspection:

- OpenQASM parsing is regex-driven, so syntax edge cases are more fragile than parser-generator approaches.
- Interop warnings explicitly call out unsupported constructs like custom gates and classical conditionals in lite mode.
- Noise calibration uses coarse grid search, not adaptive optimization, so fitted parameters are approximate.
- Hardware routing is heuristic shortest-path SWAP insertion, not full optimal mapping.
- Entanglement concurrence is only returned for strict two-qubit case.

Positive mitigation signs:

- Symbol replacement escapes regex characters in symbolBindings.ts.
- Extensive tests include interop and fuzz invariants.
- Critical workflow docs include maintenance checks and sensitive area notes.

---

## 24. How This App Was Developed (Reconstruction)

This section separates explicit evidence from inference.

### 24.1 Confirmed in Repository Artifacts

- Core-first UX approach is explicitly stated in README.
- Docs are layered for users, references, and maintenance.
- Robustness-focused tests are grouped by concern and include fuzz/property style tests.
- Advanced tools were integrated into SimulatorLabPanel as a central workspace.

### 24.2 Reasonable Inference: Development Sequence

Inference based on module layering, tests, and component composition:

- Phase 1:
- Build quantum math kernels and state evolution core (complex, gate, simulator, runner).
- Phase 2:
- Add visual circuit editing and basic result views.
- Phase 3:
- Introduce educational templates and gate reference content.
- Phase 4:
- Add analysis modules (amplitude, entanglement, metrics, collapse).
- Phase 5:
- Build advanced lab feature set (optimization, routing, calibration, mitigation, interop).
- Phase 6:
- Add professional insights workspace and report exports.
- Phase 7:
- Stabilize with broad tests, maintenance docs, and PWA/offline polish.

### 24.3 Engineering Style Inference

- Logic-first architecture with a rich pure-function module layer.
- UI uses composition and memoization to keep heavy calculations isolated.
- Development likely balanced rapid feature growth with post-feature hardening via targeted tests.

---

## 25. Slide Deck Blueprint (Detailed)

This is a ready-made deck structure for another AI to render.

### Slide 1

- Title: Quantum Circuit Simulator
- Objective: Introduce scope and audience
- Talking points:
- Browser-native quantum simulation platform
- Educational and engineering workflows in one app
- Local-first and offline friendly
- Visuals:
- Product screenshot and architecture teaser

### Slide 2

- Title: Problem and Motivation
- Objective: Establish need
- Talking points:
- Quantum tooling can be expensive or backend dependent
- Beginners need intuitive visual feedback
- Practitioners need reproducible and interoperable tooling

### Slide 3

- Title: Product Positioning
- Objective: Explain dual persona design
- Talking points:
- Beginner-friendly core interface
- Advanced lab for engineering workflows
- Progressive disclosure strategy

### Slide 4

- Title: Tech Stack
- Objective: Show implementation choices
- Talking points:
- React + TypeScript + Vite
- Recharts for visual analytics
- PWA plugin for offline behavior

### Slide 5

- Title: Architecture Overview
- Objective: Explain layer boundaries
- Talking points:
- UI components
- state hooks
- logic modules
- clear separation of concerns

### Slide 6

- Title: Data Flow End-to-End
- Objective: Show runtime path
- Talking points:
- Circuit editing to runner
- state to charts and insights
- ideal and noisy shot paths

### Slide 7

- Title: Circuit Model
- Objective: Explain domain entities
- Talking points:
- CircuitState and PlacedGate schema
- targets, controls, params, classical fields
- gate taxonomy and helper predicates

### Slide 8

- Title: Editing UX Internals
- Objective: Demonstrate interaction quality
- Talking points:
- SVG grid and drag/drop
- move/copy/discard interactions
- invalid footprint hints and accessibility

### Slide 9

- Title: Simulation Core
- Objective: Explain quantum kernel
- Talking points:
- bitwise index manipulation
- single/multi-qubit kernels
- measurement collapse handling

### Slide 10

- Title: Circuit Runner Engine
- Objective: Explain orchestration and caching
- Talking points:
- compiled plans
- run LRU cache
- skip-measure path
- classical condition handling

### Slide 11

- Title: Shot Sampling Performance
- Objective: Explain scalability decisions
- Talking points:
- alias sampler for O(1) draws
- seeded reproducibility
- mid-measure branch behavior

### Slide 12

- Title: Noise Path and Density Matrix Evolution
- Objective: Explain realistic execution
- Talking points:
- branch-aware density evolution
- depolarizing, damping, bit/phase/readout channels
- T1/T2 timing effects

### Slide 13

- Title: Visualization Surfaces
- Objective: Show multi-view insight model
- Talking points:
- Probabilities, histogram, Dirac, Bloch, matrix lens
- each view answers different questions

### Slide 14

- Title: Analysis and Insight Panels
- Objective: Show interpretability layer
- Talking points:
- coherence and interference
- entanglement and CHSH
- operational checks and confidence

### Slide 15

- Title: Simulator Lab Feature Galaxy
- Objective: Showcase advanced tooling
- Talking points:
- optimization, sweeps, mitigation, calibration, routing, interop, benchmarks
- searchable and pinnable feature cards

### Slide 16

- Title: Optimization and Sweep Tools
- Objective: Deep dive selected advanced tools
- Talking points:
- single-parameter optimization
- multi-run comparisons
- multi-objective tradeoff capabilities in logic layer

### Slide 17

- Title: Hardware Awareness
- Objective: Show NISQ realism support
- Talking points:
- profile compatibility scoring
- SWAP-based routing heuristic
- transpile hints for decomposition and compaction

### Slide 18

- Title: Interoperability and QASM
- Objective: Explain external ecosystem bridge
- Talking points:
- OpenQASM export/import lite
- interop diagnostics
- round-trip structural diff checks

### Slide 19

- Title: Initial State System
- Objective: Show flexibility in input model
- Talking points:
- per-qubit presets and custom expressions
- direct statevector parser
- template expression library including Dicke and Haar

### Slide 20

- Title: Persistence and Reproducibility
- Objective: Explain local-first design
- Talking points:
- app state keys and draft workspace
- experiment packs and saved runs
- full app-state export/import

### Slide 21

- Title: QA and Reliability
- Objective: build trust
- Talking points:
- 104 logic-layer tests
- robustness and fuzz suites
- interop and routing invariants

### Slide 22

- Title: Development Journey
- Objective: narrate build evolution
- Talking points:
- core simulation foundation
- educational UX expansion
- advanced lab consolidation
- reporting and docs maturity
- mark inferred timeline as inferred

### Slide 23

- Title: Constraints and Risk Areas
- Objective: balanced technical honesty
- Talking points:
- qubit and column limits
- parser and heuristic constraints
- calibration granularity

### Slide 24

- Title: Demo Script
- Objective: prepare live walkthrough
- Talking points:
- build Bell state
- run ideal and noisy shots
- use optimizer and compare
- export report and QASM

### Slide 25

- Title: Future Opportunities
- Objective: roadmap direction
- Talking points:
- stabilizer fast-path acceleration
- deeper routing optimization
- richer interop parser coverage
- potential collaboration features

---

## 26. Recommended Live Demo Sequence

Use this order for a 7-10 minute demo:

1. Start with Bell Pair template and explain circuit canvas.
2. Run shots and inspect probability and histogram tabs.
3. Switch to Bloch and Dirac views for interpretation.
4. Enable noise and re-run to show distribution shift.
5. Open Analysis and State tab and explain confidence/checks.
6. Enter Simulator Lab and run a quick parameter optimizer pass.
7. Run a noise sweep and show trend curve.
8. Export markdown report.
9. Build and download OpenQASM.

---

## 27. Presentation Q and A Prep

Expected question: How accurate is noise modeling?

- Answer:
- Noise path is density-matrix based with configurable channels and T1/T2 timing parameters.
- Calibration is heuristic grid fitting, so parameter recovery is approximate.

Expected question: Can this scale to large qubit counts?

- Answer:
- Current product hard limits target educational and local-browser practicality.
- Simulation core is exponential in qubit count, with current constraints at 6 qubits.

Expected question: How robust is interoperability?

- Answer:
- Supports a practical OpenQASM-lite subset with diagnostics and round-trip checks.
- Full classical-flow and custom-gate coverage is intentionally limited in lite mode.

Expected question: Is this production quality?

- Answer:
- Logic layer has broad test coverage and structured maintenance workflow.
- Reliability choices include strict typing, linting, and deterministic seeded tests.

---

## 28. Key Implementation Facts Quick Sheet

- Max qubits: 6
- Max columns: 60
- Default shots: 1024
- History depth: 50
- runCache limit: 256
- Logic tests: 104
- Templates: 16 total across 3 groups
- Major advanced panel file size: SimulatorLabPanel.tsx > 2300 lines
- PWA enabled: yes
- Backend required: no

---

## 29. Confirmed Facts vs Inference Matrix

### Confirmed in code/docs

- Architecture layering and module boundaries
- Feature inventory for tabs and lab sections
- Persistence keys and payload shape behavior
- Test suite names and case intent
- Build and lint pipeline configuration
- Constraint constants and validation ranges

### Reasonable inference

- Chronological development phases
- Team workflow maturity trajectory
- Relative timing of feature clusters

---

## 30. Appendix A: Logic Module Reference

This appendix is compact and slide-AI friendly.

Core simulation:

- complex.ts: complex primitives
- gate.ts: gate matrices and interactions
- simulator.ts: state evolution kernels
- circuitRunner.ts: orchestration, sampling, noise path, unitary

Circuit and validation:

- circuitTypes.ts: domain schema
- circuitEditing.ts: placement projection and validation
- validation.ts: count and gate validity checks
- circuitMacro.ts: macro DSL parser

Analysis:

- circuitAnalysis.ts
- amplitudeAnalysis.ts
- entanglementAnalysis.ts
- stateMetrics.ts
- measurementBasis.ts
- measurementCollapse.ts
- measurementInsights.ts
- densityMatrix.ts
- chartDomains.ts
- observableLab.ts

Interop and transpile:

- openqasmLite.ts
- qiskitOss.ts
- qasmRoundTrip.ts
- circuitDiff.ts
- symbolBindings.ts

Advanced tooling:

- hardwareProfiles.ts
- hardwareLayout.ts
- transpileHints.ts
- parameterOptimizer.ts
- multiObjectiveOptimizer.ts
- noiseModel.ts
- noiseCalibration.ts
- readoutMitigation.ts
- benchmarkSuites.ts
- reverseEngineering.ts
- initialQubitState.ts

---

## 31. Appendix B: Component Reference

- AppHeader.tsx
- GatePalette.tsx
- GateTile.tsx
- CircuitGrid.tsx
- GateDetailsPanel.tsx
- ProbabilityChart.tsx
- ShotsHistogram.tsx
- DiracNotation.tsx
- BlochSphere.tsx
- CircuitAnalysisPanel.tsx
- QuantumStateInsightsPanel.tsx
- ExperimentWorkbenchPanel.tsx
- SimulatorLabPanel.tsx
- GateDescriptionsModal.tsx
- ErrorBoundary.tsx

---

## 32. Appendix C: Suggested Prompt Pack for Slide AI

Copy this prompt with this dossier:

"Generate a detailed technical presentation from this dossier.

Requirements:

- 25 slides
- each slide must include title, 4-7 bullet points, and speaker notes
- include architecture, data flow, and simulation pipeline diagrams
- include one slide that separates confirmed facts vs inferred development timeline
- include one demo plan slide and one Q and A prep slide
- preserve all numeric facts exactly as stated
- use a professional technical style
- include citations to file names where relevant
"

---

End of dossier.
