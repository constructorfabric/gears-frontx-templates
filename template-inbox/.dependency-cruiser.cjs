/**
 * Dependency boundaries of template-inbox.
 *
 * The app is one Vite project laid out by layer: `src/app/` is the chrome
 * (entry, routing, rail, i18n, theme), `src/screens/<screen>/` holds one
 * vertical slice per screen, and `src/api/` and `src/shared/` are the layers
 * every screen builds on. The rules keep those slices separable, which is
 * what splitting a screen out into its own template or microfrontend relies
 * on: a screen never reaches into another screen, and the lower layers never
 * reach up into a screen or into the chrome.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: { path: '^src/' },
      to: { circular: true, viaOnly: { dependencyTypesNot: ['type-only', 'type-import'] } },
      comment: 'Circular dependencies couple modules that should be readable and movable on their own.',
    },
    {
      name: 'no-cross-screen-imports',
      severity: 'error',
      from: { path: '^src/screens/([^/]+)/' },
      to: { path: '^src/screens/[^/]+/', pathNot: '^src/screens/$1/' },
      comment: 'A screen must not import another screen. Move what both need into src/shared/ or src/api/.',
    },
    {
      name: 'lower-layers-no-screens-or-app',
      severity: 'error',
      from: { path: '^src/(api|shared|__test-utils__)/' },
      to: { path: '^src/(screens|app)/' },
      comment: 'src/api/, src/shared/ and the test utilities sit below the screens and the chrome and must not import them.',
    },
    {
      name: 'no-test-utils-in-app-code',
      severity: 'error',
      from: { path: '^src/', pathNot: ['\\.test\\.tsx?$', '^src/__test-utils__/'] },
      to: { path: '^src/__test-utils__/' },
      comment: 'The test utilities stand the API in for tests; code that ships must never import them.',
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|coverage)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    moduleSystems: ['es6'],
  },
};
