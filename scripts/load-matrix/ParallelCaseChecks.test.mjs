import { describe, expect, it } from 'vitest';
import { ParallelCaseChecks } from './ParallelCaseChecks.mjs';

describe('ParallelCaseChecks — parallel startup case', () => {
  it('duplicateDownloads counts second fetches of the same shared file (must be 0)', () => {
    const requests = [
      { url: 'https://shell/shared/react@19.0.0/react.abc.js', bytes: 1000 },
      { url: 'https://shell/shared/react@19.0.0/react.abc.js', bytes: 1000 }, // duplicate
      { url: 'https://shell/shared/react-dom@19.0.0/react-dom.def.js', bytes: 2000 },
      { url: 'https://fixture/shared/react@19.0.0/react.abc.js', bytes: 1000 }, // different origin, same path — same shared file
    ];
    const r = ParallelCaseChecks.duplicateDownloads(requests);
    // Two duplicates of react.abc.js (one same-origin, one cross-origin) → 2 duplicates
    expect(r.duplicateCount).toBe(2);
    expect(r.pass).toBe(false);
    expect(r.paths).toContain('/shared/react@19.0.0/react.abc.js');
  });

  it('duplicateDownloads passes (must be 0) when each shared file is fetched once', () => {
    const requests = [
      { url: 'https://shell/shared/react@19.0.0/react.abc.js', bytes: 1000 },
      { url: 'https://shell/shared/react-dom@19.0.0/react-dom.def.js', bytes: 2000 },
      { url: 'https://fixture/shared/lucide@1.0.0/icon.xyz.js', bytes: 500 },
    ];
    const r = ParallelCaseChecks.duplicateDownloads(requests);
    expect(r.duplicateCount).toBe(0);
    expect(r.pass).toBe(true);
    expect(r.paths).toEqual([]);
  });

  it('mainThreadEvaluationMs sums the self-evaluation time of all script evaluations', () => {
    const entries = [
      { name: 'react.js', selfMs: 12.5 },
      { name: 'react-dom.js', selfMs: 30.0 },
      { name: 'style.css', selfMs: 0.1 },
    ];
    expect(ParallelCaseChecks.mainThreadEvaluationMs(entries)).toBeCloseTo(42.6);
  });

  it('oneOriginFailureRun returns the one-origin-failure protocol (one origin fails, others succeed)', () => {
    const r = ParallelCaseChecks.oneOriginFailureRun({
      origins: ['shell', 'fixture-3099', 'fixture-3001'],
      failingOrigin: 'fixture-3001',
      expectedOutcome: 'other origins succeed; the failing origin reports its failure',
    });
    expect(r.kind).toBe('one-origin-failure');
    expect(r.failingOrigin).toBe('fixture-3001');
    expect(r.succeedingOrigins).toEqual(['shell', 'fixture-3099']);
    expect(r.protocol).toMatch(/one origin fails; the others succeed/);
  });
});
