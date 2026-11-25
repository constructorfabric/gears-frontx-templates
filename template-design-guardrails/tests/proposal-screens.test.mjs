/**
 * The screens the survey lists from the app's mfe.json files:
 * - screens with the same presentation order come out in the code point
 *   order of their routes, like every other sort of the survey, so the
 *   order does not change with the machine's locale;
 * - the routes themselves are read as the app registers them.
 *
 * This file stands apart from proposal-security.test.mjs (untrusted input)
 * and proposal-look.test.mjs (the look the survey reads) because the screen
 * list is neither; the closest existing test of the screen order is
 * "finds the screens in menu order" in proposal-scripts.test.mjs, which this
 * file may not change.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { writeTopApp } from './proposal-fixture.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const survey = await import(pathToFileURL(path.join(here, '../.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design-proposal/scripts/survey-app.mjs')).href);

const temps = [];
const tempDir = () => { const dir = mkdtempSync(path.join(tmpdir(), 'fx-proposal-screens-')); temps.push(dir); return dir; };
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

const withRoutes = (root, edits) => {
  for (const [rel, route] of Object.entries(edits)) {
    const file = path.join(root, rel);
    const data = JSON.parse(readFileSync(file, 'utf8'));
    data.extensions = data.extensions.map((x) => ({ ...x, route, presentation: { ...x.presentation, order: 10 } }));
    writeFileSync(file, JSON.stringify(data, null, 2));
  }
  return root;
};

describe('the screen order', () => {
  it('orders screens with the same order by the code points of their routes, not by the locale', () => {
    const root = withRoutes(writeTopApp(tempDir()), {
      'src-app/mfe_packages/home-mfe/mfe.json': '/a',
      'src-app/mfe_packages/docs-mfe/mfe.json': '/B',
    });
    // Both extensions carry order 10, so the tie-break decides; localeCompare('/a', '/B') sorts 'a' before 'B',
    // code points sort 'B' (U+0042) before 'a' (U+0061).
    expect(survey.survey(root).screens.map((s) => s.route)).toEqual(['/B', '/a']);
  });
});
