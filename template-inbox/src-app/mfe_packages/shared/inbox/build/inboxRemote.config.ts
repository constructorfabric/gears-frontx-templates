/**
 * The build and test configuration every inbox package shares; each
 * package's `vite.config.ts` and `vitest.config.ts` pass in what differs (the
 * federation name, the extra packages to dedupe) and the plugins they import
 * themselves.
 *
 * The plugins come in as arguments, and this file imports nothing: it sits
 * outside every package, so an import from here would resolve from this
 * folder upward and could reach another copy than the package's own.
 */

/*
 * Provided at runtime by the MFE handler's bare-specifier rewriting, the same
 * list as template-mfe's packages, so they stay external in the build.
 */
export const INBOX_EXTERNAL_DEPS = [
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

/*
 * Mandatory, not a tidy-up: the shared folder sits outside the package, so
 * without dedupe its imports resolve upward from its own directory and land
 * on whatever copy the application root hoisted - the shell's kit and icon
 * versions rather than the ones the package pins. Dedupe makes every
 * importer take the package's copy.
 */
const BASE_DEDUPE = ['@gears-frontx/ui-kit', 'lucide-react'];

type FederationOptions = {
  name: string;
  filename: string;
  exposes: Record<string, string>;
  shared: Record<string, never>;
  manifest: boolean;
};

export type InboxRemoteOptions<TPlugin> = {
  /** The Module Federation container name, unique per package. */
  federationName: string;
  /** Absolute path of `shared/inbox`, resolved by the calling config. */
  sharedDir: string;
  /** Packages besides the kit and the icons this package must take its own copy of. */
  dedupe?: readonly string[];
  plugins: {
    react: () => TPlugin;
    federation: (options: FederationOptions) => TPlugin | TPlugin[];
    frontxMfGts: () => TPlugin;
  };
};

const sharedResolve = (sharedDir: string, dedupe: readonly string[] = []) => ({
  alias: {
    // The inbox's cross-screen code, bundled into each package's build.
    '@inbox-shared': sharedDir,
  },
  dedupe: [...BASE_DEDUPE, ...dedupe],
});

/** A package's `vite.config.ts`, for `defineConfig`. */
export function inboxRemoteConfig<TPlugin>({ federationName, sharedDir, dedupe, plugins }: InboxRemoteOptions<TPlugin>) {
  return {
    resolve: sharedResolve(sharedDir, dedupe),
    plugins: [
      plugins.react(),
      plugins.federation({
        name: federationName,
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
      plugins.frontxMfGts(),
    ],
    build: {
      target: 'esnext',
      modulePreload: false,
      minify: true,
      cssCodeSplit: true,
      rollupOptions: {
        external: INBOX_EXTERNAL_DEPS,
      },
    },
  };
}

/** The inbox half of a package's `vitest.config.ts`, merged over the shell's `defineMfeProject`. */
export function inboxTestConfig({ sharedDir, dedupe }: { sharedDir: string; dedupe?: readonly string[] }) {
  return {
    resolve: sharedResolve(sharedDir, dedupe),
    test: {
      // The inbox's own browser surface and per-test resets, after the
      // shell's. `test-support/` rather than `__test-utils__/`: the shell's
      // lint reads an import of `../_*` from inside an MFE package as one
      // into a sibling package.
      setupFiles: ['./src/test-support/setup.ts'],
      /*
       * Without CSS processing a stylesheet import resolves to an empty
       * string, and the tests that read the kit's real theme.css (the token
       * re-anchoring, the lifecycle's shadow-root styles) would assert
       * against nothing.
       */
      css: true,
      server: {
        deps: {
          /*
           * The kit ships one CSS Module per component, imported from its
           * emitted chunks. Left external, those imports reach Node's ESM
           * loader, which cannot load `.css`; inlining hands them to Vite.
           */
          inline: ['@gears-frontx/ui-kit'],
        },
      },
    },
  };
}
