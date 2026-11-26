import { describe, expect, it } from 'vitest';
import { BootCheck, DEFAULT_SHELL_ORIGIN } from './BootCheck.mjs';

function makeServers({ ready = Promise.resolve(), close = async () => {} } = {}) {
  return async () => ({ ready, close });
}

/** Build a fake page loader that returns the given probe and tracks `close`. */
function makePageLoader(probe, closes = { count: 0 }) {
  const pageLoader = async (url) => {
    pageLoader.url = url;
    return {
      probe,
      close: async () => {
        closes.count++;
      },
    };
  };
  return { pageLoader, closes };
}

describe('BootCheck', () => {
  it('passes when #root has >= 1 child and no page error', async () => {
    const { pageLoader, closes } = makePageLoader({ rootChildCount: 3, pageErrors: [], consoleErrors: [] });
    const check = new BootCheck({ startServers: makeServers(), pageLoader });
    const r = await check.run();
    expect(r.ok).toBe(true);
    expect(r.rootChildCount).toBe(3);
    expect(r.pageErrors).toEqual([]);
    expect(closes.count).toBe(1);
  });

  it('fails when #root has 0 children', async () => {
    const { pageLoader, closes } = makePageLoader({ rootChildCount: 0, pageErrors: [], consoleErrors: [] });
    const check = new BootCheck({ startServers: makeServers(), pageLoader });
    const r = await check.run();
    expect(r.ok).toBe(false);
    expect(closes.count).toBe(1);
  });

  it('fails when a page error is reported', async () => {
    const { pageLoader, closes } = makePageLoader({ rootChildCount: 1, pageErrors: ['TypeError: x'], consoleErrors: [] });
    const check = new BootCheck({ startServers: makeServers(), pageLoader });
    const r = await check.run();
    expect(r.ok).toBe(false);
    expect(r.pageErrors).toEqual(['TypeError: x']);
    expect(closes.count).toBe(1);
  });

  it('records console errors but does not fail on them alone', async () => {
    const { pageLoader, closes } = makePageLoader({ rootChildCount: 2, pageErrors: [], consoleErrors: ['warn: x'] });
    const check = new BootCheck({ startServers: makeServers(), pageLoader });
    const r = await check.run();
    expect(r.ok).toBe(true);
    expect(r.consoleErrors).toEqual(['warn: x']);
    expect(closes.count).toBe(1);
  });

  it('passes the configured shell origin to the page loader', async () => {
    const { pageLoader } = makePageLoader({ rootChildCount: 1, pageErrors: [], consoleErrors: [] });
    const check = new BootCheck({ startServers: makeServers(), pageLoader, shellOrigin: 'http://example:4173/' });
    await check.run();
    expect(pageLoader.url).toBe('http://example:4173/');
  });

  it('uses the default shell origin when none is provided', async () => {
    const { pageLoader } = makePageLoader({ rootChildCount: 1, pageErrors: [], consoleErrors: [] });
    const check = new BootCheck({ startServers: makeServers(), pageLoader });
    await check.run();
    expect(pageLoader.url).toBe(DEFAULT_SHELL_ORIGIN);
  });

  it('closes the servers even on pageLoader failure', async () => {
    let closed = false;
    const startServers = async () => ({ ready: Promise.resolve(), close: async () => { closed = true; } });
    const pageLoader = async () => { throw new Error('boom'); };
    const check = new BootCheck({ startServers, pageLoader });
    await expect(check.run()).rejects.toThrow(/boom/);
    expect(closed).toBe(true);
  });

  it('releases the page loader resources (browser) even when the boot check fails after the loader returns', async () => {
    // The boot check returns ok=false (failing boot check) but the page loader
    // successfully returned a handle. BootCheck must still close the loader.
    let browserClosed = 0;
    let serverClosed = 0;
    const startServers = async () => ({
      ready: Promise.resolve(),
      close: async () => { serverClosed++; },
    });
    const pageLoader = async () => ({
      probe: { rootChildCount: 0, pageErrors: ['fail'], consoleErrors: [] },
      close: async () => { browserClosed++; },
    });
    const check = new BootCheck({ startServers, pageLoader });
    const r = await check.run();
    expect(r.ok).toBe(false);
    expect(browserClosed).toBe(1);
    expect(serverClosed).toBe(1);
  });

  it('releases the page loader resources even when servers.ready throws', async () => {
    let browserClosed = 0;
    let serverClosed = 0;
    const startServers = async () => ({
      ready: Promise.reject(new Error('ready failed')),
      close: async () => { serverClosed++; },
    });
    // The loader is never awaited (servers.ready throws first), but if it
    // had been, BootCheck would still close it. This test guards the case
    // where the loader returns and then a later step throws.
    const pageLoader = async () => ({
      probe: { rootChildCount: 1, pageErrors: [], consoleErrors: [] },
      close: async () => { browserClosed++; },
    });
    const check = new BootCheck({ startServers, pageLoader });
    await expect(check.run()).rejects.toThrow(/ready failed/);
    expect(serverClosed).toBe(1);
    // loader was never obtained, so its close was never called by BootCheck.
    expect(browserClosed).toBe(0);
  });

  it('releases both the page loader and the servers when the loader close itself throws', async () => {
    let serverClosed = 0;
    const startServers = async () => ({
      ready: Promise.resolve(),
      close: async () => { serverClosed++; },
    });
    const pageLoader = async () => ({
      probe: { rootChildCount: 1, pageErrors: [], consoleErrors: [] },
      close: async () => { throw new Error('cleanup boom'); },
    });
    const check = new BootCheck({ startServers, pageLoader });
    // A loader cleanup failure must not mask a successful probe.
    const r = await check.run();
    expect(r.ok).toBe(true);
    expect(serverClosed).toBe(1);
  });
});
