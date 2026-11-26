import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { vitePluginMfeGts } from '@gears-frontx/vite-plugin-mfe-gts';

export default defineConfig({
  plugins: [
    react(),
    // vitePluginMfeGts owns Module Federation and the build settings:
    // the federation name comes from package.json, remoteEntry.js is
    // fixed, `shared` is always {} (MF 2.0 sharing is bypassed — shared
    // deps are derived from this package's declared dependencies and
    // provided at runtime by the handler), mf-manifest.json is always
    // emitted for expose chunk discovery, and target/modulePreload/
    // minify/cssCodeSplit are enforced. The MFE's own declarations are
    // just the exposes map below (or `exposes` in mfe.json).
    vitePluginMfeGts({
      exposes: {
        './lifecycle-helloworld': './src/lifecycle-helloworld.tsx',
        './lifecycle-profile': './src/lifecycle-profile.tsx',
        './lifecycle-theme': './src/lifecycle-theme.tsx',
        './lifecycle-uikit': './src/lifecycle-uikit.tsx',
        './lifecycle-widgets-host': './src/lifecycle-widgets-host.tsx',
        './lifecycle-settings': './src/lifecycle-settings.tsx',
        './lifecycle-signin': './src/lifecycle-signin.tsx',
      },
    }),
  ],
});
