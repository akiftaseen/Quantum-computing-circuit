import React, { useMemo, useState } from 'react';
import type { CircuitState } from '../logic/circuitTypes';

interface SaveSlot {
  id: number;
  name: string;
  updatedAt: number;
  circuit: CircuitState;
}

interface Props {
  circuit: CircuitState;
  onLoadCircuit: (circuit: CircuitState) => void;
}

const STORAGE_KEY = 'quantum-tutor-save-slots-v1';
const SLOT_COUNT = 5;

const readSlots = (): SaveSlot[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SaveSlot[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeSlots = (slots: SaveSlot[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
};

const formatTime = (ts: number) => new Date(ts).toLocaleString();

const SaveSlotsPanel: React.FC<Props> = ({ circuit, onLoadCircuit }) => {
  const [slots, setSlots] = useState<SaveSlot[]>(() => readSlots());

  const slotMap = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);

  const saveToSlot = (id: number) => {
    const existing = slotMap.get(id);
    const name = window.prompt('Save slot name', existing?.name ?? `Slot ${id + 1}`)?.trim();
    if (!name) return;

    const next = slots.filter((s) => s.id !== id).concat({
      id,
      name,
      updatedAt: Date.now(),
      circuit,
    });

    next.sort((a, b) => a.id - b.id);
    setSlots(next);
    writeSlots(next);
  };

  const deleteSlot = (id: number) => {
    const next = slots.filter((s) => s.id !== id);
    setSlots(next);
    writeSlots(next);
  };

  return (
    <div className="save-slots-panel">
      <h3 className="sidebar-heading">Save Slots</h3>
      <div className="save-slots-list">
        {Array.from({ length: SLOT_COUNT }, (_, id) => {
          const slot = slotMap.get(id);
          return (
            <div key={id} className="save-slot-card">
              <div className="save-slot-row">
                <strong className="save-slot-title">{slot?.name ?? `Slot ${id + 1}`}</strong>
                <button className="btn" onClick={() => saveToSlot(id)}>Save</button>
              </div>
              <div className="save-slot-meta">
                {slot ? `${slot.circuit.numQubits}q • ${slot.circuit.gates.length} gates • ${formatTime(slot.updatedAt)}` : 'Empty slot'}
              </div>
              <div className="save-slot-actions">
                <button className="btn" disabled={!slot} onClick={() => slot && onLoadCircuit(slot.circuit)}>Load</button>
                <button className="btn" disabled={!slot} onClick={() => deleteSlot(id)}>Delete</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(SaveSlotsPanel);
