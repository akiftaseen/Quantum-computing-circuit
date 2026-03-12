import React from 'react';

interface Props { vector: [number, number, number]; label: string; }

const R = 55, CX = 70, CY = 70;
const project = (x: number, y: number, z: number): [number, number] => {
  const xp = CX + R * (0.707 * x - 0.707 * y);
  const yp = CY + R * (-0.85 * z + 0.35 * x + 0.35 * y);
  return [xp, yp];
};

const circlePath = (axis: 'xy' | 'xz' | 'yz', steps = 72): string => {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const co = Math.cos(a), si = Math.sin(a);
    if (axis === 'xy') pts.push(project(co, si, 0));
    else if (axis === 'xz') pts.push(project(co, 0, si));
    else pts.push(project(0, co, si));
  }
  return pts.map(([x, y], i) => (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1)).join(' ');
};

const BlochSphere: React.FC<Props> = ({ vector: [bx, by, bz], label }) => {
  const [px, py] = project(bx, by, bz);
  const [ox, oy] = project(0, 0, 0);
  const len = Math.sqrt(bx * bx + by * by + bz * bz);

  return (
    <div className="bloch-container">
      <div className="bloch-label">{label}</div>
      <svg width={140} height={140} viewBox="0 0 140 140">
        {/* Equator & meridians */}
        <path d={circlePath('xy')} fill="none" stroke="var(--border-color)" strokeWidth={0.7} opacity={0.5} />
        <path d={circlePath('xz')} fill="none" stroke="var(--border-color)" strokeWidth={0.5} opacity={0.3} strokeDasharray="3,3" />
        <path d={circlePath('yz')} fill="none" stroke="var(--border-color)" strokeWidth={0.5} opacity={0.3} strokeDasharray="3,3" />
        {/* Axes */}
        {[
          { p: project(1.15, 0, 0), l: 'x' },
          { p: project(0, 1.15, 0), l: 'y' },
          { p: project(0, 0, 1.2), l: '|0⟩' },
          { p: project(0, 0, -1.2), l: '|1⟩' },
        ].map(({ p: [ax, ay], l }, i) => (
          <React.Fragment key={i}>
            <line x1={ox} y1={oy} x2={project(...(i === 0 ? [1, 0, 0] : i === 1 ? [0, 1, 0] : i === 2 ? [0, 0, 1] : [0, 0, -1]) as [number, number, number])[0]}
              y2={project(...(i === 0 ? [1, 0, 0] : i === 1 ? [0, 1, 0] : i === 2 ? [0, 0, 1] : [0, 0, -1]) as [number, number, number])[1]}
              stroke="var(--text-secondary)" strokeWidth={0.8} opacity={0.6} />
            <text x={ax} y={ay} fontSize={9} fill="var(--text-secondary)" textAnchor="middle" dominantBaseline="middle">{l}</text>
          </React.Fragment>
        ))}
        {/* Bloch vector */}
        <line x1={ox} y1={oy} x2={px} y2={py} stroke="#ef4444" strokeWidth={2} />
        <circle cx={px} cy={py} r={4} fill="#ef4444" />
      </svg>
      <div className="bloch-info" style={{ fontSize: 10, textAlign: 'center', color: 'var(--text-secondary)' }}>
        |r| = {len.toFixed(2)}
      </div>
    </div>
  );
};
export default BlochSphere;