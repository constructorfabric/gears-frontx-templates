import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let createFrontX: typeof import('../src/createFrontX').createFrontX;
let layout: typeof import('../src/plugins/layout').layout;
let eventBus: typeof import('@gears-frontx/state').eventBus;
let resetStore: typeof import('@gears-frontx/state').resetStore;

beforeEach(async () => {
  vi.resetModules();
  ({ createFrontX } = await import('../src/createFrontX'));
  ({ layout } = await import('../src/plugins/layout'));
  ({ eventBus, resetStore } = await import('@gears-frontx/state'));
});

afterEach(() => {
  eventBus.clearAll();
  resetStore();
});

describe('layout plugin', () => {
  it('stops reacting to layout events once the app is destroyed', () => {
    const app = createFrontX().use(layout()).build();

    eventBus.emit('layout/menu/collapsed', { collapsed: true });
    const collapsedState = app.store.getState();
    expect(collapsedState).toHaveProperty('layout/menu.collapsed', true);

    app.destroy();
    eventBus.emit('layout/menu/collapsed', { collapsed: false });

    expect(app.store.getState()).toBe(collapsedState);
  });
});
