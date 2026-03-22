import React, { useState } from 'react';
import { GATE_DESCRIPTIONS } from '../logic/gateDescriptions';
import type { GateName } from '../logic/circuitTypes';
import { gateDisplayName } from '../logic/circuitTypes';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const GateDescriptionsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [selectedGate, setSelectedGate] = useState<GateName | null>('H');

  if (!isOpen) return null;

  const gates = Object.keys(GATE_DESCRIPTIONS) as GateName[];
  const description = selectedGate && GATE_DESCRIPTIONS[selectedGate];

  return (
    <div className="gate-modal-overlay">
      <div className="gate-modal-card">
        <div className="gate-modal-header">
          <h2 className="gate-modal-title">Quantum Gate Reference</h2>
          <button
            onClick={onClose}
            className="gate-modal-close"
            aria-label="Close gate reference"
          >
            ✕
          </button>
        </div>

        <div className="gate-modal-grid">
          <div>
            <h4 className="gate-modal-section-title">Gates</h4>
            <div className="gate-modal-gate-list">
              {gates.map(gate => (
                <button
                  key={gate}
                  onClick={() => setSelectedGate(gate)}
                  className={`gate-modal-gate-btn ${selectedGate === gate ? 'active' : ''}`}
                >
                  {gateDisplayName[gate]} {gate !== gateDisplayName[gate] ? `(${gate})` : ''}
                </button>
              ))}
            </div>
          </div>

          <div>
            {description && (
              <div className="gate-modal-detail">
                <h4 className="gate-modal-detail-title">{description.name}</h4>
                <p className="gate-modal-detail-description">
                  {description.description}
                </p>
                {description.formula && (
                  <div className="gate-modal-formula">
                    {description.formula}
                  </div>
                )}
                {description.uses.length > 0 && (
                  <div>
                    <h5 className="gate-modal-uses-title">Common Uses:</h5>
                    <ul className="gate-modal-uses-list">
                      {description.uses.map((use, i) => (
                        <li key={i} className="gate-modal-uses-item">{use}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={onClose}
          className="gate-modal-footer-btn"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default React.memo(GateDescriptionsModal);
