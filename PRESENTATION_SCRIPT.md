# Quantum Circuit Simulator Presentation Script

Date: 2026-04-19
Deck target: slides.html (25 slides)
Suggested pace: 18 to 25 minutes total

This version is written as full narration so you can speak continuously without needing to improvise transitions.

## Slide 1 - Quantum Circuit Simulator
"Good [morning/afternoon], everyone. Today I am presenting a browser-native quantum circuit simulator that was designed to serve both education and engineering use cases in one product. The central idea is local-first execution: users can build circuits, run simulations, analyze outcomes, and export artifacts without depending on a backend service. Technically, the platform is built with React, TypeScript, and Vite, and it supports both ideal execution and realistic noisy execution paths. In this presentation, I will walk through architecture, simulation internals, advanced lab features, quality evidence, and finally the roadmap."

## Slide 2 - Problem and Motivation
"This project started from a practical gap in existing quantum tooling. On one side, many tools are tied to backend compute and introduce cost, latency, or setup friction. On the other side, many beginner tools are intuitive but too shallow for serious iteration. We wanted a system that keeps the interaction simple for learning while still enabling reproducible technical workflows. A local-first model also improves privacy, portability, and resilience when internet access is limited. So the core motivation was to build one coherent environment that does not force users to choose between approachability and depth."

## Slide 3 - Product Positioning
"The product is intentionally built for two personas. The first is learners and educators, who need immediate visual feedback such as probabilities, Bloch representations, and Dirac notation. The second is practitioners and researchers, who need deterministic shot runs, optimization tooling, hardware-awareness checks, and interoperability features. Instead of building two separate products, we used progressive disclosure. The main workflow stays clean and approachable, while deeper functionality is available in the Simulator Lab. That gives new users a low-friction entry point and power users the depth they need."

## Slide 4 - Technology Stack
"From a technical perspective, the frontend uses React 19 and TypeScript with strict settings, and Vite is used for development speed and efficient bundling. Visualization is handled with Recharts, and icon consistency comes from lucide-react. The app is also configured as a PWA, so offline behavior is part of the product rather than an afterthought. For quality controls, we enforce linting, strict typing, and Vitest-based test coverage. In short, the stack balances delivery speed with long-term maintainability and reliability."

## Slide 5 - Architecture Overview
"The architecture follows three clear layers. The UI layer handles rendering and user interaction. The hook layer encapsulates cross-cutting state concerns such as history, drafts, and theme behavior. The logic layer contains the pure computational modules for simulation, analysis, optimization, and interop. This separation is intentional: simulation correctness should not depend on React rendering behavior. It also makes testing cleaner because the logic layer can be validated independently from the UI lifecycle."

## Slide 6 - Data Flow Pipeline
"Here is the end-to-end runtime flow. A user edits the circuit on the grid, and that updates CircuitState through controlled history transitions. Inputs are validated, and optional enrichments such as symbol bindings and initial-state definitions are applied. The runner then executes state evolution and may branch into shot sampling or noisy sampling depending on the mode. Analysis modules compute metrics and diagnostics from those results. Finally, the tabbed interface renders synchronized visual and textual outputs so users can interpret behavior from multiple perspectives."

## Slide 7 - Domain Model Schema
"At the core, three types keep everything coherent: GateName, PlacedGate, and CircuitState. PlacedGate includes placement metadata and optional classical control fields, which is important for conditional logic and feed-forward behavior. CircuitState is intentionally compact and serializable, which supports persistence, history, and export pipelines. Because these types are strict and shared across the codebase, editing and execution stay aligned. This schema is effectively the contract that keeps the product consistent."

## Slide 8 - Editing UX Internals
"The editor uses an SVG-based circuit grid for precision and scalability. Users can drag gates from the palette, move gates directly on the grid, and use faster interactions like modifier-assisted copy behavior. Invalid placements are blocked early with visible feedback so users do not discover structural issues only at run time. Accessibility is also part of the editing model, including keyboard interaction and ARIA-friendly labeling. So although the surface looks simple, the interaction engine is quite robust."

## Slide 9 - Simulation Kernels
"Under the hood, simulation is built on pure complex arithmetic, gate matrices, and evolution primitives. Rather than relying on generic heavy matrix operations at every step, the implementation uses bitwise indexing to target only affected amplitudes. Measurement and partial-trace behavior are implemented directly in core logic primitives, which keeps execution deterministic and explainable. Because these modules are pure functions, they are easy to test and reason about. This is the computational foundation of the entire application."

## Slide 10 - Circuit Runner Engine
"The circuit runner is the orchestration layer on top of the simulation primitives. It compiles execution plans, handles partial stepping, supports skip-measure previews, and executes ideal or noisy runs based on mode. It also handles classical conditions derived from measurement outcomes, which is essential for realistic circuit behavior. Performance is improved with plan and run caches so repeated interactions do not constantly recompute expensive paths. This runner is where correctness, flexibility, and responsiveness meet."

## Slide 11 - Shot Sampling and Determinism
"A key performance decision is the alias-table approach for shot sampling. Setup takes linear time in the number of states, but once the table is built, each sample draw is constant time. That matters because users often rerun thousands of shots while adjusting parameters live. Another important property is deterministic reproducibility through seeded randomness, which supports fair comparisons and repeatable experiments. So this layer is optimized for both speed and scientific consistency."

## Slide 12 - Noise and Density-Matrix Evolution
"When noise is enabled, the model moves from pure state-vector assumptions to a density-matrix execution path. That allows the simulator to represent mixed states and decoherence effects more faithfully. Configurable channels include depolarizing, amplitude damping, phase and bit flips, and readout effects, plus timing-related parameters like T1 and T2 context. Calibration and mitigation tools are built around this same pathway, so noisy analysis is integrated rather than bolted on. The result is practical realism while staying interactive in the browser."

## Slide 13 - Visualization Surfaces
"This product intentionally provides multiple synchronized views because no single representation answers every question. Probability and histogram views are best for distribution-level behavior. Bloch and Dirac views provide more intuitive state interpretation, especially for teaching and debugging. The math-oriented views connect these visuals back to formal structure. Together, these surfaces help users move from observation to understanding quickly."

## Slide 14 - Analysis and Insight Modules
"Beyond visualization, the app includes an interpretability layer with state-distance metrics, interference and coherence indicators, and entanglement diagnostics. It also provides heuristic optimization suggestions, such as cancellation opportunities and decomposition hints. The objective is not just to show outputs, but to explain patterns and suggest improvements. That makes the tool useful for iterative design loops, not only one-off runs. This is where the simulator becomes a decision aid rather than just a calculator."

## Slide 15 - Simulator Lab Feature Map
"Simulator Lab is the advanced workspace for engineering-heavy workflows. It brings together optimization, sweeps, mitigation, calibration, routing checks, interoperability utilities, and experiment management in one place. The important design choice here is composability: these are integrated tools, so users can chain workflows instead of jumping between disconnected utilities. That significantly improves productivity for deeper experimentation. In short, the lab is where advanced users can scale from inspection to full investigative workflows."

## Slide 16 - Optimization and Sweep Mechanics
"This slide highlights the calibration and sweep mechanics. The parameter grid is explicit and bounded, which makes search behavior transparent to users. The shown matrix is a structured slice of the calibration space, and the full process expands across readout levels for a total of 216 candidate evaluations. Candidates are scored using KL divergence, which gives a principled comparison against observed distributions. This is a practical engineering compromise: enough resolution to be useful, while staying fast enough for interactive use."

## Slide 17 - Hardware Awareness and Routing
"The simulator also includes hardware-awareness features so users can move closer to realistic constraints. It provides reference hardware profiles with coupling information and noise-related context. Compatibility checks evaluate unsupported operations, connectivity violations, and expected routing overhead. For non-adjacent interactions, routing uses SWAP insertion based on shortest-path heuristics. This gives users early feedback on deployability without leaving the design environment."

## Slide 18 - Interoperability and OpenQASM
"Interoperability is handled through an OpenQASM-lite pipeline for import and export. The system is explicit about unsupported constructs, so users get diagnostics instead of silent failures. It also supports round-trip structural checks, which improves confidence when translating between formats. Transpile-like optimization levels are available before export to improve resulting circuits. Altogether, this makes the app a better bridge to external ecosystems rather than an isolated tool."

## Slide 19 - Initial State System
"Initial state handling supports both accessibility and depth. Beginners can use presets, while advanced users can define expression-based statevectors directly. The parser supports arithmetic and standard constants with clear validation feedback. Template states like Bell, GHZ, W, cluster, stabilizer, Haar, and Dicke variants are built in for fast setup. This significantly reduces friction when exploring specific theoretical scenarios."

## Slide 20 - Persistence and State Lifecycle
"Because the app is local-first, persistence is a core feature. Versioned storage keys capture app state, draft workspaces, and advanced lab artifacts. Users can resume work across sessions with consistent restoration behavior. Export and import support portable snapshots for backup, transfer, and collaboration handoffs. This enables reproducible experimentation over time, not just single-session usage."

## Slide 21 - QA and Reliability Evidence
"Reliability is backed by broad logic-layer test coverage and strict static checks. The suite emphasizes deterministic correctness, edge-case robustness, and interop or routing invariants. Strict TypeScript and linting reduce an entire class of avoidable runtime defects. As a result, the core computational behavior is heavily guarded against regressions. This is critical for a simulator where trust in output quality matters."

## Slide 22 - Development Journey (Inferred)
"This timeline is intentionally marked as inferred, based on code structure and module distribution rather than historical commit narration. The likely progression is core math first, then editing UX and learning surfaces, then advanced analytics and lab tooling, followed by interoperability and hardening. Even as inference, this pattern is useful because it reflects a sensible architecture-first development strategy. It also explains why the computational core feels mature relative to UI complexity growth."

## Slide 23 - Constraints and Risk Areas
"It is important to be explicit about current limits. The simulator prioritizes browser practicality, so qubit and column constraints are intentionally bounded. Some pathways, such as QASM-lite parsing and heuristic routing, are practical but not fully general. Noise calibration currently uses a coarse grid and can be further refined with adaptive methods. Calling out these limits clearly helps users trust both the strengths and boundaries of the platform."

## Slide 24 - Recommended Live Demo Flow
"For a live demo, begin with a Bell-template run to establish immediate value. Then show ideal outcomes, turn on noise, and compare distribution changes so the audience sees cause and effect. Move briefly into analysis panels to explain interpretability, and then open one advanced lab workflow such as optimization or a sweep. Close by exporting a report and OpenQASM artifact to demonstrate reproducibility and ecosystem fit. This sequence gives both narrative clarity and technical depth within a short time window."

## Slide 25 - Future Horizons and Q and A
"Looking forward, the roadmap focuses on three tracks: performance acceleration, stronger compiler and hardware mapping, and deeper interoperability. A stabilizer fast path and richer routing optimization could expand the practical envelope significantly. Additional parser depth and benchmarking improvements can further strengthen research and production-readiness. Thank you for your time, and I would be happy to take your questions."

## Optional Timing Guide
- Slides 1 to 4: 3 to 4 minutes
- Slides 5 to 12: 7 to 9 minutes
- Slides 13 to 20: 6 to 8 minutes
- Slides 21 to 25: 3 to 4 minutes

## Delivery Notes
- Read each slide block naturally; do not rush through technical terms.
- Pause after slides 11, 12, 16, and 23 for likely audience questions.
- If time is short, compress slides 3, 14, and 22 into brief summaries.
