/**
 * FrontX Application Component (no UIKit, no Studio)
 *
 * Layout + MfeScreenContainer only.
 * Used for projects created with --uikit none --no-studio.
 */

import { Layout } from '@/app/layout';
import { MfeScreenContainer } from '@/app/mfe/MfeScreenContainer';

function App() {
  return (
    // No UI kit is in the build, so the header's language control is the
    // plain native select rather than the kit's.
    <Layout languageControl="plain">
      <MfeScreenContainer />
    </Layout>
  );
}

export default App;
