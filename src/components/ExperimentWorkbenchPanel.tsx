import React, { useMemo, useState } from 'react';
import type { Complex } from '../logic/complex';
import type { CircuitState } from '../logic/circuitTypes';
import type { NoiseConfig } from '../logic/noiseModel';
import { analyzeCircuit, calculateCircuitCost } from '../logic/circuitAnalysis';
import { stateFidelity, traceDistanceApprox } from '../logic/stateMetrics';

interface Props {
  circuit: CircuitState;
  state: Complex[];
  shotsResult: Map<string, number> | null;
  noisyShotsResult: Map<string, number> | null;
  noise: NoiseConfig;
  numShots: number;
}

interface Snapshot {
  label: 'A' | 'B';
  capturedAt: number;
  circuit: CircuitState;
  state: Complex[];
  totalGates: number;
  depth: number;
  twoQ: number;
  cost: number;
  topBasis: string;
  topProb: number;
}

const GLOSSARY: Record<string, string> = {
  confidence: 'Composite reliability score based on shot volume, outcome dominance, and ideal-vs-noisy stability.',
  topOutcome: 'Most likely computational basis string in the current state estimate.',
  dominance: 'Probability gap between the first and second most likely outcomes.',
  tvDistance: 'Total variation distance between two distributions. 0 means identical; larger means more shifted.',
  fidelity: 'State overlap metric in [0,1], where 1 indicates identical pure states.',
  traceDistance: 'Distribution-level distance proxy in [0,1], where 0 indicates very similar output behavior.',
};

const normalizeHistogram = (hist: Map<string, number> | null): Map<string, number> => {
  if (!hist || hist.size === 0) return new Map();
  let total = 0;
  for (const v of hist.values()) total += v;
  const out = new Map<string, number>();
  const safeTotal = total || 1;
  for (const [k, v] of hist.entries()) out.set(k, v / safeTotal);
  return out;
};

const probsFromState = (state: Complex[]): number[] => {
  const p = state.map((z) => z.re * z.re + z.im * z.im);
  const total = p.reduce((s, v) => s + v, 0) || 1;
  return p.map((v) => v / total);
};

const topFromState = (state: Complex[]): { idx: number; prob: number; second: number } => {
  const p = probsFromState(state);
  let idx = 0;
  let first = -1;
  let second = -1;
  for (let i = 0; i < p.length; i += 1) {
    const v = p[i];
    if (v > first) {
      second = first;
      first = v;
      idx = i;
    } else if (v > second) {
      second = v;
    }
  }
  return { idx, prob: Math.max(0, first), second: Math.max(0, second) };
};

const tvDistanceFromHistograms = (a: Map<string, number>, b: Map<string, number>): number => {
  const keys = new Set<string>([...a.keys(), ...b.keys()]);
  let sum = 0;
  for (const key of keys) {
    sum += Math.abs((a.get(key) ?? 0) - (b.get(key) ?? 0));
  }
  return 0.5 * sum;
};

const cloneCircuit = (c: CircuitState): CircuitState => ({
  numQubits: c.numQubits,
  numColumns: c.numColumns,
  gates: c.gates.map((g) => ({
    ...g,
    targets: [...g.targets],
    controls: [...g.controls],
    params: [...g.params],
  })),
});

const buildOperationalChecks = (
  circuit: CircuitState,
  shotsResult: Map<string, number> | null,
  numShots: number,
): string[] => {
  const checks: string[] = [];
  const measures = circuit.gates.filter((g) => g.gate === 'M');

  if (circuit.gates.length === 0) {
    checks.push('Circuit is empty. Add gates to generate a meaningful state transition.');
  }

  if (!shotsResult || shotsResult.size === 0) {
    checks.push('No shot sample is loaded. Run shots to validate distribution stability.');
  }

  if (numShots < 256) {
    checks.push(`Shot count is ${numShots}. Consider >=256 for stable histogram estimates.`);
  }

  if (measures.length > 0) {
    const earliestMeasureCol = Math.min(...measures.map((g) => g.column));
    const measuredQubits = new Set<number>(measures.flatMap((g) => g.targets));
    const postMeasureOps = circuit.gates.some((g) => {
      if (g.column <= earliestMeasureCol) return false;
      const wires = [...g.targets, ...g.controls];
      return wires.some((q) => measuredQubits.has(q));
    });
    if (postMeasureOps) {
      checks.push('Operations are present after measurement on measured qubits; downstream effect may not influence readout outcomes.');
    }
  }

  const metrics = analyzeCircuit(circuit);
  if (metrics.circuitDepth > 60) {
    checks.push(`Circuit depth is ${metrics.circuitDepth}. Consider compaction to reduce simulation and interpretation overhead.`);
  }
  if (metrics.twoQubitGateCount > Math.max(4, metrics.totalGates * 0.4)) {
    checks.push('Two-qubit gate density is high; expect stronger sensitivity to noise and parameter drift.');
  }

  return checks;
};

const Term: React.FC<{ term: keyof typeof GLOSSARY; children: React.ReactNode }> = ({ term, children }) => {
  return (
    <span className="wb-term" title={GLOSSARY[term]}>
      {children}
    </span>
  );
};

const formatDateTime = (ts: number): string => new Date(ts).toLocaleString();

const ExperimentWorkbenchPanel: React.FC<Props> = ({
  circuit,
  state,
  shotsResult,
  noisyShotsResult,
  noise,
  numShots,
}) => {
  const [snapshotA, setSnapshotA] = useState<Snapshot | null>(null);
  const [snapshotB, setSnapshotB] = useState<Snapshot | null>(null);

  const metrics = useMemo(() => analyzeCircuit(circuit), [circuit]);
  const cost = useMemo(() => calculateCircuitCost(circuit), [circuit]);

  const top = useMemo(() => topFromState(state), [state]);
  const topBasis = useMemo(
    () => top.idx.toString(2).padStart(circuit.numQubits, '0'),
    [top.idx, circuit.numQubits],
  );

  const idealDist = useMemo(() => normalizeHistogram(shotsResult), [shotsResult]);
  const noisyDist = useMemo(() => normalizeHistogram(noisyShotsResult), [noisyShotsResult]);
  const tv = useMemo(() => tvDistanceFromHistograms(idealDist, noisyDist), [idealDist, noisyDist]);

  const confidence = useMemo(() => {
    const shotFactor = Math.min(1, numShots / 4096);
    const dominance = Math.max(0, top.prob - top.second);
    const stability = noise.enabled ? Math.max(0, 1 - tv) : 1;
    const score = 100 * (0.35 * shotFactor + 0.35 * dominance + 0.30 * stability);
    return Math.max(0, Math.min(100, score));
  }, [numShots, top.prob, top.second, noise.enabled, tv]);

  const explanations = useMemo(() => {
    const notes: string[] = [];
    const probs = probsFromState(state);
    const activeCount = probs.filter((p) => p > 0.01).length;

    if (activeCount > 1) {
      notes.push(`State support spans ${activeCount} significant basis states, indicating non-trivial superposition structure.`);
    } else {
      notes.push('State is strongly concentrated on a single basis outcome, indicating near-deterministic behavior.');
    }

    if (metrics.twoQubitGateCount > 0) {
      notes.push(`Circuit includes ${metrics.twoQubitGateCount} multi-qubit operations, so wire interactions materially shape output statistics.`);
    } else {
      notes.push('Circuit is single-qubit only; output behavior is dominated by independent per-qubit transformations.');
    }

    if (noise.enabled) {
      notes.push(`Noise model is active; observed ideal-vs-noisy shift (TV distance ${tv.toFixed(3)}) quantifies distribution drift.`);
    } else {
      notes.push('Noise model is disabled; outcome variation is driven by circuit dynamics and shot sampling only.');
    }

    notes.push(`Top outcome is |${topBasis}⟩ at ${(top.prob * 100).toFixed(2)}% with ${(Math.max(0, top.prob - top.second) * 100).toFixed(2)}% dominance gap.`);
    return notes;
  }, [state, metrics.twoQubitGateCount, noise.enabled, tv, topBasis, top.prob, top.second]);

  const checks = useMemo(() => buildOperationalChecks(circuit, shotsResult, numShots), [circuit, shotsResult, numShots]);

  const captureSnapshot = (label: 'A' | 'B') => {
    const snap: Snapshot = {
      label,
      capturedAt: Date.now(),
      circuit: cloneCircuit(circuit),
      state: state.map((z) => ({ ...z })),
      totalGates: metrics.totalGates,
      depth: metrics.circuitDepth,
      twoQ: metrics.twoQubitGateCount,
      cost,
      topBasis,
      topProb: top.prob,
    };
    if (label === 'A') setSnapshotA(snap);
    else setSnapshotB(snap);
  };

  const compareSummary = useMemo(() => {
    if (!snapshotA || !snapshotB) return null;
    return {
      fidelity: stateFidelity(snapshotA.state, snapshotB.state),
      traceDistance: traceDistanceApprox(snapshotA.state, snapshotB.state),
      gateDelta: snapshotB.totalGates - snapshotA.totalGates,
      depthDelta: snapshotB.depth - snapshotA.depth,
      costDelta: snapshotB.cost - snapshotA.cost,
      topDelta: snapshotB.topProb - snapshotA.topProb,
    };
  }, [snapshotA, snapshotB]);

  const downloadText = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportReport = (format: 'md' | 'json') => {
    const generatedAt = Date.now();
    const base = {
      generatedAt,
      circuit: {
        qubits: circuit.numQubits,
        columns: circuit.numColumns,
        gates: metrics.totalGates,
        depth: metrics.circuitDepth,
        twoQubitGates: metrics.twoQubitGateCount,
        estimatedCost: cost,
      },
      execution: {
        shots: numShots,
        noiseEnabled: noise.enabled,
        topOutcome: topBasis,
        topProbability: top.prob,
        confidence,
        tvDistance: tv,
      },
      observations: explanations,
      operationalChecks: checks,
      abCompare: compareSummary,
    };

    if (format === 'json') {
      downloadText('analysis-report.json', JSON.stringify(base, null, 2));
      return;
    }

    const lines: string[] = [
      '# Quantum Circuit Simulator Analysis Report',
      '',
      `Generated: ${formatDateTime(generatedAt)}`,
      '',
      '## Circuit Summary',
      `- Qubits: ${circuit.numQubits}`,
      `- Columns: ${circuit.numColumns}`,
      `- Gates: ${metrics.totalGates}`,
      `- Depth: ${metrics.circuitDepth}`,
      `- Two-qubit gates: ${metrics.twoQubitGateCount}`,
      `- Estimated cost: ${cost}`,
      '',
      '## Execution Quality',
      `- Shots: ${numShots}`,
      `- Noise enabled: ${noise.enabled ? 'Yes' : 'No'}`,
      `- Top outcome: |${topBasis}⟩`,
      `- Top outcome probability: ${(top.prob * 100).toFixed(2)}%`,
      `- Confidence score: ${confidence.toFixed(1)} / 100`,
      `- Ideal-vs-noisy TV distance: ${tv.toFixed(4)}`,
      '',
      '## Observations',
      ...explanations.map((n) => `- ${n}`),
      '',
      '## Operational Checks',
      ...(checks.length > 0 ? checks.map((n) => `- ${n}`) : ['- No blocking operational flags detected.']),
    ];

    if (compareSummary) {
      lines.push(
        '',
        '## A/B Comparison',
        `- State fidelity: ${compareSummary.fidelity.toFixed(4)}`,
        `- Trace distance (approx): ${compareSummary.traceDistance.toFixed(4)}`,
        `- Gate delta (B-A): ${compareSummary.gateDelta}`,
        `- Depth delta (B-A): ${compareSummary.depthDelta}`,
        `- Cost delta (B-A): ${compareSummary.costDelta}`,
        `- Top outcome probability delta (B-A): ${(compareSummary.topDelta * 100).toFixed(2)}%`,
      );
    }

    downloadText('analysis-report.md', `${lines.join('\n')}\n`);
  };

  return (
    <div className="wb-panel">
      <div className="wb-header-row">
        <h4 className="wb-title">Insights Workspace</h4>
      </div>

      <section className="wb-card">
        <div className="wb-card-title">Operational Interpretation</div>
        <ul className="wb-list">
          {explanations.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>

      <section className="wb-card">
        <div className="wb-card-title">Operational Checks</div>
        {checks.length > 0 ? (
          <ul className="wb-list wb-list-warn">
            {checks.map((item) => <li key={item}>{item}</li>)}
          </ul>
        ) : (
          <p className="wb-note">No blocking operational flags detected.</p>
        )}
      </section>

      <section className="wb-card">
        <div className="wb-card-title"><Term term="confidence">Confidence Meter</Term></div>
        <div className="wb-confidence-wrap">
          <div className="wb-confidence-track">
            <div className="wb-confidence-fill" style={{ width: `${confidence.toFixed(1)}%` }} />
          </div>
          <div className="wb-confidence-value">{confidence.toFixed(1)} / 100</div>
        </div>
        <div className="wb-metric-row">
          <span><Term term="topOutcome">Top outcome</Term>: |{topBasis}⟩</span>
          <span><Term term="dominance">Dominance</Term>: {(Math.max(0, top.prob - top.second) * 100).toFixed(2)}%</span>
          <span><Term term="tvDistance">TV distance</Term>: {tv.toFixed(4)}</span>
        </div>
      </section>

      <section className="wb-card">
        <div className="wb-card-title">A/B Compare Workspace</div>
        <div className="wb-inline-actions">
          <button className="btn" onClick={() => captureSnapshot('A')}>Capture A</button>
          <button className="btn" onClick={() => captureSnapshot('B')}>Capture B</button>
          <button className="btn" onClick={() => { setSnapshotA(null); setSnapshotB(null); }}>Clear</button>
        </div>

        <div className="wb-compare-grid">
          <div className="wb-compare-card">
            <div className="wb-compare-head">Snapshot A</div>
            {snapshotA ? (
              <>
                <div>Captured: {formatDateTime(snapshotA.capturedAt)}</div>
                <div>Gates: {snapshotA.totalGates}</div>
                <div>Depth: {snapshotA.depth}</div>
                <div>Cost: {snapshotA.cost}</div>
                <div>Top: |{snapshotA.topBasis}⟩ ({(snapshotA.topProb * 100).toFixed(2)}%)</div>
              </>
            ) : <div className="wb-note">Not captured</div>}
          </div>
          <div className="wb-compare-card">
            <div className="wb-compare-head">Snapshot B</div>
            {snapshotB ? (
              <>
                <div>Captured: {formatDateTime(snapshotB.capturedAt)}</div>
                <div>Gates: {snapshotB.totalGates}</div>
                <div>Depth: {snapshotB.depth}</div>
                <div>Cost: {snapshotB.cost}</div>
                <div>Top: |{snapshotB.topBasis}⟩ ({(snapshotB.topProb * 100).toFixed(2)}%)</div>
              </>
            ) : <div className="wb-note">Not captured</div>}
          </div>
        </div>

        {compareSummary && (
          <div className="wb-compare-summary">
            <div><Term term="fidelity">Fidelity</Term>: {compareSummary.fidelity.toFixed(4)}</div>
            <div><Term term="traceDistance">Trace distance (approx)</Term>: {compareSummary.traceDistance.toFixed(4)}</div>
            <div>Gate delta (B-A): {compareSummary.gateDelta}</div>
            <div>Depth delta (B-A): {compareSummary.depthDelta}</div>
            <div>Cost delta (B-A): {compareSummary.costDelta}</div>
          </div>
        )}
      </section>

      <section className="wb-card">
        <div className="wb-card-title">Professional Report Export</div>
        <p className="wb-note">Export a timestamped technical summary of current circuit behavior, checks, confidence metrics, and A/B comparison.</p>
        <div className="wb-inline-actions">
          <button className="btn" onClick={() => exportReport('md')}>Export Markdown Report</button>
          <button className="btn" onClick={() => exportReport('json')}>Export JSON Report</button>
        </div>
      </section>
    </div>
  );
};

export default React.memo(ExperimentWorkbenchPanel);
