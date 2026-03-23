import { describe, expect, it } from 'vitest';
import { suggestStatePrepMacro } from './reverseEngineering';
import { parseHistogramText } from './noiseCalibration';
import { BENCHMARK_SUITES, runBenchmarkSuite } from './benchmarkSuites';
import { initZeroState } from './simulator';

describe('benchmark and calibration robustness', () => {
  it('runs built-in benchmark suites successfully on zero initial states', () => {
    const bell = runBenchmarkSuite(BENCHMARK_SUITES[0], 2, initZeroState(2));
    const ghz = runBenchmarkSuite(BENCHMARK_SUITES[1], 3, initZeroState(3));
    const plus = runBenchmarkSuite(BENCHMARK_SUITES[2], 3, initZeroState(3));

    expect(bell.passed).toBe(true);
    expect(ghz.passed).toBe(true);
    expect(plus.passed).toBe(true);
  });

  it('parses histogram text while ignoring malformed lines', () => {
    const parsed = parseHistogramText('00: 10\n11=5\nignored line\n010,7\nnotbits:9');
    expect(parsed.get('00')).toBe(10);
    expect(parsed.get('11')).toBe(5);
    expect(parsed.get('010')).toBe(7);
    expect(parsed.has('notbits')).toBe(false);
  });
});

describe('reverse-engineering suggestion robustness', () => {
  it('returns invalid result for malformed target expressions', () => {
    const suggestion = suggestStatePrepMacro('sqrt((', 1);
    expect(suggestion.valid).toBe(false);
    expect(suggestion.macro).toBe('');
  });

  it('detects Bell-like two-qubit targets and suggests entangling prep', () => {
    const suggestion = suggestStatePrepMacro('(1/sqrt(2))*|00⟩ + (1/sqrt(2))*|11⟩', 2);
    expect(suggestion.valid).toBe(true);
    expect(suggestion.macro).toContain('H(0)');
    expect(suggestion.macro).toContain('CNOT(0,1)');
  });

  it('maps basis-state qubits to X gates using LSB qubit indexing', () => {
    const suggestion = suggestStatePrepMacro('|01⟩', 2);
    expect(suggestion.valid).toBe(true);
    expect(suggestion.macro).toContain('X(0)');
    expect(suggestion.macro).not.toContain('X(1)');
  });
});