import React, { useMemo, useState } from 'react';
import type { Complex } from '../logic/complex';
import { formatComplex } from '../logic/complex';
import {
  analyzeAmplitudes,
  computeCoherence,
  computeInterferencePattern,
  computePhaseRelationships,
} from '../logic/amplitudeAnalysis';
import {
  allMeasurementOutcomes,
  partialMeasure,
  type MeasurementOutcome,
} from '../logic/measurementCollapse';
import {
  axisMeasurementDistribution,
  marginalizeHistogram,
  normalizeHistogram,
  type MeasurementAxis,
} from '../logic/measurementInsights';
import {
  computeCHSHCanonical,
  computeConcurrence,
  computeSubsystemEntropyProfile,
  findCorrelatedQubitPairs,
} from '../logic/entanglementAnalysis';
import { buildDensityMatrix } from '../logic/densityMatrix';

interface Props {
  state: Complex[];
  numQubits: number;
  shotsResult: Map<string, number> | null;
  noisyShotsResult: Map<string, number> | null;
  noiseEnabled: boolean;
}

const parseQubitSelection = (raw: string, numQubits: number): number[] => {
  const qubits = raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => Number(x))
    .filter((x) => Number.isInteger(x) && x >= 0 && x < numQubits);
  return Array.from(new Set(qubits)).sort((a, b) => a - b).slice(0, 2);
};

const entropyFromDistribution = (dist: Map<string, number>): number => {
  let entropy = 0;
  for (const p of dist.values()) {
    if (p > 1e-10) entropy -= p * Math.log2(p);
  }
  return entropy;
};

const QuantumStateInsightsPanel: React.FC<Props> = ({
  state,
  numQubits,
  shotsResult,
  noisyShotsResult,
  noiseEnabled,
}) => {
  const [measureSelection, setMeasureSelection] = useState('0');
  const [basisQubit, setBasisQubit] = useState(0);
  const [basisAxis, setBasisAxis] = useState<MeasurementAxis>('X');
  const [collapsed, setCollapsed] = useState<MeasurementOutcome | null>(null);

  const selectedMeasureQubits = useMemo(
    () => parseQubitSelection(measureSelection, numQubits),
    [measureSelection, numQubits],
  );

  const amplitudeEntries = useMemo(() => analyzeAmplitudes(state).slice(0, 10), [state]);
  const coherence = useMemo(() => computeCoherence(state), [state]);
  const interference = useMemo(
    () => computeInterferencePattern(state, [selectedMeasureQubits[0] ?? 0]),
    [state, selectedMeasureQubits],
  );
  const phaseRels = useMemo(() => computePhaseRelationships(state, 8), [state]);

  const entropyProfile = useMemo(
    () => computeSubsystemEntropyProfile(state, numQubits),
    [state, numQubits],
  );
  const correlatedPairs = useMemo(
    () => findCorrelatedQubitPairs(state, numQubits).slice(0, 6),
    [state, numQubits],
  );

  const bellPair = useMemo<[number, number] | null>(() => {
    if (correlatedPairs[0]?.pair) return correlatedPairs[0].pair;
    return numQubits >= 2 ? [0, 1] : null;
  }, [correlatedPairs, numQubits]);

  const chsh = useMemo(() => {
    if (!bellPair) return null;
    return computeCHSHCanonical(state, bellPair[0], bellPair[1]);
  }, [state, bellPair]);
  const concurrence = useMemo(() => {
    if (!bellPair) return null;
    return computeConcurrence(state, numQubits, bellPair[0], bellPair[1]);
  }, [state, numQubits, bellPair]);

  const density = useMemo(() => buildDensityMatrix(state), [state]);
  const noisyDiag = useMemo(
    () => normalizeHistogram(noisyShotsResult ?? new Map<string, number>()),
    [noisyShotsResult],
  );
  const noisyPurityProxy = useMemo(() => {
    if (!noiseEnabled || noisyDiag.size === 0) return null;
    let sum = 0;
    for (const p of noisyDiag.values()) sum += p * p;
    return sum;
  }, [noiseEnabled, noisyDiag]);

  const noisyEntropyProxy = useMemo(() => {
    if (!noiseEnabled || noisyDiag.size === 0) return null;
    return entropyFromDistribution(noisyDiag);
  }, [noiseEnabled, noisyDiag]);

  const measurementOutcomes = useMemo(() => {
    if (selectedMeasureQubits.length === 0) return [];
    return allMeasurementOutcomes(state, numQubits, selectedMeasureQubits);
  }, [state, numQubits, selectedMeasureQubits]);

  const basisDist = useMemo(
    () => axisMeasurementDistribution(state, numQubits, basisQubit, basisAxis),
    [state, numQubits, basisQubit, basisAxis],
  );

  const subsetStats = useMemo(() => {
    if (selectedMeasureQubits.length === 0) return new Map<string, number>();
    return normalizeHistogram(marginalizeHistogram(shotsResult, selectedMeasureQubits, numQubits));
  }, [shotsResult, selectedMeasureQubits, numQubits]);

  return (
    <div className="state-insights-panel">
      <h4 className="state-insights-title">State Insights</h4>

      <div className="state-insights-grid">

      <section className="state-insights-card state-insights-card-wide">
        <div className="state-insights-card-title">Amplitude and Interference</div>
        <div className="state-amp-metrics">
          <div className="state-amp-metric-card">
            <div className="state-amp-metric-label">Coherence</div>
            <div className="state-amp-metric-value">{(coherence * 100).toFixed(1)}%</div>
          </div>
          <div className="state-amp-metric-card">
            <div className="state-amp-metric-label">Constructive Interference</div>
            <div className="state-amp-metric-value">{(interference.constructive * 100).toFixed(1)}%</div>
          </div>
          <div className="state-amp-metric-card">
            <div className="state-amp-metric-label">Destructive Interference</div>
            <div className="state-amp-metric-value">{(interference.destructive * 100).toFixed(1)}%</div>
          </div>
        </div>

        <div className="state-amp-grid">
          <div className="state-amp-section">
            <div className="state-amp-section-title">Top Amplitudes</div>
            <div className="state-amplitude-table">
              <div className="state-amplitude-head">Basis</div>
              <div className="state-amplitude-head">Amplitude</div>
              <div className="state-amplitude-head">|amp|</div>
              <div className="state-amplitude-head">Probability</div>
              <div className="state-amplitude-head">Phase</div>
              {amplitudeEntries.map((entry) => (
                <React.Fragment key={entry.basis}>
                  <div>|{entry.basis}⟩</div>
                  <div className="state-mono">{formatComplex(entry.amplitude, 3)}</div>
                  <div>{entry.magnitude.toFixed(3)}</div>
                  <div>{(entry.probability * 100).toFixed(2)}%</div>
                  <div>{entry.phase.toFixed(2)} rad</div>
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="state-amp-section">
            <div className="state-amp-section-title">Phase Relationships</div>
            <div className="state-phase-list">
              {phaseRels.slice(0, 5).map((rel) => (
                <div key={`${rel.fromBasis}-${rel.toBasis}`} className="state-phase-item">
                  <span>|{rel.fromBasis}⟩ vs |{rel.toBasis}⟩</span>
                  <span>{rel.phaseDelta.toFixed(2)} rad</span>
                  <span className={`state-tag state-tag-${rel.type}`}>{rel.type}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="state-insights-card">
        <div className="state-insights-card-title">Entanglement Metrics</div>
        <div className="state-entropy-grid">
          {entropyProfile.map((entropy, q) => (
            <div key={q} className="state-entropy-item">
              <span>q{q}</span>
              <div className="state-bar"><div style={{ width: `${Math.min(100, entropy * 100)}%` }} /></div>
              <span>{entropy.toFixed(3)}</span>
            </div>
          ))}
        </div>

        <div className="state-corr-grid">
          {correlatedPairs.slice(0, 4).map((pair) => (
            <div key={`${pair.pair[0]}-${pair.pair[1]}`} className="state-corr-item">
              <span>q{pair.pair[0]} ↔ q{pair.pair[1]}</span>
              <span>{pair.connectedZZ.toFixed(3)}</span>
            </div>
          ))}
        </div>

        {bellPair && chsh !== null && (
          <div className="state-bell-box">
            <div>Bell pair tested: q{bellPair[0]}, q{bellPair[1]}</div>
            <div>CHSH parameter: <strong>{chsh.toFixed(3)}</strong> (classical limit 2.0)</div>
            <div className="state-bar"><div style={{ width: `${Math.min(100, (chsh / 2.828) * 100)}%` }} /></div>
            <div>{chsh > 2 ? 'Violation detected' : 'No violation on current axis choice'}</div>
            <div>
              Concurrence: <strong>{concurrence === null ? 'n/a (>2 qubits)' : concurrence.toFixed(3)}</strong>
            </div>
          </div>
        )}
      </section>

      <section className="state-insights-card">
        <div className="state-insights-card-title">Measurement and Collapse</div>
        <div className="state-controls-row">
          <label>
            Measure qubits (0-based, max 2):
            <input
              value={measureSelection}
              onChange={(e) => setMeasureSelection(e.target.value)}
              placeholder="0,1"
            />
          </label>
          <button
            className="btn"
            onClick={() => {
              if (selectedMeasureQubits.length === 0) return;
              const sample = partialMeasure(state, numQubits, selectedMeasureQubits);
              setCollapsed({
                qubits: selectedMeasureQubits,
                outcome: sample.measuredOutcome,
                probability: sample.probability,
                collapsedState: sample.collapsedState,
              });
            }}
          >
            Sample Partial Collapse
          </button>
        </div>

        {measurementOutcomes.length > 0 && (
          <div className="state-outcome-list">
            {measurementOutcomes.map((outcome) => (
              <div key={outcome.outcome} className="state-outcome-item">
                <span>{outcome.outcome}</span>
                <span>{(outcome.probability * 100).toFixed(2)}%</span>
              </div>
            ))}
          </div>
        )}

        {collapsed && (
          <div className="state-collapsed-note">
            Collapsed to outcome <strong>{collapsed.outcome}</strong> with probability {(collapsed.probability * 100).toFixed(2)}%.
          </div>
        )}

        <div className="state-controls-row">
          <label>
            Custom basis qubit:
            <select value={basisQubit} onChange={(e) => setBasisQubit(Number(e.target.value))}>
              {Array.from({ length: numQubits }, (_, q) => (
                <option key={q} value={q}>q{q}</option>
              ))}
            </select>
          </label>
          <label>
            Axis:
            <select value={basisAxis} onChange={(e) => setBasisAxis(e.target.value as MeasurementAxis)}>
              <option value="X">X</option>
              <option value="Y">Y</option>
              <option value="Z">Z</option>
            </select>
          </label>
          <div>
            P(+): {(basisDist.plus * 100).toFixed(2)}% | P(-): {(basisDist.minus * 100).toFixed(2)}%
          </div>
        </div>

        {subsetStats.size > 0 && (
          <div className="state-outcome-list">
            {Array.from(subsetStats.entries()).map(([bits, p]) => (
              <div key={bits} className="state-outcome-item">
                <span>Shots {bits}</span>
                <span>{(p * 100).toFixed(2)}%</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="state-insights-card">
        <div className="state-insights-card-title">Density Matrix and Mixed-State Indicators</div>
        <div className="state-inline-metrics">
          <div>Pure-state purity: <strong>{density.purity.toFixed(4)}</strong></div>
          <div>Pure-state entropy: <strong>{density.entropy.toFixed(4)}</strong></div>
          <div>Dim: <strong>{density.dim}×{density.dim}</strong></div>
        </div>

        {noiseEnabled ? (
          <div className="state-inline-metrics">
            <div>Noisy purity proxy: <strong>{noisyPurityProxy?.toFixed(4) ?? 'n/a'}</strong></div>
            <div>Noisy entropy proxy: <strong>{noisyEntropyProxy?.toFixed(4) ?? 'n/a'}</strong></div>
            <div>
              Purity decay: <strong>
                {noisyPurityProxy === null ? 'n/a' : (density.purity - noisyPurityProxy).toFixed(4)}
              </strong>
            </div>
          </div>
        ) : (
          <p className="shots-empty-note">Enable noise and run shots to view mixed-state purity decay proxies.</p>
        )}
      </section>
      </div>
    </div>
  );
};

export default React.memo(QuantumStateInsightsPanel);
