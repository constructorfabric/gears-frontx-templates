import React from 'react';
import type { JsonObject } from '@gears-frontx/react';
import type { ChildMfeBridge } from '@gears-frontx/react/mfe';
import { ActionHandler } from '@gears-frontx/react/mfe';
import { gtsPlugin } from '@gears-frontx/gts-plugin';
import { KitThemedLifecycle } from './shared/KitThemedLifecycle';
import { mfeApp } from './init';
import { ProfileScreen } from './screens/profile/ProfileScreen';
import { fetchUser } from './actions/profileActions';
import { DEMO_ACTION_REFRESH_PROFILE } from './shared/extension-ids';
import mfeJson from '../mfe.json' with { type: 'json' };

class ProfileRefreshHandler extends ActionHandler {
  handleAction(
    _actionTypeId: string,
    _payload: JsonObject | undefined
  ): Promise<void> {
    fetchUser();
    return Promise.resolve();
  }
}

class ProfileLifecycle extends KitThemedLifecycle {
  constructor() {
    super(mfeApp);
  }

  protected renderContent(bridge: ChildMfeBridge): React.ReactNode {
    return <ProfileScreen bridge={bridge} />;
  }

  override mount(container: Element | ShadowRoot, bridge: ChildMfeBridge): void {
    // Let the base class render the React tree first so the screen is visible
    // before any action can arrive.
    super.mount(container, bridge);
    // Owners register their own solution schemas: the action's schema must
    // be on the type system before any refresh_profile action is dispatched.
    // Type-system plugin copies in one realm converge, so this registration
    // is visible where the action's target lives.
    for (const schema of mfeJson.schemas ?? []) {
      gtsPlugin.registerSchema(schema);
    }
    // Register after rendering so that any synchronous action dispatched in the
    // chained next step finds the handler already in place.
    bridge.registerActionHandler(DEMO_ACTION_REFRESH_PROFILE, new ProfileRefreshHandler());
  }
}

/**
 * Export a singleton instance of the lifecycle class.
 * Module Federation expects a default export; the handler calls
 * moduleFactory() which returns this module, then validates it
 * has mount/unmount methods.
 */
export default new ProfileLifecycle();
