# Quantum Circuit Simulator - Maintenance Guide

## 1) Scope and Goals

This document is the operational guide for maintaining the simulator safely over time.

Primary goals:
- Preserve correctness of quantum behavior and educational outputs.
- Prevent dead code and drift between UI features and logic modules.
- Keep test coverage practical, deterministic, and CI-stable.
- Make release validation repeatable for any contributor.

## 2) Project Map

Top-level runtime surfaces:
- `src/App.tsx`: app shell, panel orchestration, shared state flow.
- `src/components/`: UI panels and visualizations.
- `src/logic/`: simulation, analysis, interop, noise, and optimization engines.

High-impact component entry points:
- `src/components/CircuitGrid.tsx`: gate rendering, drag/drop interactions.
- `src/components/SimulatorLabPanel.tsx`: advanced tooling (optimizer, calibration, reverse engineering, etc.).
- `src/components/QuantumStateInsightsPanel.tsx`: state metrics and insight visual encodings.
- `src/components/ExperimentWorkbenchPanel.tsx`: confidence meter, A/B compare, report export.

High-impact logic modules:
- `src/logic/circuitRunner.ts`: canonical simulation pipeline.
- `src/logic/simulator.ts`: low-level state evolution primitives.
- `src/logic/templates.ts`: educational reference templates.
- `src/logic/openqasmLite.ts`: OpenQASM import adapter.
- `src/logic/qiskitOss.ts`: transpile-like utilities and OpenQASM export.

## 3) Test Strategy and Current Layers

The repo intentionally uses layered tests.

Core correctness:
- `src/logic/complex.test.ts`
- `src/logic/simulator.test.ts`
- `src/logic/circuitRunner.test.ts`

Template and pipeline behavior:
- `src/logic/templates.test.ts`
- `src/logic/templatePipelineRobustness.test.ts`

Cross-feature accuracy:
- `src/logic/featureAccuracy.test.ts`

Interop/parsing safety:
- `src/logic/interopRobustness.test.ts`
- `src/logic/qiskitOssInterop.test.ts`

Routing and optimization behavior:
- `src/logic/optimizationAndRoutingRobustness.test.ts`

Initialization and collapse behavior:
- `src/logic/stateInitializationRobustness.test.ts`

Reverse-engineering and benchmark checks:
- `src/logic/reverseEngineeringAndBenchmark.test.ts`

Property/fuzz invariants (seeded, deterministic):
- `src/logic/propertyFuzzRobustness.test.ts`

## 4) Daily Maintenance Workflow

Use this exact local validation sequence before merge:

1. `npm run lint`
2. `npm test -- --run`
3. `npm run build`

If changing simulation semantics, also run targeted suites first:

1. `npm test -- --run src/logic/circuitRunner.test.ts src/logic/templates.test.ts`
2. `npm test -- --run src/logic/templatePipelineRobustness.test.ts src/logic/propertyFuzzRobustness.test.ts`

If changing parsing/interop:

1. `npm test -- --run src/logic/interopRobustness.test.ts src/logic/qiskitOssInterop.test.ts`

If changing optimizer/routing:

1. `npm test -- --run src/logic/optimizationAndRoutingRobustness.test.ts`

## 5) Release Checklist

Before tagging a release:

1. Ensure lint/test/build all pass on a clean install.
2. Verify no dead module references remain in logic and component imports.
3. Verify OpenQASM import and export round-trip tests pass.
4. Verify templates test suite passes with no skipped tests.
5. Manually spot-check key UI panels:
   - Circuit editing + run
   - State insights visuals
   - Experiment workbench confidence meter and A/B compare
   - Simulator lab optimizer/calibration/reverse-engineering
6. Confirm generated artifacts are not accidentally committed unless intended.

## 6) UI Consistency Rules

Progress-bar-like visuals should stay visually consistent:
- Shared bar thickness target is 8px where practical.
- Track widths should fill card content width by default.
- Numeric value labels should align cleanly without shrinking tracks.

When updating bar components, check:
- `src/App.css` classes in related panel blocks.
- The same panel for adjacent metrics to avoid style drift.

## 7) Dead Code Policy

Policy:
- If a module has no runtime/UI import path and no near-term integration plan, remove it.
- Tests should represent active features or shared logic contracts.
- Avoid retaining legacy duplicate modules that overlap with active implementations.

Quick dead-code scan approach:
- Search references for module names in `src/**/*.ts` and `src/**/*.tsx`.
- Verify no dynamic import path points to the module.
- Remove module and re-run full validation.

## 8) Known Sensitive Areas

OpenQASM parser sensitivity:
- `src/logic/openqasmLite.ts` capture groups for parameterized gates are easy to break.
- Any regex change here should be followed by interop suite and round-trip tests.

Symbol binding safety:
- `src/logic/symbolBindings.ts` must escape symbol names before regex replacement.

Qubit indexing conventions:
- Simulation and basis indexing assume LSB-style bit mapping in several paths.
- Reverse engineering and basis-state helpers must preserve this mapping.

Toffoli/CCX ordering:
- Control/target ordering mistakes can silently break Grover-like behavior.
- Always validate against template and runner suites when touching multi-qubit application paths.

## 9) How to Add a New Logic Feature Safely

1. Add or update logic implementation in `src/logic`.
2. Add targeted tests for direct behavior.
3. Add at least one integration-style assertion in an existing robustness suite if relevant.
4. Wire into component UI only after tests are green.
5. Run lint/test/build full pass.
6. Update this maintenance guide if your feature introduces new invariants or workflows.

## 10) Troubleshooting Matrix

Symptom: round-trip parse fails with NaN-like behavior
- Check regex capture indices in `src/logic/openqasmLite.ts`.
- Run `src/logic/interopRobustness.test.ts`.

Symptom: optimizer gives unstable or extreme values
- Check step clamping and finite-value invariants.
- Run `src/logic/optimizationAndRoutingRobustness.test.ts` and `src/logic/propertyFuzzRobustness.test.ts`.

Symptom: UI confidence meter looks inconsistent with other bars
- Check `wb-confidence-*` styles in `src/App.css`.
- Ensure 8px track and full-width track behavior in panel card.

Symptom: feature appears in tests but not in UI
- Verify imports in `src/components/**/*.tsx`.
- Remove orphan module/tests if feature is no longer active.

## 11) Ownership Suggestions (Optional)

For team workflows, designate at least one maintainer for each area:
- Simulation core (`circuitRunner`, `simulator`)
- Parsing/interop (`openqasmLite`, `qiskitOss`, macro parser)
- UI consistency (`App.css`, high-traffic components)
- Test health (robustness + property suites)

## 12) Command Reference

Install:
- `npm install`

Dev server:
- `npm run dev`

Lint:
- `npm run lint`

Run all tests once:
- `npm test -- --run`

Run a specific suite:
- `npm test -- --run src/logic/propertyFuzzRobustness.test.ts`

Build:
- `npm run build`

## 13) Maintenance Notes Log

Keep short notes for each non-trivial maintenance change:
- What was changed.
- Why it was changed.
- Which tests were added/updated.
- Which invariants were verified.

This keeps future cleanup safe and prevents reintroducing already-fixed classes of bugs.
