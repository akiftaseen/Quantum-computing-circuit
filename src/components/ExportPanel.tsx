import React, { useState } from 'react';

interface Props {
  exportType: 'qiskit' | 'pennylane' | 'cirq' | 'latex';
  code: string | null;
  onExportQiskit: () => void;
  onExportPennyLane: () => void;
  onExportCirq: () => void;
  onExportLatex: () => void;
  onSaveJSON: () => void;
  onLoadJSON: () => void;
  onLoadQASM: () => void;
  onShare: () => void;
}

const titleMap: Record<Props['exportType'], string> = {
  qiskit: 'Qiskit',
  pennylane: 'PennyLane',
  cirq: 'Cirq',
  latex: 'LaTeX (quantikz)',
};

const ExportPanel: React.FC<Props> = ({
  exportType,
  code,
  onExportQiskit,
  onExportPennyLane,
  onExportCirq,
  onExportLatex,
  onSaveJSON,
  onLoadJSON,
  onLoadQASM,
  onShare,
}) => {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="export-panel">
      <div className="export-group">
        <div className="export-group-title">Code Exports</div>
        <div className="export-buttons">
          <button className={`btn ${exportType === 'qiskit' ? 'is-active' : ''}`} onClick={onExportQiskit} aria-pressed={exportType === 'qiskit'}>Qiskit</button>
          <button className={`btn ${exportType === 'pennylane' ? 'is-active' : ''}`} onClick={onExportPennyLane} aria-pressed={exportType === 'pennylane'}>PennyLane</button>
          <button className={`btn ${exportType === 'cirq' ? 'is-active' : ''}`} onClick={onExportCirq} aria-pressed={exportType === 'cirq'}>Cirq</button>
          <button className={`btn ${exportType === 'latex' ? 'is-active' : ''}`} onClick={onExportLatex} aria-pressed={exportType === 'latex'}>LaTeX</button>
        </div>
      </div>

      <div className="export-group">
        <div className="export-group-title">Circuit Files</div>
        <div className="export-buttons">
          <button className="btn" onClick={onSaveJSON}>Save JSON</button>
          <button className="btn" onClick={onLoadJSON}>Load JSON</button>
          <button className="btn" onClick={onLoadQASM}>Load QASM</button>
          <button className="btn" onClick={onShare}>Share URL</button>
        </div>
      </div>
      {code && (
        <div className="export-code">
          <div className="export-code-header">
            <h4>{titleMap[exportType]} Code</h4>
            <button className="btn" onClick={copyCode}>{copied ? 'Copied' : 'Copy Code'}</button>
          </div>
          <pre>{code}</pre>
        </div>
      )}
    </div>
  );
};

export default React.memo(ExportPanel);
