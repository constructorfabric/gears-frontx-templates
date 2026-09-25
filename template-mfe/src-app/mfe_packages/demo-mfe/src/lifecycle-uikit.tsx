import React from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';
import { KitThemedLifecycle } from './shared/KitThemedLifecycle';
import { mfeApp } from './init';
import { UIKitElementsScreen } from './screens/uikit/UIKitElementsScreen';
import { routedScreen } from './shared/routedScreen';

class UIKitElementsLifecycle extends KitThemedLifecycle {
  constructor() {
    super(mfeApp);
  }

  protected renderContent(bridge: ChildMfeBridge): React.ReactNode {
    return routedScreen(<UIKitElementsScreen bridge={bridge} />, bridge);
  }
}

/**
 * Export a singleton instance of the lifecycle class.
 * Module Federation expects a default export; the handler calls
 * moduleFactory() which returns this module, then validates it
 * has mount/unmount methods.
 */
export default new UIKitElementsLifecycle();
