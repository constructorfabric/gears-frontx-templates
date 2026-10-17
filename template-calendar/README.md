# FrontX Calendar

The calendar feature template. It carries one npm package,
[`@gears-frontx/calendar-kit`](packages/calendar-kit/README.md): a React calendar
UI library built on `@gears-frontx/ui-kit`, with week, day, month and agenda
views, an availability grid, event creation, search results and sidebar widgets.

The host owns data, persistence and scheduling rules. The kit exposes a UI data
model and callbacks only.

## Self-contained

This template owns its root `package.json`, lockfile and toolchain, so it builds
and tests on its own, without `template-shell`. It is not composed onto the shell
the way `template-mfe` is.

```bash
cd template-calendar
npm ci
npm run build
npm run type-check
npm run arch:deps
npm run lint
npm run test:unit
npm run test:dist       # imports the built package entries
npm run test:consumer   # installs the packed tarball into a clean consumer
npm run demo
```

## Boundaries

- `packages/calendar-kit/src/` imports one ecosystem package, `@gears-frontx/ui-kit`,
  and only through `src/ui/primitives/`. ESLint (`eslint.config.js`) and
  dependency-cruiser (`.dependency-cruiser.cjs`) both enforce this.
- `packages/calendar-kit/src/core/` imports no React and no ecosystem package
  (dependency-cruiser), and no browser globals (`tsconfig.core.json` has no DOM lib).
