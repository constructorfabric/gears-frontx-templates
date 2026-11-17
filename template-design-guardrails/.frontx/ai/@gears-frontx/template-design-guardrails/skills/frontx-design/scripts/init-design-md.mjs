/**
 * Puts the template's DESIGN.md at the project root when the project has none.
 *
 *   node init-design-md.mjs [--design <path>]
 *
 * `DESIGN.md` belongs to the project: this template ships its canonical copy
 * inside the AI bundle (`templates/DESIGN.md`), which an upgrade replaces, and
 * the root file is written exactly once, from that copy, when it is absent.
 * An existing root file is never read, compared or touched - edit it, then
 * run `check-design-md.mjs`, which only reads. Exit 0 whether the file was
 * created or already there, 2 on a usage or input error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const USAGE = 'usage: node init-design-md.mjs [--design <path>]';
const CANONICAL = fileURLToPath(new URL('../templates/DESIGN.md', import.meta.url));

export function initDesignMd(argv, cwd) {
  let values;
  try {
    ({ values } = parseArgs({ args: argv, options: { design: { type: 'string' } }, strict: true }));
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
    return 2;
  }
  const designPath = path.resolve(cwd, values.design ?? 'DESIGN.md');
  if (fs.existsSync(designPath)) {
    console.log(`${designPath}: present, left as it is`);
    return 0;
  }
  try {
    fs.copyFileSync(CANONICAL, designPath, fs.constants.COPYFILE_EXCL);
  } catch (error) {
    // EEXIST: created between the check and the copy - still the project's file, still untouched.
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
      console.log(`${designPath}: present, left as it is`);
      return 0;
    }
    console.error(`cannot write ${designPath}: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  console.log(`${designPath}: created from the template's DESIGN.md`);
  return 0;
}

if (process.argv[1] !== undefined && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = initDesignMd(process.argv.slice(2), process.cwd());
}
