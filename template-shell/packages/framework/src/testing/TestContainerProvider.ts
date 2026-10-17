/**
 * Test-only domain factory for the framework package tests.
 *
 * Thin wrapper that satisfies the `ExtensionDomainImplementationFactory`
 * contract used by `MfeRegistry.registerDomain`. The caller chooses the mount
 * strategy explicitly for each domain, by passing a function that builds one
 * (`ConcurrentMountStrategy`, `OptionalMountStrategy` or
 * `ExclusiveMountStrategy`: the registry admits only these three) from the
 * domain context and container hooks the provider supplies. Nothing is inferred
 * from the declaration. The provider registers a handler from the chosen
 * strategy for each lifecycle action the declaration lists: `mount_ext`
 * calls `strategy.mount`, `unmount_ext` calls `strategy.unmount`.
 *
 * Usage:
 *   const provider = new TestContainerProvider();
 *   registry.registerDomain(
 *     domain,
 *     provider.prepareForDomain(domain, (ctx, hooks) => new ConcurrentMountStrategy(ctx.mounter, hooks)),
 *   );
 *
 * The `prepareForDomain` call returns `this` so it can be inlined.
 */

import {
  ExtensionDomainImplementationFactory,
  ExtensionDomainImplementation,
  ActionHandler,
  type ContainerHooks,
  type DomainContext,
  type ExtensionDomain,
  type MountStrategy,
  type ActionPayload,
} from '@gears-frontx/mfes';

class TestDomainImpl extends ExtensionDomainImplementation {
  private readonly _strategies: MountStrategy[];
  constructor(strategies: MountStrategy[]) {
    super();
    this._strategies = strategies;
  }
  protected getMountStrategies(): MountStrategy[] {
    return this._strategies;
  }
}

/** Builds the mount strategy a test domain uses, from the context and container hooks the provider supplies. */
export type TestStrategyFactory = (ctx: DomainContext, hooks: ContainerHooks) => MountStrategy;

export class TestContainerProvider extends ExtensionDomainImplementationFactory {
  public readonly mockContainer: Element =
    typeof document !== 'undefined'
      ? document.createElement('div')
      : ({} as unknown as Element);

  private _pending: { declaration: ExtensionDomain; createStrategy: TestStrategyFactory } | null = null;

  constructor(_container?: Element) {
    super();
    if (_container) (this as { mockContainer: Element }).mockContainer = _container;
  }

  prepareForDomain(declaration: ExtensionDomain, createStrategy: TestStrategyFactory): this {
    this._pending = { declaration, createStrategy };
    return this;
  }

  build(ctx: DomainContext): TestDomainImpl {
    const pending = this._pending;
    this._pending = null;
    if (!pending) {
      throw new Error('TestContainerProvider.build called without prepareForDomain');
    }
    const actions = pending.declaration.actions ?? [];
    const container = this.mockContainer;
    const hooks: ContainerHooks = {
      create: () => container,
      destroy: () => undefined,
    };
    const strategy = pending.createStrategy(ctx, hooks);

    const mountExtActionId = ctx.typeSystem.resolveMountExtActionId();
    const unmountExtActionId = ctx.typeSystem.resolveUnmountExtActionId();
    const unmount = strategy.unmount?.bind(strategy);
    if (actions.includes(unmountExtActionId) && !unmount) {
      throw new Error(
        `TestContainerProvider: domain '${pending.declaration.id}' lists ${unmountExtActionId} but its mount strategy has no unmount`,
      );
    }
    if (actions.includes(mountExtActionId)) {
      ctx.registerHandler(
        mountExtActionId,
        ActionHandler.fromFunction((_t, p) => strategy.mount(p as ActionPayload))
      );
    }
    if (unmount && actions.includes(unmountExtActionId)) {
      ctx.registerHandler(
        unmountExtActionId,
        ActionHandler.fromFunction((_t, p) => unmount(p as ActionPayload))
      );
    }

    return new TestDomainImpl([strategy]);
  }
}
