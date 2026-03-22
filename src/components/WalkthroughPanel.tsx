import React, { useMemo } from 'react';
import type { CircuitState } from '../logic/circuitTypes';

interface Props {
  circuit: CircuitState;
  shotsResult: Map<string, number> | null;
  onRunShots: () => void;
  onLoadTemplate: (templateName: string) => void;
}

const hasSingleQubitGate = (circuit: CircuitState, gate: string, qubit: number): boolean =>
  circuit.gates.some((g) => g.gate === gate && g.targets.includes(qubit));

const hasCnot = (circuit: CircuitState, control: number, target: number): boolean =>
  circuit.gates.some((g) => g.gate === 'CNOT' && g.controls[0] === control && g.targets[0] === target);

const hasBellLikeHistogram = (hist: Map<string, number>): boolean => {
  const total = Array.from(hist.values()).reduce((a, b) => a + b, 0);
  if (total === 0) return false;
  const p00 = (hist.get('00') ?? 0) / total;
  const p11 = (hist.get('11') ?? 0) / total;
  const pOther = 1 - p00 - p11;
  return p00 > 0.35 && p11 > 0.35 && pOther < 0.25;
};

const WalkthroughPanel: React.FC<Props> = ({ circuit, shotsResult, onRunShots, onLoadTemplate }) => {
  const steps = useMemo(() => {
    const step1 = hasSingleQubitGate(circuit, 'H', 0);
    const step2 = hasCnot(circuit, 0, 1);
    const step3 = shotsResult ? hasBellLikeHistogram(shotsResult) : false;

    return [
      {
        title: 'Step 1: Place H on q0',
        detail: 'Use the H gate on the first qubit to create superposition.',
        done: step1,
      },
      {
        title: 'Step 2: Place CNOT (q0 -> q1)',
        detail: 'Set q0 as control and q1 as target to create entanglement.',
        done: step2,
      },
      {
        title: 'Step 3: Run shots and verify Bell signature',
        detail: 'Look for dominant |00> and |11> outcomes to confirm correlation.',
        done: step3,
      },
    ];
  }, [circuit, shotsResult]);

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="walkthrough-panel">
      <div className="walkthrough-header">
        <h4 className="walkthrough-title">Guided Lab: Bell Pair</h4>
        <span className="walkthrough-progress">{doneCount}/{steps.length} complete</span>
      </div>

      <p className="walkthrough-subtitle">
        Build and validate a Bell pair through focused, hands-on milestones.
      </p>

      <div className="walkthrough-steps">
        {steps.map((step) => (
          <div key={step.title} className={`walkthrough-step ${step.done ? 'done' : ''}`}>
            <div className="walkthrough-step-title">{step.title}</div>
            <div className="walkthrough-step-detail">{step.detail}</div>
            <div className="walkthrough-step-status">{step.done ? 'Complete' : 'In progress'}</div>
          </div>
        ))}
      </div>

      <div className="walkthrough-actions">
        <button className="btn" onClick={() => onLoadTemplate('Bell Pair')}>Open Bell Starter</button>
        <button className="btn btn-primary" onClick={onRunShots}>Sample Measurements</button>
      </div>
    </div>
  );
};

export default React.memo(WalkthroughPanel);
