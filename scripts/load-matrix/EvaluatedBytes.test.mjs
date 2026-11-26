import { describe, expect, it } from 'vitest';
import { summarizeEvaluatedBytes } from './EvaluatedBytes.mjs';

/**
 * Evaluated bytes per load not measured. The harness must
 * measure via CDP (script parse size of executed scripts) per load
 * and record in the cell JSON.
 */
describe('summarizeEvaluatedBytes — measured evaluated bytes per load', () => {
  it('sums the script parse size of every parsed script', () => {
    const scripts = [
      { url: 'https://shell/shared/react.js', length: 1000 },
      { url: 'https://shell/shared/react-dom.js', length: 2000 },
      { url: 'https://shell/index.js', length: 500 },
    ];
    const r = summarizeEvaluatedBytes(scripts);
    expect(r.evaluatedBytes).toBe(3500);
    expect(r.evaluatedCount).toBe(3);
    expect(r.totalBytes).toBe(3500);
    expect(r.totalCount).toBe(3);
  });

  it('with originPrefix, excludes test harness and chrome-extension scripts so the metric reflects the page', () => {
    const scripts = [
      { url: 'https://localhost:4173/shared/react.js', length: 1000 },
      { url: 'https://localhost:4173/index.js', length: 500 },
      { url: 'chrome-extension://abc/content.js', length: 9999 },
      { url: 'devtools://devtools/inspector.js', length: 8888 },
    ];
    const r = summarizeEvaluatedBytes(scripts, { originPrefix: 'https://localhost:4173' });
    expect(r.evaluatedBytes).toBe(1500);
    expect(r.evaluatedCount).toBe(2);
    // totalBytes still reports every script the engine parsed.
    expect(r.totalBytes).toBe(1000 + 500 + 9999 + 8888);
    expect(r.totalCount).toBe(4);
  });

  it('treats a missing or non-finite length as 0 (does not inflate the metric)', () => {
    const scripts = [
      { url: 'https://localhost:4173/a.js', length: 100 },
      { url: 'https://localhost:4173/b.js' }, // missing length
      { url: 'https://localhost:4173/c.js', length: NaN },
      { url: 'https://localhost:4173/d.js', length: 200 },
    ];
    const r = summarizeEvaluatedBytes(scripts);
    expect(r.evaluatedBytes).toBe(300);
    expect(r.evaluatedCount).toBe(4);
    expect(r.totalBytes).toBe(300);
  });

  it('on an empty list reports all zeros', () => {
    const r = summarizeEvaluatedBytes([]);
    expect(r.evaluatedBytes).toBe(0);
    expect(r.evaluatedCount).toBe(0);
    expect(r.totalBytes).toBe(0);
    expect(r.totalCount).toBe(0);
  });

  it('records the metric per load so the cell JSON can report median evaluated bytes over runs', () => {
    // The spec calls this helper per run; the median over runs is what
    // the cell JSON reports. Here we just verify the per-run summary
    // shape the spec relies on.
    const scripts = [
      { url: 'https://localhost:4173/shared/react.js', length: 1234 },
      { url: 'https://localhost:4173/shared/lucide.js', length: 5678 },
    ];
    const r = summarizeEvaluatedBytes(scripts, { originPrefix: 'https://localhost:4173' });
    expect(r).toEqual({
      evaluatedBytes: 1234 + 5678,
      evaluatedCount: 2,
      totalBytes: 1234 + 5678,
      totalCount: 2,
    });
  });
});
