import React from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react/mfe';
import { KitThemedLifecycle } from './shared/KitThemedLifecycle';
import { mfeApp } from './init';
import { SettingsScreen } from './screens/settings/SettingsScreen';

class SettingsLifecycle extends KitThemedLifecycle {
  constructor() {
    super(mfeApp);
  }

  protected renderContent(bridge: ChildMfeBridge): React.ReactNode {
    return <SettingsScreen bridge={bridge} />;
  }
}

/**
 * Export a singleton instance of the lifecycle class.
 * Module Federation expects a default export; the handler calls
 * moduleFactory() which returns this module, then validates it
 * has mount/unmount methods.
 */
export default new SettingsLifecycle();
