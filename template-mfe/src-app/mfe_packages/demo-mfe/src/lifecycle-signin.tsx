import React from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react/mfe';
import { KitThemedLifecycle } from './shared/KitThemedLifecycle';
// The sign-in runtime's own bootstrap, not `./init`: see init-signin.ts.
import { signInApp } from './init-signin';
import { SignInModal } from './screens/signin/SignInModal';

class SignInLifecycle extends KitThemedLifecycle {
  constructor() {
    super(signInApp);
  }

  protected renderContent(bridge: ChildMfeBridge): React.ReactNode {
    return <SignInModal bridge={bridge} auth={signInApp.auth} />;
  }
}

/**
 * Export a singleton instance of the lifecycle class.
 * Module Federation expects a default export; the handler calls
 * moduleFactory() which returns this module, then validates it
 * has mount/unmount methods.
 */
export default new SignInLifecycle();
