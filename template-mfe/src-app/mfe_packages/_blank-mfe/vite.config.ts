import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { vitePluginMfeGts } from '@gears-frontx/vite-plugin-mfe-gts';

export default defineConfig({
  plugins: [
    react(),
    // vitePluginMfeGts owns Module Federation and the build settings:
    // the federation name comes from package.json, remoteEntry.js is
    // fixed, `shared` is always {} (MF 2.0's shared dep mechanism is
    // bypassed — shared deps are derived from this package's declared
    // dependencies and provided at runtime by the handler), and
    // mf-manifest.json is always emitted alongside remoteEntry.js so
    // MfeHandlerMF can discover expose chunk paths without regex-parsing
    // the bundle. The MFE declares only its exposes map (here, or via
    // `exposes` in mfe.json).
    vitePluginMfeGts({
      exposes: {
        './lifecycle': './src/lifecycle.tsx',
      },
    }),
  ],
});
