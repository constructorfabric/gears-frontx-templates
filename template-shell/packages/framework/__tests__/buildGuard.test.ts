/**
 * One app per runtime: `build()` is guarded per loaded copy of the framework.
 * Each test loads its own module copy, which is how a test gets a fresh guard —
 * there is no reset to call.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrontXPlugin } from '../src/types';

let createFrontX: typeof import('../src/createFrontX').createFrontX;

beforeEach(async () => {
  vi.resetModules();
  ({ createFrontX } = await import('../src/createFrontX'));
});

describe('build guard', () => {
  it('rejects a second build in the same module copy', () => {
    createFrontX().build();

    expect(() => createFrontX().build()).toThrowError(/already been built/);
  });

  it('rejects a reentrant build and returns to idle when the outer build fails', () => {
    const reentrant: FrontXPlugin = {
      name: 'reentrant',
      onRegister() {
        createFrontX().build();
      },
    };

    expect(() => createFrontX().use(reentrant).build()).toThrowError(/another build is in progress/);
    expect(() => createFrontX().build()).not.toThrow();
  });

  it('allows a retry after a build failed before an app existed', () => {
    const failing: FrontXPlugin = {
      name: 'failing',
      onRegister() {
        throw new Error('register failed');
      },
    };

    expect(() => createFrontX().use(failing).build()).toThrowError('register failed');
    expect(() => createFrontX({ strictMode: true }).use({ name: 'x', dependencies: ['missing'] }).build())
      .toThrowError(/requires "missing"/);
    expect(() => createFrontX().build()).not.toThrow();
  });

  it('keeps the guard after destroy()', () => {
    const app = createFrontX().build();
    app.destroy();

    expect(() => createFrontX().build()).toThrowError(/already been built/);
  });

  it('lets a runtime build again after a build that failed before an app existed', () => {
    const coreKey: string = 'store';
    const conflicting: FrontXPlugin = {
      name: 'conflicting',
      provides: { app: { [coreKey]: 'not the store' } },
    };

    expect(() => createFrontX().use(conflicting).build())
      .toThrowError(/app extension "store" conflicts/);

    expect(() => createFrontX().build()).not.toThrow();
  });

  it('keeps the guard when onInit throws after the app exists', () => {
    const failingInit: FrontXPlugin = {
      name: 'failing-init',
      onInit() {
        throw new Error('init failed');
      },
    };

    expect(() => createFrontX().use(failingInit).build()).toThrowError('init failed');
    expect(() => createFrontX().build()).toThrowError(/already been built/);
  });
});
