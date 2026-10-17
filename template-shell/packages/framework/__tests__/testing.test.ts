/**
 * Unit tests for the @gears-frontx/framework/testing subpath.
 *
 * Scope: pure-unit coverage for utilities that live at L2 and do not cross
 * package boundaries.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';
import { ConcurrentMountStrategy, ExclusiveMountStrategy } from '@gears-frontx/mfes';
import { TestContainerProvider } from '../src/testing/TestContainerProvider';

describe('TestContainerProvider (factory adapter)', () => {
  it('exposes a mockContainer Element when document is available', () => {
    const provider = new TestContainerProvider();
    expect(provider.mockContainer instanceof HTMLElement).toBe(true);
  });

  it('accepts an explicit container in the constructor', () => {
    const container = document.createElement('section');
    const provider = new TestContainerProvider(container);
    expect(provider.mockContainer).toBe(container);
  });

  it('prepareForDomain returns the factory instance for chaining', () => {
    const provider = new TestContainerProvider();
    const declaration = {
      id: 'gts.frontx.mfes.ext.domain.v1~test.app.domain.v1',
      sharedProperties: [],
      actions: [],
      extensionsActions: [],
      defaultActionTimeout: 5000,
      lifecycleStages: [],
      extensionsLifecycleStages: [],
    };
    expect(provider.prepareForDomain(declaration, (ctx, hooks) => new ConcurrentMountStrategy(ctx.mounter, hooks))).toBe(provider);
  });

  describe('build', () => {
    const MOUNT = 'mount_ext';
    const UNMOUNT = 'unmount_ext';
    const declare = (actions: string[]) => ({
      id: 'gts.frontx.mfes.ext.domain.v1~test.app.domain.v1',
      sharedProperties: [],
      actions,
      extensionsActions: [],
      defaultActionTimeout: 5000,
      lifecycleStages: [],
      extensionsLifecycleStages: [],
    });
    function context() {
      const handlers = new Map<string, { handleAction: (t: string, p: unknown) => unknown }>();
      const ctx = {
        mounter: {},
        typeSystem: { resolveMountExtActionId: () => MOUNT, resolveUnmountExtActionId: () => UNMOUNT },
        registerHandler: (actionTypeId: string, handler: { handleAction: (t: string, p: unknown) => unknown }) => {
          handlers.set(actionTypeId, handler);
        },
      };
      return { ctx: ctx as unknown as Parameters<TestContainerProvider['build']>[0], handlers };
    }
    function chosenStrategy() {
      const strategy = { mount: vi.fn().mockResolvedValue(undefined), unmount: vi.fn().mockResolvedValue(undefined) };
      return { strategy, create: vi.fn(() => strategy as unknown as never) };
    }

    it('registers handlers from the chosen strategy for exactly the declared mount and unmount actions', async () => {
      const { strategy, create } = chosenStrategy();
      const { ctx, handlers } = context();
      new TestContainerProvider().prepareForDomain(declare([MOUNT, UNMOUNT]), create).build(ctx);

      expect(create).toHaveBeenCalledTimes(1);
      expect([...handlers.keys()].sort()).toEqual([MOUNT, UNMOUNT]);
      await handlers.get(MOUNT)!.handleAction(MOUNT, { subject: 'a' });
      await handlers.get(UNMOUNT)!.handleAction(UNMOUNT, { subject: 'b' });
      expect(strategy.mount).toHaveBeenCalledWith({ subject: 'a' });
      expect(strategy.unmount).toHaveBeenCalledWith({ subject: 'b' });
    });

    it('registers no handler for a lifecycle action the declaration does not list', () => {
      const { create } = chosenStrategy();
      const { ctx, handlers } = context();
      new TestContainerProvider().prepareForDomain(declare([MOUNT]), create).build(ctx);

      expect([...handlers.keys()]).toEqual([MOUNT]);
    });

    it('hands the chosen factory the domain context and container hooks, and returns the strategy as the domain\'s only one', () => {
      const { strategy, create } = chosenStrategy();
      const { ctx } = context();
      const impl = new TestContainerProvider().prepareForDomain(declare([]), create).build(ctx);

      expect(create).toHaveBeenCalledWith(ctx, expect.objectContaining({ create: expect.any(Function), destroy: expect.any(Function) }));
      expect((impl as unknown as { getMountStrategies(): unknown[] }).getMountStrategies()).toEqual([strategy]);
    });

    it('rejects at build a declaration listing unmount_ext when the strategy has no unmount, naming unmount_ext', () => {
      const { ctx } = context();
      const provider = new TestContainerProvider().prepareForDomain(
        declare([MOUNT, UNMOUNT]),
        (c, hooks) => new ExclusiveMountStrategy(c.mounter, hooks),
      );

      expect(() => provider.build(ctx)).toThrow(/unmount_ext/);
    });

    it('throws when built without prepareForDomain, and after the prepared domain was built once', () => {
      const { create } = chosenStrategy();
      const { ctx } = context();
      const provider = new TestContainerProvider();
      expect(() => provider.build(ctx)).toThrow(/without prepareForDomain/);

      provider.prepareForDomain(declare([MOUNT]), create).build(ctx);
      expect(() => provider.build(ctx)).toThrow(/without prepareForDomain/);
    });
  });
});
