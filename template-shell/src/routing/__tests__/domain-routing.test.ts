import { describe, expect, it, vi } from 'vitest';
import { composeDomainKey, createRouteSignal, type DomainKey, type ExtensionToken } from '@gears-frontx/routing';
import type { Extension, MfeRegistry } from '@gears-frontx/mfes';
import { DomainRouting, dispatchChain, type DomainRoutingOptions } from '../domain-routing';
import { fakeNavigation } from './fake-navigation';

const MOUNT = 'act.mount';
const UNMOUNT = 'act.unmount';
const SCREEN = 'screen' as DomainKey;
const W = composeDomainKey(SCREEN, 'widgets-host' as ExtensionToken, 'widgets');
const ext = (id: string, route?: string): Extension => ({ id, domain: 'dom', entry: 'e', ...(route ? { route } : {}) }) as Extension;

function fakeRegistry(extensions: Extension[], mounted: string[] = []) {
  const executeActionsChain = vi.fn((_chain: unknown) => Promise.resolve());
  const registry = {
    getExtension: (id: string) => extensions.find((e) => e.id === id),
    getExtensionsForDomain: () => extensions,
    getMountedExtensions: () => mounted,
    executeActionsChain,
  } as unknown as MfeRegistry;
  return { registry, executeActionsChain, mounted };
}

function setup(initial: string, extensions: Extension[], over: Partial<DomainRoutingOptions> = {}, mounted: string[] = []) {
  const history = fakeNavigation(initial);
  const signal = createRouteSignal(history);
  const reg = fakeRegistry(extensions, mounted);
  const routing = new DomainRouting({
    history,
    signal,
    registry: reg.registry,
    domainId: 'dom',
    domainKey: SCREEN,
    mountActionType: MOUNT,
    cardinality: 'single',
    ...over,
  });
  return { history, signal, routing, ...reg };
}

const HELLO = ext('ext.hello', '/hello-world');
const HOST = ext('ext.host', '/widgets-host');
const ALPHA = ext('ext.alpha', '/widget-alpha');
const BETA = ext('ext.beta', '/widget-beta');
const WIDGET = ext('ext.widget', '/widget');
const nested = {
  domainKey: W,
  cardinality: 'multiple' as const,
  enclosing: { domainKey: SCREEN, extension: 'widgets-host' as ExtensionToken },
};

describe('single-occupant back-projection', () => {
  it('opens with one push', () => {
    const { history, routing } = setup('/', [HELLO]);
    routing.afterMount('ext.hello');
    expect(history.writes).toEqual([{ kind: 'push', path: '/?screen=hello-world' }]);
  });

  it('writes nothing when the URL already carries that state', () => {
    const { history, routing } = setup('/?screen=hello-world', [HELLO]);
    routing.afterMount('ext.hello');
    expect(history.writes).toEqual([]);
  });

  it('switches with one push, resets the old subtree, keeps other keys and foreign segments (foreign untouched)', () => {
    const { history, routing } = setup('/?screen=hello-world&screen.hello-world.tabs=a&sidebar=nav&utm_source=x', [HELLO, HOST]);
    routing.afterMount('ext.host');
    expect(history.writes).toHaveLength(1);
    expect(history.writes[0].kind).toBe('push');
    const search = new URL(history.writes[0].path, 'http://t').search;
    expect(search).toContain('screen=widgets-host');
    expect(search).not.toContain('screen.hello-world.tabs');
    expect(search).toContain('sidebar=nav');
    expect(search).toContain('utm_source=x');
  });

  it('closes with one replace, and writes nothing when the entry is already absent', () => {
    const a = setup('/?screen=hello-world', [HELLO], { unmountActionType: UNMOUNT });
    a.routing.afterUnmount('ext.hello');
    expect(a.history.writes).toEqual([{ kind: 'replace', path: '/' }]);
    const b = setup('/', [HELLO], { unmountActionType: UNMOUNT });
    b.routing.afterUnmount('ext.hello');
    expect(b.history.writes).toEqual([]);
  });

  it('ignores an afterUnmount call after stop, even when the URL still carries the token (C2, afterUnmount)', () => {
    const { history, routing } = setup('/?screen=hello-world', [HELLO], { unmountActionType: UNMOUNT });
    routing.stop();
    routing.afterUnmount('ext.hello');
    expect(history.writes).toEqual([]);
  });

  it('never projects an extension without a single-segment route', () => {
    const { history, routing } = setup('/', [ext('ext.deep', '/a/b'), ext('ext.none')]);
    routing.afterMount('ext.deep');
    routing.afterMount('ext.none');
    expect(history.writes).toEqual([]);
    expect(routing.entryAddressFor('ext.deep')).toBeUndefined();
  });

  it('returns this domain key and the extension token for a known extension (entryAddressFor, positive)', () => {
    const { routing } = setup('/', [HELLO]);
    expect(routing.entryAddressFor('ext.hello')).toEqual({ domainKey: SCREEN, extension: 'hello-world' });
  });

  it('cleans up a stray duplicate entry for a single-occupant domain (self-heal)', () => {
    // Two entries under the same single-cardinality domain key — never produced
    // by this class's own writes, only by a malformed or hand-built URL.
    const { history, routing } = setup('/?screen=hello-world&screen=widgets-host', [HELLO, HOST]);
    routing.afterMount('ext.hello');
    expect(history.writes).toEqual([{ kind: 'replace', path: '/?screen=hello-world' }]);
  });

  it('does not dispatch an unmount when a single-occupant domain switches directly to a new occupant', () => {
    const { history, routing, executeActionsChain } = setup('/?screen=hello-world', [HELLO, HOST], { unmountActionType: UNMOUNT }, ['ext.hello']);
    routing.start(); // the initial-report round, already echoing the mounted 'ext.hello'
    executeActionsChain.mockClear();
    history.set('/?screen=widgets-host');
    expect(executeActionsChain).toHaveBeenCalledTimes(1);
    expect(executeActionsChain).toHaveBeenCalledWith({ action: { type: MOUNT, target: 'dom', payload: { subject: 'ext.host' } } });
  });
});

describe('nested domain opening window (deferred opening write)', () => {
  it('collects the three auto-mounted widgets into one replace once the enclosing entry appears', async () => {
    const { history, routing } = setup('/?screen=hello-world', [ALPHA, BETA, WIDGET], nested);
    await routing.withOpening(() => {
      routing.afterMount('ext.alpha');
      routing.afterMount('ext.beta');
      routing.afterMount('ext.widget');
    });
    expect(history.writes).toEqual([]); // enclosing entry not in the URL yet
    history.push('/?screen=widgets-host'); // the shell's own back-projection
    expect(history.writes).toEqual([
      { kind: 'push', path: '/?screen=widgets-host' },
      {
        kind: 'replace',
        path: '/?screen=widgets-host&screen.widgets-host.widgets=widget-alpha&screen.widgets-host.widgets=widget-beta&screen.widgets-host.widgets=widget',
      },
    ]);
    expect(history.subscriberCount()).toBe(0); // the pending-write subscription released right after that one write (F1)
    history.push('/?screen=widgets-host&x=1');
    expect(history.writes).toHaveLength(3); // subscription released after the one write
  });

  it('writes the missing widgets immediately with one replace when the enclosing entry is already there', async () => {
    const { history, routing } = setup(
      '/?screen=widgets-host&screen.widgets-host.widgets=widget-alpha;route;last-ping=2026-09-23T10:15:30.000Z',
      [ALPHA, BETA, WIDGET],
      nested,
    );
    await routing.withOpening(() => {
      for (const id of ['ext.alpha', 'ext.beta', 'ext.widget']) routing.afterMount(id);
    });
    expect(history.writes).toEqual([
      {
        kind: 'replace',
        path: '/?screen=widgets-host&screen.widgets-host.widgets=widget-alpha;route;last-ping=2026-09-23T10:15:30.000Z&screen.widgets-host.widgets=widget-beta&screen.widgets-host.widgets=widget',
      },
    ]);
  });

  it('writes nothing at all when the URL already carries every widget (reload)', async () => {
    const url =
      '/?screen=widgets-host&screen.widgets-host.widgets=widget-alpha&screen.widgets-host.widgets=widget-beta&screen.widgets-host.widgets=widget';
    const { history, routing } = setup(url, [ALPHA, BETA, WIDGET], nested);
    await routing.withOpening(() => {
      for (const id of ['ext.alpha', 'ext.beta', 'ext.widget']) routing.afterMount(id);
    });
    expect(history.writes).toEqual([]);
  });

  it('drops a pending opening write on stop', async () => {
    const { history, routing } = setup('/?screen=hello-world', [ALPHA], nested);
    await routing.withOpening(() => {
      routing.afterMount('ext.alpha');
    });
    routing.stop();
    history.push('/?screen=widgets-host');
    expect(history.writes).toHaveLength(1);
    expect(history.subscriberCount()).toBe(0);
  });

  it('after the window, adds a widget with one push', () => {
    const { history, routing } = setup('/?screen=widgets-host', [ALPHA], nested);
    routing.afterMount('ext.alpha');
    expect(history.writes).toEqual([{ kind: 'push', path: '/?screen=widgets-host&screen.widgets-host.widgets=widget-alpha' }]);
  });

  it('does not bring back a widget unmounted during the opening window (C1)', async () => {
    const { history, routing } = setup('/?screen=hello-world', [ALPHA, BETA], nested);
    await routing.withOpening(() => {
      routing.afterMount('ext.alpha');
      routing.afterMount('ext.beta');
      routing.afterUnmount('ext.beta'); // unmounted again before the window closes
    });
    history.push('/?screen=widgets-host');
    expect(history.writes).toEqual([
      { kind: 'push', path: '/?screen=widgets-host' },
      { kind: 'replace', path: '/?screen=widgets-host&screen.widgets-host.widgets=widget-alpha' },
    ]);
  });

  it('drops a pending widget unmounted before the enclosing entry appears (C1, pendingOpen)', async () => {
    const { history, routing } = setup('/?screen=hello-world', [ALPHA], nested);
    await routing.withOpening(() => {
      routing.afterMount('ext.alpha');
    });
    routing.afterUnmount('ext.alpha'); // unmounted while still waiting for the enclosing entry
    history.push('/?screen=widgets-host');
    expect(history.writes).toEqual([{ kind: 'push', path: '/?screen=widgets-host' }]); // no replace at all
    expect(history.subscriberCount()).toBe(0); // the now-empty pending write dropped its subscription too
  });

  it('flushes collected writes and rethrows when fn throws inside the opening window (C3)', async () => {
    const { history, routing } = setup('/?screen=widgets-host', [ALPHA], nested);
    await expect(
      routing.withOpening(() => {
        routing.afterMount('ext.alpha');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(history.writes).toEqual([{ kind: 'replace', path: '/?screen=widgets-host&screen.widgets-host.widgets=widget-alpha' }]);
  });

  it('nests safely: an inner withOpening call shares the outer collection and only the outermost close flushes it, into one replace (N2)', async () => {
    const { history, routing } = setup('/?screen=widgets-host', [ALPHA, BETA], nested);
    await routing.withOpening(async () => {
      routing.afterMount('ext.alpha');
      await routing.withOpening(() => {
        routing.afterMount('ext.beta');
      });
      // The inner call already settled here — its own flush must not have
      // fired yet, and 'alpha' (collected by the still-open outer call)
      // must not have been dropped.
    });
    expect(history.writes).toEqual([
      {
        kind: 'replace',
        path: '/?screen=widgets-host&screen.widgets-host.widgets=widget-alpha&screen.widgets-host.widgets=widget-beta',
      },
    ]);
  });

  it('ignores a late afterMount/afterUnmount after stop, without opening a new subscription (C2)', () => {
    const { history, routing } = setup('/?screen=hello-world', [ALPHA], nested);
    routing.stop(); // stop already ran (e.g. Widgets Host itself unmounted)
    routing.afterMount('ext.alpha'); // an in-flight mount settling late
    expect(history.writes).toEqual([]);
    expect(history.subscriberCount()).toBe(0);
    history.push('/?screen=widgets-host'); // even once the enclosing entry lands, nothing fires
    expect(history.writes).toEqual([{ kind: 'push', path: '/?screen=widgets-host' }]);
    expect(history.subscriberCount()).toBe(0);
  });
});

describe('observation', () => {
  it("start() is idempotent: a second call does not create a second observer or double-dispatch", () => {
    const { routing, executeActionsChain } = setup('/?screen=hello-world', [HELLO]);
    routing.start();
    routing.start();
    expect(executeActionsChain).toHaveBeenCalledTimes(1);
    expect(executeActionsChain).toHaveBeenCalledWith({ action: { type: MOUNT, target: 'dom', payload: { subject: 'ext.hello' } } });
  });

  it('does not dispatch for an echo of its own back-projection', () => {
    const mounted: string[] = [];
    const { history, routing, executeActionsChain } = setup('/', [HELLO], {}, mounted);
    routing.start();
    mounted.push('ext.hello');
    routing.afterMount('ext.hello');
    expect(history.writes).toHaveLength(1);
    expect(executeActionsChain).not.toHaveBeenCalled();
  });

  it('reports an unresolved entry, dispatches nothing and leaves it in the URL (unresolved stays)', () => {
    const { history, routing, executeActionsChain } = setup('/?screen=nope', [HELLO]);
    routing.start();
    expect(routing.getStatus()).toEqual({ entries: 1, unresolved: 1 });
    expect(executeActionsChain).not.toHaveBeenCalled();
    expect(history.writes).toEqual([]);
  });

  it('dispatches an unmount for a removed entry only where the domain has an unmount action', () => {
    const withUnmount = setup('/?screen=hello-world', [HELLO], { unmountActionType: UNMOUNT }, ['ext.hello']);
    withUnmount.routing.start();
    withUnmount.history.set('/');
    expect(withUnmount.executeActionsChain).toHaveBeenCalledWith({ action: { type: UNMOUNT, target: 'dom', payload: { subject: 'ext.hello' } } });
    const exclusive = setup('/?screen=hello-world', [HELLO], {}, ['ext.hello']);
    exclusive.routing.start();
    exclusive.history.set('/');
    expect(exclusive.executeActionsChain).not.toHaveBeenCalled();
  });

  it('survives an executeActionsChain that returns nothing or throws synchronously (#648)', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = setup('/?screen=hello-world', [HELLO]);
    a.executeActionsChain.mockImplementation(() => undefined as unknown as Promise<void>);
    expect(() => a.routing.start()).not.toThrow();
    const b = setup('/?screen=hello-world', [HELLO]);
    b.executeActionsChain.mockImplementation(() => {
      throw new Error('refused');
    });
    expect(() => b.routing.start()).not.toThrow();
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it('re-dispatches a mount and unmounts the prior owner on a resolutionChanged swap under the same URL entry, for a multiple-cardinality domain (C7, N1)', () => {
    const extensions = [ext('ext.hello', '/hello-world')];
    const { history, routing, executeActionsChain } = setup(
      '/?screen=hello-world',
      extensions,
      { unmountActionType: UNMOUNT, cardinality: 'multiple' },
      ['ext.hello'],
    );
    routing.start();
    executeActionsChain.mockClear();
    extensions.length = 0;
    extensions.push(ext('ext.hello2', '/hello-world'));
    history.set('/?screen=hello-world'); // same URL entry, different registered owner
    expect(executeActionsChain).toHaveBeenCalledWith({ action: { type: UNMOUNT, target: 'dom', payload: { subject: 'ext.hello' } } });
    expect(executeActionsChain).toHaveBeenCalledWith({ action: { type: MOUNT, target: 'dom', payload: { subject: 'ext.hello2' } } });
  });

  it('re-dispatches a mount but does NOT unmount the prior owner on a resolutionChanged swap in a single-occupant domain (N1)', () => {
    // A 'single'-cardinality domain's own switch-to-new-occupant write already
    // retires the old occupant (`afterMount`'s `replaced` branch); dispatching
    // an unmount here too would double-unmount it — the prior-owner unmount is
    // therefore restricted to 'multiple'-cardinality domains only.
    const extensions = [ext('ext.hello', '/hello-world')];
    const { history, routing, executeActionsChain } = setup('/?screen=hello-world', extensions, { unmountActionType: UNMOUNT }, ['ext.hello']);
    routing.start();
    executeActionsChain.mockClear();
    extensions.length = 0;
    extensions.push(ext('ext.hello2', '/hello-world'));
    history.set('/?screen=hello-world'); // same URL entry, different registered owner
    expect(executeActionsChain).toHaveBeenCalledWith({ action: { type: MOUNT, target: 'dom', payload: { subject: 'ext.hello2' } } });
    expect(executeActionsChain).not.toHaveBeenCalledWith({ action: { type: UNMOUNT, target: 'dom', payload: { subject: 'ext.hello' } } });
  });

  it('dispatches no unmount while the enclosing entry is absent (the enclosing occupant is being removed)', () => {
    const { history, routing, executeActionsChain } = setup(
      '/?screen=widgets-host&screen.widgets-host.widgets=widget-alpha',
      [ALPHA],
      { ...nested, unmountActionType: UNMOUNT },
      ['ext.alpha'],
    );
    routing.start();
    history.set('/?screen=hello-world');
    expect(executeActionsChain).not.toHaveBeenCalled();
    history.set('/?screen=widgets-host&screen.widgets-host.widgets=widget-alpha');
    history.set('/?screen=widgets-host');
    expect(executeActionsChain).toHaveBeenCalledWith({ action: { type: UNMOUNT, target: 'dom', payload: { subject: 'ext.alpha' } } });
  });

  it('does not unmount a still-mounted extension when the same token is rediscovered as added under a new owner after a stop/start cycle (N3)', () => {
    const extensions = [ext('ext.hello', '/hello-world')];
    // `mounted` is fixed at ['ext.hello'] for the lifetime of this registry —
    // standing in for a prior owner that (for whatever reason) is still
    // mounted when routing restarts under a new registered owner.
    const { routing, executeActionsChain } = setup(
      '/?screen=hello-world',
      extensions,
      { unmountActionType: UNMOUNT, cardinality: 'multiple' },
      ['ext.hello'],
    );
    routing.start();
    routing.stop();
    executeActionsChain.mockClear();
    extensions.length = 0;
    extensions.push(ext('ext.hello2', '/hello-world'));
    routing.start(); // a fresh observer: the entry is rediscovered as `added`, not `resolutionChanged`
    expect(executeActionsChain).not.toHaveBeenCalledWith({ action: { type: UNMOUNT, target: 'dom', payload: { subject: 'ext.hello' } } });
  });

  it('stop releases the observer', () => {
    const { history, routing, executeActionsChain } = setup('/', [HELLO]);
    routing.start();
    routing.stop();
    expect(history.subscriberCount()).toBe(0);
    history.set('/?screen=hello-world');
    expect(executeActionsChain).not.toHaveBeenCalled();
  });
});

describe('status', () => {
  it('notifies status listeners on every transition and lets them unsubscribe', () => {
    const { history, routing } = setup('/?screen=hello-world', [HELLO]);
    const listener = vi.fn();
    const unsubscribe = routing.subscribeStatus(listener);
    routing.start();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    history.set('/?screen=nope');
    expect(listener).toHaveBeenCalledTimes(1); // not called again after unsubscribe
  });

  it('resets status to zero and notifies status listeners when stopped', () => {
    const { routing } = setup('/?screen=hello-world', [HELLO]);
    const listener = vi.fn();
    routing.subscribeStatus(listener);
    routing.start();
    listener.mockClear();
    routing.stop();
    expect(routing.getStatus()).toEqual({ entries: 0, unresolved: 0 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps two subscriptions of the identical listener independently releasable (C8)', () => {
    const { history, routing } = setup('/?screen=hello-world', [HELLO, HOST]);
    const listener = vi.fn();
    const unsubA = routing.subscribeStatus(listener);
    const unsubB = routing.subscribeStatus(listener);
    routing.start(); // initial transition — both registrations fire
    expect(listener).toHaveBeenCalledTimes(2);
    unsubA();
    listener.mockClear();
    history.set('/?screen=widgets-host'); // a genuine transition
    expect(listener).toHaveBeenCalledTimes(1); // only unsubB's registration remains
    unsubB();
    listener.mockClear();
    history.set('/?screen=hello-world');
    expect(listener).not.toHaveBeenCalled();
  });

  it('isolates a throwing status listener so the remaining listeners still get called (C4)', () => {
    const { routing } = setup('/?screen=hello-world', [HELLO]);
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    routing.subscribeStatus(bad);
    routing.subscribeStatus(good);
    routing.start();
    expect(good).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe('dispatchChain', () => {
  it('returns accepted:false without a settled promise when the registry refuses synchronously', () => {
    const { registry, executeActionsChain } = fakeRegistry([]);
    executeActionsChain.mockImplementation(() => {
      throw new Error('refused');
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = dispatchChain(registry, { action: { type: MOUNT, target: 'dom', payload: { subject: 'x' } } }, 'mount x');
    expect(result).toEqual({ accepted: false });
    errors.mockRestore();
  });

  it('returns accepted:true with a settled promise that resolves even when the chain promise rejects', async () => {
    const { registry, executeActionsChain } = fakeRegistry([]);
    executeActionsChain.mockImplementation(() => Promise.reject(new Error('failed')));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = dispatchChain(registry, { action: { type: MOUNT, target: 'dom', payload: { subject: 'x' } } }, 'mount x');
    expect(result.accepted).toBe(true);
    expect(result.settled).toBeInstanceOf(Promise);
    await expect(result.settled).resolves.toBeUndefined();
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it('returns accepted:true without a settled promise when the registry returns nothing (#648)', () => {
    const { registry, executeActionsChain } = fakeRegistry([]);
    executeActionsChain.mockImplementation(() => undefined as unknown as Promise<void>);
    const result = dispatchChain(registry, { action: { type: MOUNT, target: 'dom', payload: { subject: 'x' } } }, 'mount x');
    expect(result).toEqual({ accepted: true });
  });
});
