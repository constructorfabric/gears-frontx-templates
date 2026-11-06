/**
 * Where the runners find the project and the frontx-design skill files.
 *
 * The design-guardrails template ships this package and the skill side by
 * side and a composed project keeps both paths, so the skill sits at the same
 * place relative to this file in the template and in an installed project.
 * The runners read the skill's rule files (the gate registry and the check
 * data) and its DESIGN.md parser from there: one copy of every rule.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SKILL_DIR = fileURLToPath(
  new URL('../../../../.frontx/ai/@gears-frontx/template-design-guardrails/skills/frontx-design/', import.meta.url),
);

/** A missing or unreadable skill file: the run cannot proceed (exit 2). */
export class ContractError extends Error {}

/** @param {string} name a path inside the skill, e.g. `rules/quality-gates.json` */
export function readSkillJson(name) {
  const file = path.join(SKILL_DIR, name);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new ContractError(
      `contract unavailable: cannot read ${file} (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

/** The skill's DESIGN.md parser (`readDesignMd`, `InputError`). */
export async function designMdParser() {
  const file = path.join(SKILL_DIR, 'scripts/check-design-md.mjs');
  if (!fs.existsSync(file)) throw new ContractError(`contract unavailable: ${file} is missing`);
  return import(pathToFileURL(file).href);
}

/**
 * Whether the module at `moduleUrl` is the process entry point, so a runner
 * imported by a test or another module runs no CLI. An argv[1] that names no
 * file (`node -e ... arg`) is not the entry point.
 *
 * @param {string} moduleUrl the module's import.meta.url
 */
export function isEntryPoint(moduleUrl) {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

/**
 * The project root: npm runs workspace scripts inside the package and sets
 * $INIT_CWD to the directory it was invoked from, the project root in the
 * documented `npm run ... --workspace=@gears-frontx/design-verify` calls.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [cwd]
 */
export function projectRoot(env = process.env, cwd = process.cwd()) {
  return env.INIT_CWD || cwd;
}
