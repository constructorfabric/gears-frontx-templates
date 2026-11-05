#!/usr/bin/env node
/**
 * Checks the token NAMES in a DESIGN.md front matter against the custom
 * properties the installed `@gears-frontx/ui-kit` theme declares. Values are
 * never read: they live in the kit theme and the product theme.
 *
 *   node check-design-md.mjs [--design <path>] [--theme <path>]
 *
 * Defaults: `DESIGN.md` in the current directory, and the kit's exported
 * `@gears-frontx/ui-kit/theme.css` resolved from the current directory.
 * Exit 0 clean, 1 findings (one line each), 2 usage or input error.
 */
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseArgs } from 'node:util';

const USAGE = 'usage: node check-design-md.mjs [--design <path>] [--theme <path>]';
const KIT_THEME = '@gears-frontx/ui-kit/theme.css';
const META_KEYS = new Set(['name', 'version', 'description']);
// Prefixes of kit custom properties the front matter need not name. Empty:
// every property the kit 0.4.1 theme declares is public token surface (its
// header says a consumer brands the kit by overriding them), so coverage
// applies to all of them.
const IGNORE = [];
const VAR_ONLY = /^var\((--[\w-]+)\)$/;
const REF = /\{([^{}.]+)\.([^{}]+)\}/g;

class InputError extends Error {}

function readInput(file, what) {
  let stat;
  try {
    stat = statSync(file);
  } catch {
    throw new InputError(`${what} not found: ${file}`);
  }
  if (!stat.isFile()) throw new InputError(`${what} is not a file: ${file}`);
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    throw new InputError(`cannot read ${what} ${file}: ${error.code ?? error.message}`);
  }
}

function resolveTheme(cwd) {
  try {
    return createRequire(path.join(cwd, 'package.json')).resolve(KIT_THEME);
  } catch {
    throw new InputError(`cannot resolve ${KIT_THEME} from ${cwd}; pass --theme <path to the kit theme.css>`);
  }
}

/** Custom property names a stylesheet declares; values are skipped unread. */
function declaredNames(css) {
  // A comment becomes a space, so text on either side of it never joins into one name.
  const text = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  return new Set([...text.matchAll(/(?:^|[{;\s])(--[\w-]+)\s*:/g)].map((m) => m[1]));
}

/**
 * Parses the front matter subset DESIGN.md uses: maps nested at most two
 * levels below the top, two-space indent, keys plain or double-quoted, values
 * double-quoted strings or plain words and numbers. Anything else is an input
 * error rather than a guess.
 */
function parseFrontMatter(source) {
  const lines = source.split(/\r?\n/);
  if (lines[0] !== '---') throw new InputError('DESIGN.md has no front matter (its first line must be ---)');
  const end = lines.indexOf('---', 1);
  if (end === -1) throw new InputError('DESIGN.md front matter is not closed with ---');
  const stack = [{}]; // stack[d] is the open map at depth d
  let open = null; // the last key that had no value: its map starts on the next line
  for (let i = 1; i < end; i += 1) {
    const line = lines[i];
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const bad = (why) => new InputError(`DESIGN.md front matter line ${i + 1}: ${why}: ${line.trim()}`);
    const m = /^( *)("[^"\\]*"|[\w-]+):(?: ("[^"\\]*"|[\w.-]+))?$/.exec(line);
    const depth = m ? m[1].length / 2 : -1;
    if (!m || !Number.isInteger(depth)) throw bad('unsupported YAML');
    if (open) {
      if (depth !== open.depth + 1) throw bad(`"${open.key}" has no entries`);
      stack[depth] = open.map[open.key] = {};
    } else if (depth >= stack.length) {
      throw bad('unexpected indent');
    }
    stack.length = depth + 1;
    const map = stack[depth];
    const key = m[2].replace(/^"|"$/g, '');
    if (Object.hasOwn(map, key)) throw bad('duplicate key');
    if (m[3] === undefined) {
      if (depth === 2) throw bad('nested deeper than two levels');
      open = { map, key, depth };
    } else {
      map[key] = m[3].replace(/^"|"$/g, '');
      open = null;
    }
  }
  if (open) throw new InputError(`DESIGN.md front matter: "${open.key}" has no entries`);
  return stack[0];
}

/** One line per finding; empty when the names match. */
function check(front, themeNames) {
  const findings = [];
  const leaves = (value, at) =>
    typeof value === 'object'
      ? Object.entries(value).flatMap(([key, child]) => leaves(child, `${at}.${key}`))
      : [[at, value]];
  const tokenMaps = Object.fromEntries(
    Object.entries(front).filter(
      ([key, value]) => key !== 'components' && !META_KEYS.has(key) && typeof value === 'object',
    ),
  );

  const named = new Set();
  for (const [at, value] of leaves(tokenMaps, '').map(([at, v]) => [at.slice(1), v])) {
    const name = VAR_ONLY.exec(value)?.[1];
    if (!name) findings.push(`${at}: "${value}" is not exactly one var(--name)`);
    else if (!themeNames.has(name)) findings.push(`${at}: ${name} is not declared by the kit theme`);
    else named.add(name);
  }

  for (const [at, value] of leaves(front.components ?? {}, 'components')) {
    for (const [ref, group, key] of value.matchAll(REF)) {
      if (!tokenMaps[group] || !Object.hasOwn(tokenMaps[group], key)) {
        findings.push(`${at}: ${ref} names no front matter token`);
      }
    }
  }

  for (const name of themeNames) {
    if (!named.has(name) && !IGNORE.some((prefix) => name.startsWith(prefix))) {
      findings.push(`${name}: declared by the kit theme, not named in the front matter`);
    }
  }
  return findings;
}

function main(argv, cwd) {
  let values;
  try {
    ({ values } = parseArgs({ args: argv, options: { design: { type: 'string' }, theme: { type: 'string' } } }));
  } catch (error) {
    throw new InputError(`${error.message}\n${USAGE}`);
  }
  const designPath = path.resolve(cwd, values.design ?? 'DESIGN.md');
  const front = parseFrontMatter(readInput(designPath, 'DESIGN.md'));
  const themePath = values.theme ? path.resolve(cwd, values.theme) : resolveTheme(cwd);
  const findings = check(front, declaredNames(readInput(themePath, 'theme')));
  for (const line of findings) console.log(line);
  if (findings.length > 0) return 1;
  console.log(`${designPath}: every token name matches ${themePath}`);
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2), process.cwd());
} catch (error) {
  if (!(error instanceof InputError)) throw error;
  console.error(error.message);
  process.exitCode = 2;
}
