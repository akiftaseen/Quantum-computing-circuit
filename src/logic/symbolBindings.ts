export interface SymbolBinding {
  name: string;
  value: string;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const IDENTIFIER_TOKEN_RE = /[A-Za-z_][A-Za-z0-9_]*/g;

export const applySymbolBindings = (source: string, bindings: SymbolBinding[]): string => {
  let out = source;
  const identifierBindings = new Map<string, string>();
  const literalBindings: Array<{ key: string; value: string }> = [];

  for (const binding of bindings) {
    const key = binding.name.trim();
    const value = binding.value.trim();
    if (!key || !value) continue;

    if (IDENTIFIER_RE.test(key)) {
      identifierBindings.set(key, value);
      continue;
    }

    literalBindings.push({ key, value });
  }

  if (identifierBindings.size > 0) {
    out = out.replace(IDENTIFIER_TOKEN_RE, (token) => {
      const replacement = identifierBindings.get(token);
      return replacement !== undefined ? `(${replacement})` : token;
    });
  }

  for (const binding of literalBindings.sort((a, b) => b.key.length - a.key.length)) {
    const escaped = escapeRegExp(binding.key);
    out = out.replace(new RegExp(escaped, 'g'), `(${binding.value})`);
  }

  return out;
};

export const defaultSymbolBindings = (): SymbolBinding[] => [
  { name: 'theta', value: 'pi/2' },
  { name: 'phi', value: 'pi/4' },
];
