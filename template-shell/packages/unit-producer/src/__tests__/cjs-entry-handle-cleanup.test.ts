import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Scenario: CJS entry-surface enumeration must not pin the build
 * process. `RollupPackageBundler.cjsEntryNames` reads a CJS entry's
 * export surface statically with `cjs-module-lexer` — it never
 * executes the file. Before the static analysis, the producer
 * `require()`-loaded each CJS entry to enumerate its keys; a package
 * could allocate event-loop resources at module scope (the recorded
 * case: react-dom's server builds create a top-level
 * `new MessageChannel()` whose port stays ref'd) and leave them
 * behind the require, so a production `vite build` finished all work
 * and then idled forever on the leftover port. The fix removed the
 * `require()` entirely — no execution, no handles, no `unref` cleanup.
 *
 * The assertion is end-to-end: a child process runs the producer over
 * a package whose CJS entry allocates a MessageChannel at module
 * scope, and must exit by itself within a bounded time. The fixture
 * is the same shape that broke the build before the fix — the
 * static lexer never sees its `module.exports = { answer: 42 }` as
 * named exports (the grammar does not match `module.exports = { X:
 * <literal> }`), so the entry keeps its direct input and the
 * channel-allocating module is never executed at build time.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const tmpRoots: string[] = [];

function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'uphe-'));
  tmpRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tmpRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('CJS entry-surface enumeration handle cleanup', () => {
  it('a produce over a channel-allocating CJS entry exits in bounded time', () => {
    const root = tmpRoot();
    // Fixture package: its CJS entry creates a ref'd MessagePort at
    // module scope — the shape react-dom's server builds ship.
    const pkgDir = join(root, 'store', 'channel-pkg');
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({
        name: 'channel-pkg',
        version: '1.0.0',
        main: './index.cjs',
      })
    );
    writeFileSync(
      join(pkgDir, 'index.cjs'),
      `const { MessageChannel } = require('node:worker_threads');
       const channel = new MessageChannel();
       channel.port1.onmessage = () => {};
       module.exports = { answer: 42 };\n`
    );
    // App-visible layout: node_modules symlink next to the app root.
    const appDir = join(root, 'app');
    mkdirSync(join(appDir, 'node_modules'), { recursive: true });
    writeFileSync(
      join(appDir, 'package.json'),
      JSON.stringify({
        name: 'app',
        version: '1.0.0',
        dependencies: { 'channel-pkg': '1.0.0' },
      })
    );
    symlinkSync(pkgDir, join(appDir, 'node_modules', 'channel-pkg'), 'junction');

    // The child runs produce() over the fixture; if a handle survives,
    // the process idles past the kill window and the assertion fails.
    const producerDist = join(HERE, '..', '..', 'dist', 'index.js');
    expect(existsSync(producerDist)).toBe(true);
    const script = `
      const { UnitProducer } = require(${JSON.stringify(producerDist)});
      const producer = new UnitProducer({
        packageRoot: ${JSON.stringify(appDir)},
        outputDir: ${JSON.stringify(join(root, 'out'))},
        consumerSpecifiers: ['channel-pkg'],
      });
      producer.produce((m) => console.log(m)).then(
        () => console.log('PRODUCE-DONE'),
        (e) => { console.error(e); process.exit(2); }
      );
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
      timeout: 120_000,
      encoding: 'utf-8',
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PRODUCE-DONE');
    // The package was actually produced — the enumeration ran against
    // its channel-allocating entry, not skipped past it.
    expect(
      existsSync(join(root, 'out', 'channel-pkg@1.0.0'))
    ).toBe(true);
  }, 180_000);
});
