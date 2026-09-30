import { describe, expect, it } from 'vitest';
import { INBOX_SCREENS } from '@inbox-shared/navigation/screens';

type Manifest = { extensions: { presentation?: { route?: string } }[] };

/**
 * Every landed inbox package's manifest, read as data by the test runner (a
 * glob, not an import: no package's code depends on another's). Vite writes
 * each key relative to this file, shortest form first (`../../mfe.json` for
 * this package's own), so the directory is read off the resolved URL.
 */
const manifests = import.meta.glob<Manifest>('../../../inbox-*-mfe/mfe.json', { eager: true, import: 'default' });

/** The screen route each landed package declares, by package directory. */
const declaredRoutes = (): Map<string, string> => {
  const routes = new Map<string, string>();
  for (const [file, manifest] of Object.entries(manifests)) {
    const segments = new URL(file, import.meta.url).pathname.split('/');
    const directory = segments[segments.length - 2] ?? file;
    for (const extension of manifest.extensions) {
      if (extension.presentation?.route) routes.set(directory, extension.presentation.route);
    }
  }
  return routes;
};

describe('INBOX_SCREENS', () => {
  it("names each landed package's screen by the route its manifest declares", () => {
    const routes = declaredRoutes();

    expect(routes.get('inbox-contacts-mfe')).toBe(`/${INBOX_SCREENS.contacts}`);
    const tokens = new Set<string>(Object.values(INBOX_SCREENS));
    for (const [directory, route] of routes) {
      expect(tokens.has(route.replace(/^\//, '')), `${directory} declares ${route}`).toBe(true);
      expect(route).toBe(`/${directory.replace(/^inbox-/, '').replace(/-mfe$/, '')}`);
    }
  });
});
