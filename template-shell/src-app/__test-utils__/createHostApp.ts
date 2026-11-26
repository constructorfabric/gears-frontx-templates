import { createFrontX, presets, type FrontXApp } from '@gears-frontx/react';
import { MfeHandlerMF, microfrontends, type MfeRegistry } from '@gears-frontx/react/mfe';
import { FRONTX_MFE_ENTRY_MF } from '../../src/index';
import { gtsPlugin } from '@gears-frontx/gts-plugin';

interface HostApp {
  app: FrontXApp;
  registry: MfeRegistry;
}

let built: HostApp | undefined;

/**
 * A real host app: the themes and i18n plugins of the full preset and the
 * microfrontends plugin over the GTS type system, with its registry. A test
 * replaces what it needs to observe on this app and its registry by spying on
 * their members, so the test passes the app and registry types to the code
 * under test with no cast. A runtime builds exactly one app, so every call in
 * a test file returns the same one; restore the spies between cases.
 */
export function createHostApp(): HostApp {
  if (built !== undefined) return built;
  const app = createFrontX()
    .useAll(presets.full())
    .use(microfrontends({ typeSystem: gtsPlugin, mfeHandlers: [new MfeHandlerMF(FRONTX_MFE_ENTRY_MF)] }))
    .build();
  const registry = app.mfeRegistry;
  if (!registry) throw new Error('the microfrontends plugin built no registry');
  built = { app, registry };
  return built;
}
