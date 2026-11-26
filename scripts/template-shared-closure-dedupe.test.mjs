/**
 * The shared-unit build fails when more than one version of a shared
 * package is reachable from the shared closure
 * (`closure_enforcement.version_check`). recharts pins `reselect` exactly
 * while @reduxjs/toolkit and @base-ui/utils take a caret range, so a plain
 * install nests a second copy under recharts and every MFE that ships a
 * chart (`_blank-mfe`, `demo-mfe`) — and the template-shell host — fails
 * that check. Both template roots dedupe it with one `overrides` entry on
 * the version every dependent accepts; this guards the lockfiles keep a
 * single copy that satisfies every declared range.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEDUPED = 'reselect';

/** Whether `version` satisfies an exact or caret range (the forms in play). */
function satisfies(version, range) {
  if (range === version) return true;
  const caret = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(range);
  if (caret === null) return false;
  const [maj, min, pat] = version.split('.').map(Number);
  const [rMaj, rMin, rPat] = caret.slice(1).map(Number);
  if (maj !== rMaj) return false;
  return min > rMin || (min === rMin && pat >= rPat);
}

describe.each(['template-shell', 'template-mfe'])('%s shared-closure dedupe', (root) => {
  const pkg = JSON.parse(readFileSync(join(REPO, root, 'package.json'), 'utf-8'));
  const lock = JSON.parse(readFileSync(join(REPO, root, 'package-lock.json'), 'utf-8'));

  it(`overrides ${DEDUPED} to one version`, () => {
    expect(pkg.overrides?.[DEDUPED]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it(`locks a single ${DEDUPED} copy, satisfying every dependent's range`, () => {
    const copies = Object.entries(lock.packages).filter(([key]) =>
      key.endsWith(`node_modules/${DEDUPED}`)
    );
    expect(copies.map(([key]) => key)).toEqual([`node_modules/${DEDUPED}`]);
    const version = copies[0][1].version;
    expect(version).toBe(pkg.overrides[DEDUPED]);
    const ranges = Object.entries(lock.packages)
      .map(([key, entry]) => [key, entry.dependencies?.[DEDUPED]])
      .filter(([, range]) => range !== undefined);
    expect(ranges.length).toBeGreaterThan(0);
    for (const [key, range] of ranges) {
      expect(satisfies(version, range), `${key} wants ${DEDUPED}@${range}`).toBe(true);
    }
  });
});
