import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { vitePluginMfeGts } from '@gears-frontx/vite-plugin-mfe-gts';

export default defineConfig({
  plugins: [
    react(),
    // vitePluginMfeGts owns Module Federation and the build settings
    // (name from package.json, remoteEntry.js, shared {}, manifest,
    // target/modulePreload/minify/cssCodeSplit). The MFE declares only
    // its exposes.
    vitePluginMfeGts({
      exposes: {
        './lifecycle': './src/lifecycle.tsx',
      },
    }),
  ],
});
