import { describe, expect, it } from 'vitest';
import { classifyRequest, summarizeRequests } from './RequestClassifier.mjs';

/**
 * The harness must count only network requests (exclude
 * blob:/data:/cache-served unless reported separately) and show the
 * classification in the JSON.
 */
describe('RequestClassifier — network request reconciliation', () => {
  it('classifies blob: and data: URLs as not network (the browser synthesises them in-process)', () => {
    expect(classifyRequest('blob:https://localhost:4173/uuid', false)).toBe('blob');
    expect(classifyRequest('data:text/plain;base64,SGVsbG8=', false)).toBe('data');
  });

  it('classifies a fromCache request as cacheServed (did not cross the wire again)', () => {
    expect(classifyRequest('https://localhost:4173/shared/a.js', true)).toBe('cacheServed');
  });

  it('classifies an HTTP/HTTPS request that crossed the wire as network', () => {
    expect(classifyRequest('https://localhost:4173/shared/a.js', false)).toBe('network');
    expect(classifyRequest('http://localhost:4173/index.html', false)).toBe('network');
  });

  it('summarizeRequests reconciles a mixed capture into the four classes (network is the reconciled count)', () => {
    const requests = [
      { url: 'https://shell/shared/react.js', fromCache: false },
      { url: 'https://shell/shared/react-dom.js', fromCache: false },
      { url: 'blob:https://shell/uuid', fromCache: false },
      { url: 'data:text/plain,hi', fromCache: false },
      { url: 'https://shell/shared/lucide.js', fromCache: true },
      { url: 'https://shell/index.html', fromCache: false },
    ];
    const r = summarizeRequests(requests);
    expect(r.total).toBe(6); // raw event count
    expect(r.network).toBe(3); // reconciled (the old "209" equivalent)
    expect(r.blob).toBe(1);
    expect(r.data).toBe(1);
    expect(r.cacheServed).toBe(1);
    expect(r.byClass).toEqual({ network: 3, blob: 1, data: 1, cacheServed: 1 });
  });

  it('summarizeRequests on an empty list reports all zeros', () => {
    const r = summarizeRequests([]);
    expect(r.total).toBe(0);
    expect(r.network).toBe(0);
    expect(r.blob).toBe(0);
    expect(r.data).toBe(0);
    expect(r.cacheServed).toBe(0);
  });

  it('the reconciled network count excludes blob/data/cache-served — the raw event count is explained by classification', () => {
    // A capture that includes blob inline-module loads and cache-served
    // re-fires reconciles to its network-only count.
    /** @type {{url: string, fromCache: boolean}[]} */
    const requests = [];
    for (let i = 0; i < 209; i++) requests.push({ url: `https://shell/shared/n${i}.js`, fromCache: false });
    for (let i = 0; i < 200; i++) requests.push({ url: `blob:https://shell/uuid-${i}`, fromCache: false });
    for (let i = 0; i < 166; i++) requests.push({ url: `https://shell/shared/c${i}.js`, fromCache: true });
    const r = summarizeRequests(requests);
    expect(r.total).toBe(575);
    expect(r.network).toBe(209);
    expect(r.blob).toBe(200);
    expect(r.cacheServed).toBe(166);
  });
});
