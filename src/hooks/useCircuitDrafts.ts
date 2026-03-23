import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CircuitState, PlacedGate } from '../logic/circuitTypes';

export interface CircuitDraft {
  id: string;
  name: string;
  circuit: CircuitState;
}

interface DraftWorkspace {
  drafts: CircuitDraft[];
  activeDraftId: string;
  activeCircuit: CircuitState;
}

interface PersistedDraftWorkspace {
  version: 1;
  drafts: CircuitDraft[];
  activeDraftId: string;
}

interface UseCircuitDraftsOptions {
  initialDrafts: CircuitDraft[];
  initialActiveDraftId: string;
  activeCircuit: CircuitState;
  resetCircuit: (next: CircuitState) => void;
  clearTransient: () => void;
  announce: (message: string) => void;
}

const STORAGE_KEY = 'qcs.drafts.workspace.v1';

const createDraftId = () => `draft-${Math.random().toString(36).slice(2, 10)}`;

const cloneGate = (gate: PlacedGate): PlacedGate => ({
  ...gate,
  targets: [...gate.targets],
  controls: [...gate.controls],
  params: [...gate.params],
  condition: gate.condition,
});

const cloneCircuit = (circuit: CircuitState): CircuitState => ({
  ...circuit,
  gates: circuit.gates.map(cloneGate),
});

const defaultWorkspace = (fallbackCircuit: CircuitState): DraftWorkspace => {
  const first: CircuitDraft = { id: 'draft-initial', name: 'Circuit 1', circuit: cloneCircuit(fallbackCircuit) };
  return {
    drafts: [first],
    activeDraftId: first.id,
    activeCircuit: cloneCircuit(first.circuit),
  };
};

const sanitizeWorkspace = (candidate: unknown, fallbackCircuit: CircuitState): DraftWorkspace => {
  const fallback = defaultWorkspace(fallbackCircuit);
  if (!candidate || typeof candidate !== 'object') return fallback;

  const payload = candidate as Partial<PersistedDraftWorkspace>;
  if (!Array.isArray(payload.drafts) || typeof payload.activeDraftId !== 'string') return fallback;

  const drafts = payload.drafts
    .filter((draft): draft is CircuitDraft => {
      if (!draft || typeof draft !== 'object') return false;
      const maybe = draft as Partial<CircuitDraft>;
      if (typeof maybe.id !== 'string' || typeof maybe.name !== 'string') return false;
      if (!maybe.circuit || typeof maybe.circuit !== 'object') return false;
      if (typeof maybe.circuit.numQubits !== 'number' || typeof maybe.circuit.numColumns !== 'number') return false;
      if (!Array.isArray(maybe.circuit.gates)) return false;
      return true;
    })
    .map((draft) => ({
      id: draft.id,
      name: draft.name,
      circuit: cloneCircuit(draft.circuit),
    }));

  if (drafts.length === 0) return fallback;

  const activeDraft = drafts.find((d) => d.id === payload.activeDraftId) ?? drafts[0];
  return {
    drafts,
    activeDraftId: activeDraft.id,
    activeCircuit: cloneCircuit(activeDraft.circuit),
  };
};

export const loadDraftWorkspace = (fallbackCircuit: CircuitState): DraftWorkspace => {
  if (typeof window === 'undefined') return defaultWorkspace(fallbackCircuit);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultWorkspace(fallbackCircuit);
    return sanitizeWorkspace(JSON.parse(raw), fallbackCircuit);
  } catch {
    return defaultWorkspace(fallbackCircuit);
  }
};

export const useCircuitDrafts = ({
  initialDrafts,
  initialActiveDraftId,
  activeCircuit,
  resetCircuit,
  clearTransient,
  announce,
}: UseCircuitDraftsOptions) => {
  const [drafts, setDrafts] = useState<CircuitDraft[]>(() => initialDrafts.map((d) => ({ ...d, circuit: cloneCircuit(d.circuit) })));
  const [activeDraftId, setActiveDraftId] = useState(initialActiveDraftId);

  const syncedDrafts = useMemo(
    () => drafts.map((d) => (d.id === activeDraftId ? { ...d, circuit: cloneCircuit(activeCircuit) } : d)),
    [activeCircuit, activeDraftId, drafts],
  );

  const activeDraft = useMemo(
    () => syncedDrafts.find((d) => d.id === activeDraftId) ?? syncedDrafts[0] ?? null,
    [syncedDrafts, activeDraftId],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload: PersistedDraftWorkspace = {
      version: 1,
      drafts: syncedDrafts,
      activeDraftId,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [syncedDrafts, activeDraftId]);

  const switchDraft = useCallback((id: string) => {
    if (id === activeDraftId) return;
    const next = syncedDrafts.find((d) => d.id === id);
    if (!next) return;
    setActiveDraftId(id);
    resetCircuit(cloneCircuit(next.circuit));
    clearTransient();
    announce(`Switched to ${next.name}.`);
  }, [activeDraftId, announce, clearTransient, resetCircuit, syncedDrafts]);

  const createNewDraft = useCallback(() => {
    const nextName = `Circuit ${syncedDrafts.length + 1}`;
    const nextCircuit: CircuitState = {
      numQubits: activeCircuit.numQubits,
      numColumns: Math.max(10, activeCircuit.numColumns),
      gates: [],
    };
    const nextDraft: CircuitDraft = {
      id: createDraftId(),
      name: nextName,
      circuit: nextCircuit,
    };

    setDrafts([...syncedDrafts, nextDraft]);
    setActiveDraftId(nextDraft.id);
    resetCircuit(cloneCircuit(nextCircuit));
    clearTransient();
    announce(`${nextName} created.`);
  }, [activeCircuit.numColumns, activeCircuit.numQubits, announce, clearTransient, resetCircuit, syncedDrafts]);

  const duplicateActiveDraft = useCallback(() => {
    const current = activeDraft;
    if (!current) return;

    const nextDraft: CircuitDraft = {
      id: createDraftId(),
      name: `${current.name} Copy`,
      circuit: cloneCircuit(activeCircuit),
    };

    setDrafts([...syncedDrafts, nextDraft]);
    setActiveDraftId(nextDraft.id);
    resetCircuit(cloneCircuit(nextDraft.circuit));
    clearTransient();
    announce(`${nextDraft.name} created.`);
  }, [activeCircuit, activeDraft, announce, clearTransient, resetCircuit, syncedDrafts]);

  const renameActiveDraft = useCallback(() => {
    const current = activeDraft;
    if (!current) return;
    const nextName = window.prompt('Rename circuit', current.name)?.trim();
    if (!nextName) return;

    const renamed = syncedDrafts.map((d) => (d.id === current.id ? { ...d, name: nextName } : d));
    setDrafts(renamed);
    announce(`Renamed to ${nextName}.`);
  }, [activeDraft, announce, syncedDrafts]);

  const deleteActiveDraft = useCallback(() => {
    const current = activeDraft;
    if (!current) return;

    if (syncedDrafts.length <= 1) {
      const cleared = { ...activeCircuit, gates: [] };
      resetCircuit(cleared);
      clearTransient();
      announce('Circuit cleared.');
      return;
    }

    const idx = syncedDrafts.findIndex((d) => d.id === current.id);
    const fallback = syncedDrafts[idx > 0 ? idx - 1 : 1];
    const remaining = syncedDrafts.filter((d) => d.id !== current.id);

    setDrafts(remaining);
    setActiveDraftId(fallback.id);
    resetCircuit(cloneCircuit(fallback.circuit));
    clearTransient();
    announce(`${current.name} deleted.`);
  }, [activeCircuit, activeDraft, announce, clearTransient, resetCircuit, syncedDrafts]);

  return {
    drafts: syncedDrafts,
    activeDraft,
    activeDraftId,
    switchDraft,
    createNewDraft,
    duplicateActiveDraft,
    renameActiveDraft,
    deleteActiveDraft,
  };
};
