# Product Roadmap: Useful, Not Cumbersome

This roadmap prioritizes features people will actually use in a browser quantum circuit app, while preventing UI overload.

## Product Goal

- Primary value: build, run, understand, iterate quickly.
- Principle: default UI should solve 80% of tasks in 1-2 clicks.
- Advanced workflows stay available, but hidden behind explicit Advanced areas.

## Keep (Core Experience)

These are high-frequency, high-value features that should stay immediately visible:

1. Circuit editor fundamentals
- Gate palette, drag/drop placement, move, replace, delete.
- Keyboard shortcuts for fast iteration.
- Undo/redo.

2. Core simulation outputs
- Probability chart.
- Shot histogram (ideal vs noisy).
- Bloch/Dirac views.
- Step-through execution.

3. Practical analysis
- Operational insights and confidence cues.
- A/B comparison snapshots.
- Professional report export.

4. Reliability and workflow
- Local-first operation.
- Drafts with persistence across reloads.
- QASM import/export.

## Move to Advanced (Keep, but De-emphasize)

These remain valuable for power users and courses, but should not dominate first-run UX:

1. Optimizer presets and deep transpilation details.
2. Batch experiment runner and benchmark harness.
3. Calibration fitting and multi-objective tuning.
4. Interop diagnostics and round-trip verifier.
5. Detailed entanglement/fidelity metric panels.

Recommended UX treatment:
- Place under Advanced accordion in Simulator Lab.
- Add short "when to use this" helper text for each tool.

## Cut or Merge (Reduce Cognitive Load)

These are not necessarily bad features, but should be merged if they overlap:

1. Overlapping analysis cards with similar metrics.
2. Duplicate educational wording across tabs.
3. Repeated optimization summaries in multiple panels.
4. Any workflow requiring many controls before first result.

Rule:
- If two panels answer the same user question, keep one and link to details.

## Build Next (High ROI)

### Wave 1: UX clarity and speed to insight

1. Core/Advanced mode switch in Simulator Lab
- Core mode shows only top 5-7 tools.
- Advanced mode reveals full suite.

2. Explain-this-change panel
- On circuit edits, show what changed and expected output impact.

3. Invalid placement guidance
- Keep current invalid footprint and add a short reason label for rejection.

4. Device realism presets
- Ideal, Typical NISQ, Noisy Stress Test.

### Wave 2: Features users repeatedly ask for

1. Observable panel
- Expectation values for common operators and user-entered Pauli strings.

2. Option-drag duplicate discoverability
- Small tooltip/hint after first gate move.

3. Draft metadata
- Last modified timestamp, notes, and tags for project organization.

### Wave 3: Power-user depth without clutter

1. Parameter sweep workspace (single-parameter first).
2. Error mitigation mini-lab (readout mitigation first).
3. Backend constraints assistant (optional per-profile checks).

## Success Metrics

Track these after each wave:

1. Time to first successful run (new user).
2. Average number of tabs visited before running shots.
3. Drop-off rate in Simulator Lab.
4. Frequency of draft switching and report export.
5. Use rate of Advanced-only tools.

Decision rule:
- Any feature with low use + high confusion cost should be merged, hidden, or removed.

## Implementation Sequence (4 Sprints)

### Sprint 1
- [done] Core/Advanced mode in Simulator Lab.
- [done] Remove duplicate/overlapping cards (core-first overlap reduction + hidden duplicate cards).
- [done] Add "why invalid" feedback for gate placement.

### Sprint 2
- Explain-this-change panel.
- Device realism presets.
- Draft metadata basics.

### Sprint 3
- Observable panel.
- Error mitigation mini-lab (readout correction).

### Sprint 4
- Parameter sweep workspace.
- Constraints assistant.
- Final cleanup pass based on usage analytics.

## Design Guardrails

1. No new top-level tab unless it serves a distinct primary workflow.
2. Every advanced panel needs:
- one-line purpose
- input requirements
- expected output
3. Prefer progressive disclosure over dense all-in-one screens.
4. Preserve fast local behavior and offline operation.
