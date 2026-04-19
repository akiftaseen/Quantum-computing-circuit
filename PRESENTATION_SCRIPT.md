# Quantum Circuit Simulator Presentation Script

Date: 2026-04-19
Deck target: slides.html (25 slides)
Suggested pace: 18 to 25 minutes total

## Slide 1 - Quantum Circuit Simulator
Talk track:
- Today I am presenting a browser-native quantum circuit simulator that combines education-focused UX with engineering-grade workflows.
- The key idea is local-first execution: no backend required for building, simulating, analyzing, and exporting experiments.
- The platform is built on React, TypeScript, and Vite, and it includes both ideal and noisy simulation paths.
- I will first cover architecture and simulation internals, then move into advanced tooling, reliability, and roadmap.
Transition:
- Let us start with the problem this product was designed to solve.

## Slide 2 - Problem and Motivation
Talk track:
- Existing quantum tooling often has two gaps: either it is too dependent on backend compute, or it is too specialized for beginners to use effectively.
- We needed one environment where users can learn visually while still running reproducible, technical experiments.
- A local-first model also improves privacy, portability, and offline resilience.
- The product strategy is to keep the default workflow approachable while exposing advanced capabilities when needed.
Transition:
- That leads directly to how we positioned the product for two different user groups.

## Slide 3 - Product Positioning
Talk track:
- The first audience is learners and educators, who need intuitive visual feedback like probabilities, Bloch vectors, and Dirac views.
- The second audience is practitioners, who need seeded reproducibility, hardware checks, optimization workflows, and interop.
- Instead of creating separate tools, we used progressive disclosure: simple primary workflow plus a deep lab workspace.
- This keeps onboarding smooth without limiting power users.
Transition:
- Next, I will briefly summarize the technical stack behind this design.

## Slide 4 - Technology Stack
Talk track:
- The frontend is React 19 with TypeScript strict mode, bundled with Vite for fast iteration and optimized builds.
- Recharts powers chart visuals, and lucide-react keeps iconography consistent.
- The app is PWA-enabled, including offline support and service worker update behavior.
- Quality and reliability are enforced through ESLint, strict TypeScript settings, and Vitest-based testing.
Transition:
- With stack context set, let us look at the architecture layers.

## Slide 5 - Architecture Overview
Talk track:
- The architecture has three clear layers: UI components, state hooks, and pure logic modules.
- The UI layer handles interaction and visualization.
- Hooks handle cross-cutting state concerns like history, drafts, and theme.
- The logic layer contains the simulation and analysis engines, independent from React rendering.
Transition:
- Here is how data flows through those layers during a typical user interaction.

## Slide 6 - Data Flow Pipeline
Talk track:
- A user edits a circuit in the grid, which updates CircuitState through history-managed state transitions.
- Inputs are then validated and enriched with symbol bindings and initial-state definitions.
- The circuit runner executes state evolution, optionally followed by shot sampling or noisy sampling.
- Analysis modules derive metrics and diagnostics, and those results feed the visual tabs.
Transition:
- To understand this pipeline, we need to look at the domain model first.

## Slide 7 - Domain Model Schema
Talk track:
- The core entities are GateName, PlacedGate, and CircuitState.
- PlacedGate includes structural placement fields and optional classical control fields for feed-forward logic.
- CircuitState is compact and serializable, which makes history, persistence, and export straightforward.
- This strongly typed schema is the backbone that keeps editing and simulation consistent.
Transition:
- With the schema in place, let us inspect the interaction model in the editor.

## Slide 8 - Editing UX Internals
Talk track:
- The editor uses an SVG-based circuit grid with drag-and-drop placement and move operations.
- It supports quick power actions such as alt-drag copy and keyboard shortcuts for editing speed.
- Invalid placements are blocked early with inline feedback, reducing run-time errors.
- Accessibility is integrated through ARIA labeling and keyboard support.
Transition:
- Now I will move from UX internals to the simulation kernel internals.

## Slide 9 - Simulation Kernels
Talk track:
- The simulation core is built on pure complex-number arithmetic, gate matrix definitions, and state-evolution operators.
- Gate application uses bitwise indexing to update affected amplitudes efficiently.
- Measurement and partial trace behavior are implemented in core logic primitives.
- This gives deterministic and testable behavior outside any UI lifecycle concerns.
Transition:
- These primitives are orchestrated by the circuit runner engine.

## Slide 10 - Circuit Runner Engine
Talk track:
- The runner compiles execution plans, manages mid-circuit measurement complexity, and executes full or partial runs.
- It supports skip-measure preview paths, shot paths, noisy paths, and unitary derivation where valid.
- Multiple caches reduce repeated work, including compiled plan reuse and run-result cache entries.
- Classical conditions based on measurement outcomes are handled during execution.
Transition:
- Next is one of the key performance decisions: how shot sampling is made fast.

## Slide 11 - Shot Sampling and Determinism
Talk track:
- Shot sampling uses alias-table construction, which shifts most cost to setup and keeps per-shot draws at constant time.
- This is crucial for interactive workflows where users repeatedly rerun with parameter tweaks.
- Seeded randomness makes repeated experiments reproducible, which is important for benchmarking and demos.
- We also expose practical runtime constraints and cache limits to keep behavior predictable.
Transition:
- I will now show how the system handles noise in a physically richer pathway.

## Slide 12 - Noise and Density-Matrix Evolution
Talk track:
- When noise is enabled, the execution model transitions from pure state-vector assumptions to density-matrix evolution.
- Noise channels include depolarizing, amplitude damping, bit/phase flip, and readout effects.
- Timing parameters such as T1 and T2 are integrated so the model can reflect realistic degradation behavior.
- Calibration and mitigation tools are built around this path for practical experiment correction.
Transition:
- With execution paths covered, let us examine how outputs are visualized.

## Slide 13 - Visualization Surfaces
Talk track:
- The simulator intentionally offers multiple synchronized representations because each representation answers different questions.
- Probability and histogram views expose outcome distributions.
- Bloch and Dirac views make state interpretation more intuitive for learning and debugging.
- The math lens and analysis tabs connect visual behavior back to formal structure.
Transition:
- Those visuals are powered by a deeper analysis layer, shown next.

## Slide 14 - Analysis and Insight Modules
Talk track:
- The analysis stack includes fidelity and distance metrics, interference/coherence analysis, and entanglement diagnostics.
- It also includes heuristic optimization signals such as cancellation opportunities and decomposition hints.
- The goal is not only to simulate outcomes, but to explain why outcomes look the way they do.
- This makes the platform useful for both instruction and iterative engineering.
Transition:
- The most advanced workflows live in the Simulator Lab, which I will map now.

## Slide 15 - Simulator Lab Feature Map
Talk track:
- Simulator Lab is the advanced workspace where optimization, calibration, mitigation, interop, and profiling tools are centralized.
- It includes parameter optimization, noise sweeps, readout mitigation, routing checks, and experiment management.
- These are integrated, not isolated utilities, so users can chain workflows quickly.
- The result is a practical laboratory surface inside the same app shell.
Transition:
- Let us zoom in on one representative area: optimization and calibration mechanics.

## Slide 16 - Optimization and Sweep Mechanics
Talk track:
- The calibration process uses a clearly defined parameter grid over depolarizing, damping, and readout error dimensions.
- The lattice shown here is a 2D slice of that search space, repeated across readout levels.
- The full fit evaluates 216 combinations and scores them with KL divergence.
- This is a deliberate tradeoff between computational cost and calibration usefulness.
Transition:
- Next I will show how the app bridges ideal circuits and hardware constraints.

## Slide 17 - Hardware Awareness and Routing
Talk track:
- The app ships with reference hardware profiles, including constrained coupling topologies.
- Compatibility checks evaluate unsupported gates, edge violations, and expected routing overhead.
- For nonadjacent interactions, SWAP insertion is performed using shortest-path heuristics.
- This gives users practical NISQ awareness without leaving the simulation workflow.
Transition:
- Interoperability is another critical bridge, especially for external ecosystems.

## Slide 18 - Interoperability and OpenQASM
Talk track:
- OpenQASM-lite import/export allows circuits to move between this app and external tooling pipelines.
- The system provides diagnostics for unsupported constructs instead of failing silently.
- It also supports round-trip structural checks to verify transformation integrity.
- Transpile-like optimization levels provide practical pre-export optimization controls.
Transition:
- Next, I will cover initial-state flexibility, which is essential for many experiments.

## Slide 19 - Initial State System
Talk track:
- Users can initialize circuits with simple presets or with advanced expression-based statevector definitions.
- The parser supports arithmetic and common constants, with explicit validation feedback.
- Template states include Bell, GHZ, W, cluster, stabilizer, Haar, and Dicke-style options.
- This removes friction when testing specific target-state behaviors.
Transition:
- Persistence and reproducibility are the next important operational topic.

## Slide 20 - Persistence and State Lifecycle
Talk track:
- The app is local-first and persists key workspace and lab data using versioned local storage keys.
- Draft workflows, UI settings, experiment traces, and packs can be restored consistently.
- Export/import supports portable state snapshots for sharing and backup.
- This is essential for repeatable experimentation over multiple sessions.
Transition:
- I will now summarize reliability evidence from testing and quality controls.

## Slide 21 - QA and Reliability Evidence
Talk track:
- The logic layer has broad test coverage with over one hundred test cases across critical behaviors.
- Tests emphasize deterministic correctness, edge-case robustness, and interop/routing invariants.
- Strict TypeScript and linting settings provide additional compile-time and static analysis safeguards.
- Together, these practices make the core engine trustworthy for iterative technical use.
Transition:
- Next is a reconstruction of how this system likely evolved over time.

## Slide 22 - Development Journey (Inferred)
Talk track:
- Based on code and module structure, development likely started with core math and simulation.
- The team then layered visual editing and educational surfaces, followed by analytics and lab tooling.
- Interop, hardware-aware functionality, and hardening appear to be later phases.
- This timeline is explicitly marked as inference, not direct historical metadata.
Transition:
- I will now close the technical section with explicit limitations and risk areas.

## Slide 23 - Constraints and Risk Areas
Talk track:
- The current limits favor browser practicality, including qubit and column caps.
- There is also a shot-policy nuance between constants and UI clamping that should be unified.
- QASM-lite scope and routing heuristics are practical but not fully general or globally optimal.
- Noise calibration is intentionally coarse and can be extended with adaptive refinement.
Transition:
- Before closing, here is the recommended live demo sequence.

## Slide 24 - Recommended Live Demo Flow
Talk track:
- Start with a Bell template to establish the editing and execution loop quickly.
- Show ideal outcomes first, then noisy outcomes, then interpretive views.
- Move into analysis and one advanced lab workflow such as optimization or sweep.
- End with report and QASM export to demonstrate portability and reproducibility.
Transition:
- I will finish with forward-looking opportunities and then open the floor.

## Slide 25 - Future Horizons and Q and A
Talk track:
- The roadmap focuses on three tracks: performance acceleration, stronger compiler/hardware mapping, and deeper interoperability.
- A stabilizer fast path and improved routing could significantly expand practical scale.
- Interop grammar depth and benchmark expansion can further strengthen research use cases.
- Thank you, and I welcome questions.

## Optional Timing Guide
- Slides 1 to 4: 3 to 4 minutes
- Slides 5 to 12: 7 to 9 minutes
- Slides 13 to 20: 6 to 8 minutes
- Slides 21 to 25: 3 to 4 minutes

## Presenter Tips
- Keep mathematical notation simple unless asked.
- Pause briefly on slides 11, 12, 16, and 23 for technical audiences.
- If time is short, compress slides 3, 14, and 22 into one-minute summaries.
