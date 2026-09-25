/**
 * widgets-fixture-b — leaf widget MFE lifecycle.
 *
 * Renders a labelled card inside the widgets domain slot. Mounts concurrently
 * alongside widgets-fixture-a's alpha/beta instances under the widgets domain's
 * `ConcurrentMountStrategy` (owned by demo-mfe's child FrontX app at runtime).
 */
import React from 'react';
import {
  createFrontX,
  effects,
  queryCacheShared,
  mock,
  ThemeAwareReactLifecycle,
  type ChildMfeBridge,
  type MfeMountContext,
} from '@gears-frontx/react';

const fixtureApp = createFrontX()
  .use(effects())
  .use(queryCacheShared())
  .use(mock())
  .build();

class WidgetsFixtureBLifecycle extends ThemeAwareReactLifecycle {
  constructor() {
    super(fixtureApp);
  }

  // One mount log line, at the same console.info level as widget-a's own
  // mount and ping logs — the live run and any manual trace through the
  // console tell the two fixtures' mounts apart the same way (H2, Q1).
  override mount(container: Element | ShadowRoot, bridge: ChildMfeBridge, mountContext?: MfeMountContext): void {
    console.info(`[widget-b ${bridge.extensionId}] mount`);
    super.mount(container, bridge, mountContext);
  }

  protected renderContent(_bridge: ChildMfeBridge): React.ReactNode {
    return (
      <div
        data-fixture-id="widgets-fixture-b"
        className="m-2 rounded-lg border-2 border-emerald-500 bg-emerald-50 p-4 text-emerald-900"
      >
        <strong>Widget B (fixture-b)</strong>
        <p className="mt-1 text-sm">
          Mounted concurrently in the widgets domain.
        </p>
      </div>
    );
  }
}

export default new WidgetsFixtureBLifecycle();
