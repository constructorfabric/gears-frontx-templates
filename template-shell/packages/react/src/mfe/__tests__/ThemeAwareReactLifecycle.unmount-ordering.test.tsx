/**
 * `ThemeAwareReactLifecycle.unmount()` must not resolve before a nested
 * `ExtensionDomainSlot`'s own teardown (observer stop + `mounter.detach()`)
 * has actually finished — `Root.unmount()` itself is synchronous, but the
 * slot's own cleanup fire-and-forgets an async `detach()` that React cleanup
 * cannot await directly (see `ExtensionDomainSlot`'s and
 * `domainTeardownCollector`'s own doc comments).
 *
 * Ordering is proven through an explicit, caller-controlled gate on the
 * fake mounter's own `detach()` — never through a fixed number of
 * `Promise.resolve()` microtask flushes. The gate's continuation sets a
 * flag synchronously before `detach()`'s own returned promise settles;
 * reading that flag from inside a `.then()` chained off
 * `lifecycle.unmount()`'s OWN returned promise proves the causal ordering
 * (the flag can only be observed `true` there if `detach()` had already
 * finished by the time `unmount()` resolved) without any timing assumption.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import type { ActionsChain, ChildMfeBridge, Extension, ExtensionDomain, ExtensionDomainImplementationFactory, ExtensionMounter as ExtensionMounterType, FrontXApp, MfeRegistry, ParentMfeBridge, TypeSystemPlugin } from '@gears-frontx/framework';

// Each test loads a fresh module copy: a runtime builds one app.
let createFrontX: typeof import('@gears-frontx/framework')['createFrontX'];
let ExtensionMounter: typeof import('@gears-frontx/framework')['ExtensionMounter'];
let MfeRegistryBase: typeof import('@gears-frontx/framework')['MfeRegistry'];
let fixtures: ReturnType<typeof defineFixtures>;
let ThemeAwareReactLifecycle: typeof import('../ThemeAwareReactLifecycle')['ThemeAwareReactLifecycle'];
let ExtensionDomainSlot: typeof import('../components/ExtensionDomainSlot')['ExtensionDomainSlot'];
let registerDomainTeardown: typeof import('../domainTeardownCollector')['registerDomainTeardown'];

beforeEach(async () => {
  vi.resetModules();
  ({ createFrontX, ExtensionMounter, MfeRegistry: MfeRegistryBase } = await import('@gears-frontx/framework'));
  ({ ThemeAwareReactLifecycle } = await import('../ThemeAwareReactLifecycle'));
  ({ ExtensionDomainSlot } = await import('../components/ExtensionDomainSlot'));
  ({ registerDomainTeardown } = await import('../domainTeardownCollector'));
  fixtures = defineFixtures();
});

const fakeTypeSystem: TypeSystemPlugin = {
  name: 'fake',
  version: '0',
  register: () => {},
  registerSchema: () => {},
  getSchema: () => undefined,
  isTypeOf: () => false,
  validateInstance: () => ({ valid: true, errors: [] }),
  resolveLoadExtActionId: () => 'load_ext',
  resolveMountExtActionId: () => 'mount_ext',
  resolveUnmountExtActionId: () => 'unmount_ext',
  resolveLifecycleStageInitId: () => 'init',
  resolveLifecycleStageActivatedId: () => 'activated',
  resolveLifecycleStageDeactivatedId: () => 'deactivated',
  resolveLifecycleStageDestroyedId: () => 'destroyed',
} as unknown as TypeSystemPlugin;

const NESTED_DOMAIN_ID = 'nested-widgets-domain';

function defineFixtures() {
  class GatedMounter extends ExtensionMounter {
    readonly attachCalls: Element[] = [];
    detachCalls = 0;
    /** Set synchronously the instant `detach()`'s own gate-await resumes — strictly before `detach()`'s returned promise itself settles. */
    detachSettledBeforeResolution = false;
    private openGateFn: (() => void) | undefined;
    private readonly gate = new Promise<void>((resolve) => {
      this.openGateFn = resolve;
    });

    attach(root: Element): void {
      this.attachCalls.push(root);
    }

    async detach(): Promise<void> {
      this.detachCalls += 1;
      await this.gate;
      this.detachSettledBeforeResolution = true;
    }

    openGate(): void {
      this.openGateFn?.();
    }

    async mount(_extensionId: string, _container: Element): Promise<void> {}
    async unmount(_extensionId: string): Promise<void> {}
  }

  class FakeRegistry extends MfeRegistryBase {
    readonly typeSystem = fakeTypeSystem;
    constructor(private readonly mounter: ExtensionMounterType) {
      super();
    }
    getMounter(_domainId: string): ExtensionMounterType {
      return this.mounter;
    }
    registerDomain(_d: ExtensionDomain, _f: ExtensionDomainImplementationFactory): void {}
    async unregisterDomain(_id: string): Promise<void> {}
    async registerExtension(_e: Extension): Promise<void> {}
    async unregisterExtension(_id: string): Promise<void> {}
    updateSharedProperty(_p: string, _v: unknown): void {}
    getDomainProperty(_d: string, _p: string): unknown {
      return undefined;
    }
    executeActionsChain(_c: ActionsChain): void {}
    getExtension(_id: string): Extension | undefined {
      return undefined;
    }
    getDomain(_id: string): ExtensionDomain | undefined {
      return undefined;
    }
    getExtensionsForDomain(_id: string): Extension[] {
      return [];
    }
    getMountedExtensions(_id: string): readonly string[] {
      return [];
    }
    getRegisteredPackages(): string[] {
      return [];
    }
    getExtensionsForPackage(_id: string): Extension[] {
      return [];
    }
    getParentBridge(_id: string): ParentMfeBridge | null {
      return null;
    }
    setTheme(_v: Record<string, string>): void {}
    dispose(): void {}
  }

  /** A host lifecycle whose rendered tree is exactly one nested `ExtensionDomainSlot` — standing in for `lifecycle-widgets-host.tsx` without any of its own bootstrap machinery. */
  class HostLifecycle extends ThemeAwareReactLifecycle {
    constructor(app: FrontXApp, private readonly registry: MfeRegistry) {
      super(app);
    }

    protected renderContent(_bridge: ChildMfeBridge): React.ReactNode {
      return <ExtensionDomainSlot registry={this.registry} domainId={NESTED_DOMAIN_ID} />;
    }
  }
  return { GatedMounter, FakeRegistry, HostLifecycle };
}

describe('ThemeAwareReactLifecycle.unmount — nested ExtensionDomainSlot teardown ordering', () => {
  it("does not resolve until the nested domain's own gated detach() has settled", async () => {
    const mounter = new fixtures.GatedMounter();
    const registry = new fixtures.FakeRegistry(mounter);
    const app = createFrontX().build();
    const lifecycle = new fixtures.HostLifecycle(app, registry);
    const container = document.createElement('div');
    document.body.appendChild(container);

    await act(async () => {
      lifecycle.mount(container, {} as ChildMfeBridge);
    });
    expect(mounter.attachCalls).toHaveLength(1);

    let unmountPromise!: Promise<void>;
    act(() => {
      // `unmount()`'s own synchronous prefix (`Root.unmount()`, which runs the
      // nested slot's cleanup synchronously) has already completed by the
      // time this synchronous `act()` callback returns — only the `await
      // Promise.all(...)` after it is still pending.
      unmountPromise = lifecycle.unmount(container);
    });
    expect(mounter.detachCalls).toBe(1);

    // Reads the flag from INSIDE a `.then()` chained off the real promise
    // under test — proves the causal ordering without timing a flush.
    const detachAlreadySettledWhenUnmountResolved = unmountPromise.then(
      () => mounter.detachSettledBeforeResolution,
    );

    mounter.openGate();

    expect(await detachAlreadySettledWhenUnmountResolved).toBe(true);
  });

  it('waits for every nested teardown to settle, then rejects with the first failure', async () => {
    const failure = new Error('first teardown failed');
    let openSlowGate!: () => void;
    const slowGate = new Promise<void>((resolve) => {
      openSlowGate = resolve;
    });
    let slowFinished = false;

    function TeardownRegistrar(): null {
      React.useEffect(
        () => () => {
          registerDomainTeardown(Promise.reject(failure));
          registerDomainTeardown(
            slowGate.then(() => {
              slowFinished = true;
            }),
          );
        },
        [],
      );
      return null;
    }

    class RegistrarLifecycle extends ThemeAwareReactLifecycle {
      protected renderContent(_bridge: ChildMfeBridge): React.ReactNode {
        return <TeardownRegistrar />;
      }
    }

    const lifecycle = new RegistrarLifecycle(createFrontX().build());
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      lifecycle.mount(container, {} as ChildMfeBridge);
    });

    let unmountPromise!: Promise<void>;
    act(() => {
      unmountPromise = lifecycle.unmount(container);
    });

    // Read from inside the continuation of the promise under test: the flag
    // can only be true there if the slow teardown had finished before unmount settled.
    const outcome = unmountPromise.then(
      () => ({ rejectedWith: undefined, slowFinished }),
      (error: unknown) => ({ rejectedWith: error, slowFinished }),
    );

    openSlowGate();

    expect(await outcome).toEqual({ rejectedWith: failure, slowFinished: true });
  });
});
