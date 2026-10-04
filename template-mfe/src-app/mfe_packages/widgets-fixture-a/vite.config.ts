// @cpt-dod:cpt-frontx-dod-mfe-isolation-mf-vite-plugin:p1
// @cpt-flow:cpt-frontx-flow-mfe-isolation-build-v2:p2
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import { frontxMfGts } from '@gears-frontx/frontx-template-shell/build/mf-gts';

const sharedDeps = [
  'react',
  'react-dom',
  '@gears-frontx/react',
  // Shared alongside @gears-frontx/react rather than left to inline: this
  // MFE imports routing-tanstack hooks (useSearch) directly, and
  // ExtensionRouter (@gears-frontx/react) builds the router those hooks
  // read from. Without a shared entry, esbuild/rollup each mint their own
  // copy of @tanstack/react-router, so the hook's context lookup misses
  // the router instance ExtensionRouter actually built.
  '@gears-frontx/routing-tanstack',
  '@gears-frontx/framework',
  '@gears-frontx/state',
  '@gears-frontx/mfes',
  '@gears-frontx/gts-plugin',
  '@gears-frontx/api',
  '@gears-frontx/i18n',
  '@tanstack/react-query',
  '@reduxjs/toolkit',
  'react-redux',
];

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'widgetsFixtureA',
      filename: 'remoteEntry.js',
      exposes: {
        './lifecycle': './src/lifecycle.tsx',
      },
      shared: {},
      manifest: true,
    }),
    frontxMfGts(),
  ],
  build: {
    target: 'esnext',
    modulePreload: false,
    minify: true,
    cssCodeSplit: true,
    rollupOptions: {
      external: sharedDeps,
    },
  },
});
