import { defineConfig } from 'vite';
import { vitePluginMfeGts } from '@gears-frontx/vite-plugin-mfe-gts';

export default defineConfig({
  plugins: [
    // The MFE declares only its exposes; the plugin owns the federation and
    // build settings.
    vitePluginMfeGts({
      exposes: {
        './lifecycle': './src/lifecycle.js',
      },
    }),
  ],
});
