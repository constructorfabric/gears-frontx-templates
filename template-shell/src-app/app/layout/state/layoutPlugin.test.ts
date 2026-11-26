import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// One app per runtime: every test loads its own module copy.
let react: typeof import('@gears-frontx/react');
let layout: typeof import('./layoutPlugin').layout;

beforeEach(async () => {
  vi.resetModules();
  react = await import('@gears-frontx/react');
  ({ layout } = await import('./layoutPlugin'));
});

afterEach(() => {
  react.eventBus.clearAll();
});

describe('layout plugin', () => {
  it('is named layout', () => {
    expect(layout().name).toBe('layout');
  });

  it('contributes the layout actions to app.actions', () => {
    const app = react.createFrontX().use(layout()).build();

    for (const name of [
      'showPopup',
      'hidePopup',
      'showOverlay',
      'hideOverlay',
      'toggleMenuCollapsed',
      'toggleSidebarCollapsed',
      'setHeaderVisible',
      'setFooterVisible',
      'setMenuCollapsed',
      'setSidebarCollapsed',
    ] as const) {
      expect(typeof app.actions[name], name).toBe('function');
    }

    app.destroy();
  });

  it('stops reacting to layout events once the app is destroyed', () => {
    const app = react.createFrontX().use(layout()).build();

    react.eventBus.emit('layout/menu/collapsed', { collapsed: true });
    const collapsedState = app.store.getState();
    expect(collapsedState).toHaveProperty('layout/menu.collapsed', true);

    app.destroy();
    react.eventBus.emit('layout/menu/collapsed', { collapsed: false });

    expect(app.store.getState()).toBe(collapsedState);
  });
});
