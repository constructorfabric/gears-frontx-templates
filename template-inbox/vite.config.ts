import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * A plain single-page build. The app owns its whole document, so there is no
 * federation plugin, no shared-dependency externalisation and no remote entry:
 * `@gears-frontx/ui-kit` and `@gears-frontx/api` are ordinary dependencies that
 * Vite bundles like any other.
 *
 * `base` is read from `VITE_BASE`, the variable the ecosystem's own static
 * documentation build sets, so the built app can be served from a sub-path
 * (`VITE_BASE=/previews/inbox/ npm run build`). Unset, it is the origin root.
 * Routing lives in the URL fragment and every asset URL the code writes is
 * prefixed with `import.meta.env.BASE_URL`, so nothing else changes under a
 * sub-path.
 *
 * `dedupe` forces a single copy of React and React DOM into the bundle: kit
 * components are Base UI primitives that call hooks, and a primitive holding a
 * different React copy than the one rendering the tree reads a null dispatcher
 * and throws on its first `useRef`. A flat install has one copy anyway; this
 * keeps a nested copy from a hoisting accident out of the bundle.
 */
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
});
