export interface SymbolBinding {
  name: string;
  value: string;
}

export const applySymbolBindings = (source: string, bindings: SymbolBinding[]): string => {
  let out = source;
  for (const binding of bindings) {
    const key = binding.name.trim();
    const value = binding.value.trim();
    if (!key || !value) continue;
    out = out.replace(new RegExp(`\\b${key}\\b`, 'g'), `(${value})`);
  }
  return out;
};

export const defaultSymbolBindings = (): SymbolBinding[] => [
  { name: 'theta', value: 'pi/2' },
  { name: 'phi', value: 'pi/4' },
];
