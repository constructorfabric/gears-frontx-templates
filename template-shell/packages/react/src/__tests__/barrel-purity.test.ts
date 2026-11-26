/**
 * The package barrel is pure: `src/index.ts` only re-exports (and
 * declares types), so a consumer or the shared-unit producer can skip it
 * and load only the modules defining the bindings it uses — the package
 * declares `sideEffects: false`, and a barrel evaluating statements of
 * its own would be evaluated through. The public API is unchanged:
 * `eventBus` is still exported from the barrel, as the framework's bus.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { eventBus as frameworkEventBus } from '@gears-frontx/framework';
import { describe, expect, it } from 'vitest';

import { eventBus } from '../index';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** `source` with comments and string/template contents blanked. */
function stripTrivia(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '""');
}

describe('@gears-frontx/react barrel', () => {
  it('declares no runtime statements of its own', () => {
    const source = stripTrivia(
      fs.readFileSync(path.join(packageDir, 'src', 'index.ts'), 'utf-8')
    );
    const ownStatements = source
      .split('\n')
      .filter((line) => /^\s*(export\s+)?(const|let|var|function|class|enum)\b/.test(line));
    expect(ownStatements).toEqual([]);
  });

  it('declares side-effect freedom', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf-8')) as {
      sideEffects?: unknown;
    };
    expect(pkg.sideEffects).toBe(false);
  });

  it('still exports the framework event bus as eventBus', () => {
    expect(eventBus).toBe(frameworkEventBus);
  });
});
