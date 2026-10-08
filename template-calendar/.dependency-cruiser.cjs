/**
 * FrontX Template Dependency Cruiser Configuration (template-calendar/, self-contained)
 *
 * The @gears-frontx/calendar-kit boundaries the package had in gears-frontx:
 * one ecosystem edge (@gears-frontx/ui-kit), taken only through
 * `src/ui/primitives/`, and a React-free `src/core/`. Browser globals in the
 * core are caught by `tsconfig.core.json` (no DOM lib), not here.
 *
 * An installed ecosystem package resolves under `node_modules/`; with
 * `node_modules` absent it stays a bare specifier. Each `to` covers both.
 */

const ecosystemTarget = (pattern) => [`(^|/)node_modules/@gears-frontx/${pattern}`, `^@gears-frontx/${pattern}`];

// Type-only edges are erased before emit; a cycle only counts when every edge
// survives to runtime. Mirrors template-shell's `no-circular`.
const TYPE_ONLY_DEPENDENCY_TYPES = ['type-only', 'type-import'];

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: { path: '^(?!.*node_modules)' },
      to: { circular: true, viaOnly: { dependencyTypesNot: TYPE_ONLY_DEPENDENCY_TYPES } },
      comment: 'Circular dependencies create tight coupling and make code harder to reason about.',
    },
    {
      name: 'calendar-kit-single-ecosystem-edge',
      severity: 'error',
      from: { path: '^packages/calendar-kit/src/' },
      to: { path: ecosystemTarget('(?!ui-kit(/|$))') },
      comment:
        '@gears-frontx/calendar-kit imports exactly one ecosystem package, the component substrate (@gears-frontx/ui-kit), and no other.',
    },
    {
      name: 'calendar-kit-react-free-core',
      severity: 'error',
      from: { path: '^packages/calendar-kit/src/core/', pathNot: '^packages/calendar-kit/src/core/tests/' },
      to: { pathNot: '^packages/calendar-kit/src/core/' },
      comment:
        'cpt-template-calendar-calendar-kit-nfr-react-free-core: src/core imports only src/core, so no React, ecosystem or other package can reach it.',
    },
    {
      name: 'calendar-kit-ui-kit-through-primitives',
      severity: 'error',
      from: { path: '^packages/calendar-kit/src/', pathNot: '^packages/calendar-kit/src/ui/primitives/' },
      to: { path: ecosystemTarget('ui-kit(/|$)') },
      comment: 'Only src/ui/primitives/ may import @gears-frontx/ui-kit; the rest of the kit goes through the primitives.',
    },
  ],
  options: {
    doNotFollow: {
      path: ['(^|/)node_modules/', '^packages/[^/]+/dist'],
    },
    exclude: {
      dynamic: true,
    },
    tsPreCompilationDeps: true,
  },
};
