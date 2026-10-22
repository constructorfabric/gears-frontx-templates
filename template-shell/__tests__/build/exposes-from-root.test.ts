// @vitest-environment node

/**
 * Real builds of a fixture MFE package (`fixtures/exposes-from-root`) run
 * from a working directory other than the package's own. Its `exposes` path
 * is relative, as in every MFE package, and `@module-federation/vite` asks
 * for it both with no importer and from its generated exposes module, a
 * virtual module with no directory. Vite resolves either from the process's
 * working directory, so without `frontxMfGts` resolving them from the package
 * root such a build fails, or builds a file of the same name it finds in the
 * working directory.
 *
 * The build runs `vite build <package>` in a child process, with NODE_ENV
 * unset and `MFE_VITE_NO_TEST_ENV_CHECK=true`, the federation plugin's
 * documented opt-out of turning itself off under a test runner.
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const fixtureDir = path.join(__dirname, 'fixtures', 'exposes-from-root');
const viteBin = path.join(__dirname, '..', '..', 'node_modules', 'vite', 'bin', 'vite.js');

/** The string the fixture's expose renders, from `src/greeting.js`. */
const FIXTURE_MARKER = 'fixture-greeting-from-package-root';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** One child build may take up to its 120 s limit; the global test timeout is shorter. */
const BUILD_TEST_TIMEOUT_MS = 150_000;

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** Builds the fixture with the process's working directory at `cwd`, and returns the output directory. */
function buildFixture(cwd: string): string {
  const outDir = tempDir('exposes-from-root-out-');
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.NODE_ENV;
  env.MFE_VITE_NO_TEST_ENV_CHECK = 'true';
  execFileSync(
    process.execPath,
    [viteBin, 'build', fixtureDir, '--outDir', outDir, '--logLevel', 'error'],
    { cwd, env, stdio: 'pipe', timeout: 120_000 }
  );
  return outDir;
}

/**
 * Every file a build wrote, by its path in the output directory, with its
 * content. Vite's own `.vite/manifest.json` is left out: it keys virtual
 * modules by a path relative to the working directory, and nothing reads it.
 */
function readOutput(outDir: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const entry of fs.readdirSync(outDir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.relative(outDir, path.join(entry.parentPath, entry.name));
    if (file === path.join('.vite', 'manifest.json')) continue;
    files.set(file, fs.readFileSync(path.join(outDir, file), 'utf8'));
  }
  return files;
}

describe('relative exposes, built from another working directory', () => {
  it(
    'builds the same output as a build in the package directory',
    () => {
      const own = readOutput(buildFixture(fixtureDir));
      const elsewhere = readOutput(buildFixture(tempDir('exposes-from-root-cwd-')));

      expect([...own.values()].some((code) => code.includes(FIXTURE_MARKER))).toBe(true);
      expect(elsewhere).toEqual(own);
    },
    BUILD_TEST_TIMEOUT_MS
  );

  it(
    'builds the expose from the package, not a file at the same path in the working directory',
    () => {
      const cwd = tempDir('exposes-from-root-cwd-');
      fs.mkdirSync(path.join(cwd, 'src'));
      fs.writeFileSync(
        path.join(cwd, 'src', 'lifecycle.js'),
        "export default { mount(container) { container.textContent = 'decoy-from-working-directory'; }, unmount() {} };\n"
      );

      const output = [...readOutput(buildFixture(cwd)).values()];

      expect(output.some((code) => code.includes(FIXTURE_MARKER))).toBe(true);
      expect(output.some((code) => code.includes('decoy-from-working-directory'))).toBe(false);
    },
    BUILD_TEST_TIMEOUT_MS
  );
});
