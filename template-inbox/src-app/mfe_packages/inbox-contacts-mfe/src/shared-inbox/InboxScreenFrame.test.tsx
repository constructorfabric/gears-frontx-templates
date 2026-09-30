import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createRootRoute, createRoute } from '@gears-frontx/routing-tanstack';
import { createMfeBridgeFixture } from '@frontx-test-utils/createMfeBridgeFixture';
import type { ScreenLayout } from '@inbox-shared/ui/screenLayout';
import { contactsCatalogues } from '../i18n/catalogues';

/*
 * The router renders its matched routes a commit after it mounts, so a route
 * component alone cannot show what the router saw first. The stand-in records
 * the layout every render of `EngineProvider` itself reads, and renders the
 * real one.
 */
const recorder = vi.hoisted(() => ({ renders: [] as ScreenLayout[], readLayout: (): ScreenLayout | undefined => undefined }));
const routerRenders = recorder.renders;
vi.mock('@gears-frontx/routing-tanstack', async (importOriginal) => {
  const original = await importOriginal<typeof import('@gears-frontx/routing-tanstack')>();
  function RecordingEngineProvider(props: Parameters<typeof original.EngineProvider>[0]) {
    const layout = recorder.readLayout();
    if (layout !== undefined) recorder.renders.push(layout);
    return original.EngineProvider(props);
  }
  return { ...original, EngineProvider: RecordingEngineProvider };
});

// The package's setup file already loaded the frame with the real router;
// a fresh module graph is what lets this file's stand-in reach it.
vi.resetModules();
const { InboxScreenFrame } = await import('@inbox-shared/lifecycle/InboxScreenFrame');
const { useScreenLayout } = await import('@inbox-shared/ui/screenLayout');
recorder.readLayout = useScreenLayout;

/** A route tree of one page that records the layout of every render whose effects ran. */
function recordingRouteTree() {
  const committed: ScreenLayout[] = [];
  function Page() {
    const layout = useScreenLayout();
    useEffect(() => {
      committed.push(layout);
    }, [layout]);
    return <output>{layout}</output>;
  }
  const rootRoute = createRootRoute();
  const pageRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Page });
  return { routeTree: rootRoute.addChildren([pageRoute]), committed };
}

const mountFrameAt = (widthPx: number) => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, widthPx, 600));
  window.history.replaceState(null, '', '/');
  const { bridge } = createMfeBridgeFixture({
    extDomainId: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1',
    extensionId: 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.inbox_contacts.screens.contacts.v1',
  });
  routerRenders.length = 0;
  const tree = recordingRouteTree();
  render(<InboxScreenFrame bridge={bridge} catalogues={contactsCatalogues} routeTree={tree.routeTree} />);
  return tree;
};

describe('InboxScreenFrame', () => {
  it('mounts the routes only in the layout the measured width picks, so a narrow screen runs no wide pane first', async () => {
    // 400px is 25rem: the single-pane layout.
    const { committed } = mountFrameAt(400);

    expect((await screen.findByRole('status')).textContent).toBe('single');
    expect(committed).toEqual(['single']);
    expect(routerRenders.length).toBeGreaterThan(0);
    expect(new Set(routerRenders)).toEqual(new Set(['single']));
  });

  it('mounts the routes in the wide layout when the frame is wide', async () => {
    const { committed } = mountFrameAt(1200);

    expect((await screen.findByRole('status')).textContent).toBe('wide');
    expect(committed).toEqual(['wide']);
    expect(new Set(routerRenders)).toEqual(new Set(['wide']));
  });
});
