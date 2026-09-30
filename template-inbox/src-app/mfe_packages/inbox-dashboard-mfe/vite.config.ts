import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import { frontxMfGts } from '@gears-frontx/frontx-template-shell/build/mf-gts';

const here = path.dirname(fileURLToPath(import.meta.url));

/*
 * The shared-dependency list and the build options are demo-mfe's: these
 * names are provided at runtime by the MFE handler's bare-specifier
 * rewriting, so they stay external here.
 */
const sharedDeps = [
  'react',
  'react-dom',
  '@gears-frontx/react',
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
  resolve: {
    alias: {
      // The inbox's cross-screen code, bundled into this package's build.
      '@inbox-shared': path.resolve(here, '../shared/inbox'),
    },
    /*
     * Mandatory, not a tidy-up: `../shared/inbox` sits outside this package,
     * so without dedupe its imports resolve upward from its own directory and
     * land on whatever copy the application root hoisted - the shell's kit
     * and icon versions rather than the ones this package pins. Dedupe makes
     * every importer take this package's copy.
     */
    dedupe: ['@gears-frontx/ui-kit', 'lucide-react', 'recharts'],
  },
  plugins: [
    react(),
    federation({
      name: 'inboxDashboardMfe',
      filename: 'remoteEntry.js',
      exposes: {
        './lifecycle': './src/lifecycle.tsx',
      },
      // Empty shared config: MF 2.0's shared dep mechanism is bypassed and
      // the shared deps above are externalized instead.
      shared: {},
      // mf-manifest.json lets the MFE handler find the expose chunks.
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
