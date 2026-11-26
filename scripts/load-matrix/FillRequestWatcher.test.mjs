import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { FillRequestWatcher } from './FillRequestWatcher.mjs';

const PREFIX = 'http://localhost:4173/shared/';

/** A page that emits the request events a browser page emits. */
function fakePage() {
  const emitter = new EventEmitter();
  return {
    on: (event, handler) => emitter.on(event, handler),
    emit: (event, request) => emitter.emit(event, request),
  };
}

function request(url, resourceType) {
  return { url: () => url, resourceType: () => resourceType };
}

describe('FillRequestWatcher', () => {
  it('is settled once the fetch-type requests to the shell units have all finished', async () => {
    const page = fakePage();
    const watcher = new FillRequestWatcher(page, PREFIX);
    const a = request(`${PREFIX}a.js`, 'fetch');
    const b = request(`${PREFIX}b.js`, 'fetch');
    page.emit('request', a);
    page.emit('request', b);
    let settled = false;
    const wait = watcher.settled(1000).then(() => {
      settled = true;
    });
    page.emit('requestfinished', a);
    await Promise.resolve();
    expect(settled).toBe(false);
    page.emit('requestfailed', b);
    await wait;
    expect(settled).toBe(true);
    expect(watcher.requestCount).toBe(2);
  });

  it('ignores script loads, other origins and non-unit URLs', async () => {
    const page = fakePage();
    const watcher = new FillRequestWatcher(page, PREFIX);
    page.emit('request', request(`${PREFIX}a.js`, 'script'));
    page.emit('request', request('http://localhost:3099/shared/a.js', 'fetch'));
    page.emit('request', request('http://localhost:4173/generated-mfe-manifests.json', 'fetch'));
    expect(watcher.requestCount).toBe(0);
    await expect(watcher.settled(50)).rejects.toThrow(/issued no request within 50ms/);
  });

  it('rejects when a fill request never finishes', async () => {
    const page = fakePage();
    const watcher = new FillRequestWatcher(page, PREFIX);
    page.emit('request', request(`${PREFIX}a.js`, 'fetch'));
    await expect(watcher.settled(50)).rejects.toThrow(/did not finish within 50ms/);
  });
});
