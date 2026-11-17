/**
 * FrontX Application Component (no UIKit, with Studio)
 *
 * Layout + MfeScreenContainer + StudioOverlay (development builds only).
 * Used for projects created with --uikit none and studio enabled.
 * Layout is project-provided (minimal or custom).
 *
 * The entry loads StudioOverlay with loadStudioOverlay() before the first
 * render and passes it in as a prop, so its restore of mock mode, theme and
 * language runs in the same commit as the app instead of after a lazy chunk.
 */

import type { ComponentType } from 'react';
import { Layout } from '@/app/layout';
import { MfeScreenContainer } from '@/app/mfe/MfeScreenContainer';

function App({ StudioOverlay }: { StudioOverlay?: ComponentType | null }) {
  return (
    <>
      <Layout>
        <MfeScreenContainer />
      </Layout>
      {StudioOverlay ? <StudioOverlay /> : null}
    </>
  );
}

export default App;
