import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MfeFixtureDiscovery } from './MfeFixtureDiscovery.mjs';

/**
 * `TemplateScriptLocality` — template packages are copied into other projects,
 * so their `package.json` scripts must not reference files outside the
 * package. This guard reads `template-shell/package.json` and every
 * `template-mfe/src-app/mfe_packages/<fixture>/package.json` (fixtures
 * discovered by directory, no names hardcoded) and fails when any script
 * value contains `../` (a path leaving the package).
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

/**
 * Absolute paths to the package.json files this guard covers: template-shell
 * plus every discovered MFE fixture.
 *
 * @returns {string[]}
 */
function collectPackagePaths() {
  const shellPkg = path.join(repoRoot, 'template-shell', 'package.json');
  const fixtures = new MfeFixtureDiscovery({ root: repoRoot }).discover();
  return [shellPkg, ...fixtures.map((dir) => path.join(dir, 'package.json'))];
}

/**
 * @param {string} pkgPath
 * @returns {Record<string, string>}
 */
function readScripts(pkgPath) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  return pkg && typeof pkg.scripts === 'object' && pkg.scripts ? pkg.scripts : {};
}

describe('TemplateScriptLocality', () => {
  const pkgPaths = collectPackagePaths();

  it('covers template-shell and every discovered MFE fixture (>= 2 packages)', () => {
    expect(pkgPaths.length).toBeGreaterThanOrEqual(2);
  });

  it('no script value in template-shell or any MFE fixture contains "../"', () => {
    /** @type {{pkg: string, name: string, value: string}[]} */
    const offenders = [];
    for (const pkgPath of pkgPaths) {
      const scripts = readScripts(pkgPath);
      for (const [name, value] of Object.entries(scripts)) {
        if (typeof value === 'string' && value.includes('../')) {
          offenders.push({ pkg: path.relative(repoRoot, pkgPath), name, value });
        }
      }
    }
    expect(
      offenders,
      `leaving-package script values:\n${offenders.map((o) => `  ${o.pkg} ${o.name}=${o.value}`).join('\n')}`,
    ).toEqual([]);
  });
});
