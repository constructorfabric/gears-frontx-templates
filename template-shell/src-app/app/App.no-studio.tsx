/**
 * FrontX Application Component (no Studio)
 *
 * Same as App.tsx but without StudioOverlay.
 * Used for projects created with --no-studio.
 */

import { Layout } from '@/app/layout';
import { MfeScreenContainer } from '@/app/mfe/MfeScreenContainer';
import { ScreenLoadFailed } from '@/app/mfe/ScreenLoadFailed';

function App() {
  return (
    <Layout>
      <MfeScreenContainer LoadFailed={ScreenLoadFailed} />
    </Layout>
  );
}

export default App;
