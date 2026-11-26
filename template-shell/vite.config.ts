import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { vitePluginShell } from '@gears-frontx/vite-plugin-shell';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  // A relative base makes the build independent of where it is deployed: the
  // document and its assets resolve against the folder the shell is served
  // from, at the root of a domain or under any sub-path. The dev server keeps
  // `/`. Deploying `dist/` is described in README.md, "Deploying the build".
  base: './',
  plugins: [
    react(),
    // The host is hosted and loaded like a Module Federation host: the
    // plugin derives the shared set from this package's package.json
    // (the shared set over the build graph, no curated list), applies the bundler settings
    // sharing requires (resolve.dedupe for the whole set, dev
    // optimizeDeps for its CJS packages and their used subpaths),
    // externalizes the set, emits content-addressed units and fetch
    // lists into this build's own dist (under shared/), and generates
    // an inline import map so the emitted index.html boots the shell
    // natively — the browser fetches the shared chunks straight off
    // this dist. From the shell entry, a small fill chunk importing
    // @gears-frontx/mfes/unit-loader refills the realm content-identity
    // text cache from the boot list so MFE loads reuse those sources
    // and mint their own instances. Packages that are not runtime code
    // packages, uninstalled declarations) never join the shared set on
    // their own; `exclude` stays the escape hatch for JavaScript that is
    // not browser code:
    //  - `esbuild` is a non-optional peer for the library build — a Node
    //    build tool, never browser code; bundling it into a unit fails on
    //    its Node builtins.
    //  - `tailwindcss-animate` is a Tailwind plugin `tailwind.config.ts`
    //    loads at build time, and `tailwindcss` (which it imports) the
    //    Node CSS compiler — neither is browser code, and minting either
    //    fails on Node builtins. Excluded together: excluding a package a
    //    still-shared package imports is rejected.
    vitePluginShell({
      exclude: ['esbuild', 'tailwindcss-animate', 'tailwindcss'],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src-app'),
    },
  },
  build: {
    target: 'esnext',
    // Every built module lands here, one level below the shell folder;
    // `manifestsUrl` in src-app/app/mfe/bootstrap.ts reads the manifest
    // aggregate one level up from its own module for that reason.
    assetsDir: 'assets',
    // Increase chunk size warning limit or disable it
    chunkSizeWarningLimit: 500,
  },
});
