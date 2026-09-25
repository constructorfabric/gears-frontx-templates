import { describe, expect, it, vi } from 'vitest';
import { composeDomainKey, createRouteSignal, type DomainKey, type ExtensionToken } from '@gears-frontx/routing';
import type { Extension, MfeRegistry } from '@gears-frontx/mfes';
import { DomainRouting, type DomainRoutingOptions } from '../domain-routing';
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

  it('never projects an extension without a single-segment route', () => {
    const { history, routing } = setup('/', [ext('ext.deep', '/a/b'), ext('ext.none')]);
    routing.afterMount('ext.deep');
    routing.afterMount('ext.none');
    expect(history.writes).toEqual([]);
    expect(routing.entryAddressFor('ext.deep')).toBeUndefined();
  });
});

describe('nested domain opening window (deferred opening write)', () => {
  it('collects the three auto-mounted widgets into one replace once the enclosing entry appears', () => {
    const { history, routing } = setup('/?screen=hello-world', [ALPHA, BETA, WIDGET], nested);
    routing.beginOpening();
    routing.afterMount('ext.alpha');
    routing.afterMount('ext.beta');
    routing.afterMount('ext.widget');
    routing.endOpening();
    expect(history.writes).toEqual([]); // enclosing entry not in the URL yet
    history.push('/?screen=widgets-host'); // the shell's own back-projection
    expect(history.writes).toEqual([
      { kind: 'push', path: '/?screen=widgets-host' },
      {
        kind: 'replace',
        path: '/?screen=widgets-host&screen.widgets-host.widgets=widget-alpha&screen.widgets-host.widgets=widget-beta&screen.widgets-host.widgets=widget',
      },
    ]);
    history.push('/?screen=widgets-host&x=1');
    expect(history.writes).toHaveLength(3); // subscription released after the one write
  });

  it('writes the missing widgets immediately with one replace when the enclosing entry is already there', () => {
    const { history, routing } = setup(
      '/?screen=widgets-host&screen.widgets-host.widgets=widget-alpha;route;last-ping=2026-09-23T10:15:30.000Z',
      [ALPHA, BETA, WIDGET],
      nested,
    );
    routing.beginOpening();
    for (const id of ['ext.alpha', 'ext.beta', 'ext.widget']) routing.afterMount(id);
    routing.endOpening();
    expect(history.writes).toEqual([
      {
        kind: 'replace',
        path: '/?screen=widgets-host&screen.widgets-host.widgets=widget-alpha;route;last-ping=2026-09-23T10:15:30.000Z&screen.widgets-host.widgets=widget-beta&screen.widgets-host.widgets=widget',
      },
    ]);
  });

  it('writes nothing at all when the URL already carries every widget (reload)', () => {
    const url =
      '/?screen=widgets-host&screen.widgets-host.widgets=widget-alpha&screen.widgets-host.widgets=widget-beta&screen.widgets-host.widgets=widget';
    const { history, routing } = setup(url, [ALPHA, BETA, WIDGET], nested);
    routing.beginOpening();
    for (const id of ['ext.alpha', 'ext.beta', 'ext.widget']) routing.afterMount(id);
    routing.endOpening();
    expect(history.writes).toEqual([]);
  });

  it('drops a pending opening write on stop', () => {
    const { history, routing } = setup('/?screen=hello-world', [ALPHA], nested);
    routing.beginOpening();
    routing.afterMount('ext.alpha');
    routing.endOpening();
    routing.stop();
    history.push('/?screen=widgets-host');
    expect(history.writes).toHaveLength(1);
  });

  it('after the window, adds a widget with one push', () => {
    const { history, routing } = setup('/?screen=widgets-host', [ALPHA], nested);
    routing.afterMount('ext.alpha');
    expect(history.writes).toEqual([{ kind: 'push', path: '/?screen=widgets-host&screen.widgets-host.widgets=widget-alpha' }]);
  });
});

describe('observation', () => {
  it('re-dispatches a resolved added entry through the actions chain, once (echo)', () => {
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

  it('stop releases the observer', () => {
    const { history, routing, executeActionsChain } = setup('/', [HELLO]);
    routing.start();
    routing.stop();
    history.set('/?screen=hello-world');
    expect(executeActionsChain).not.toHaveBeenCalled();
  });
});
