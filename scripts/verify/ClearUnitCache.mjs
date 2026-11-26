/**
 * `ClearUnitCache` — deletes every `node_modules/.cache/frontx-unit-producer`
 * directory below a given root, and nothing else.
 *
 * Producer build caches live at `<pkg>/node_modules/.cache/frontx-unit-producer/`.
 * A phase that must not measure against stale output clears them with this
 * class (caches are cleared manually, with no version bump). The scope is
 * deliberately narrow: sibling caches under the same `.cache/` directory
 * (vite, terser, …) and every other file survive, which a unit test with a
 * temp tree proves. The walk is structural — it recognizes the
 * `node_modules/.cache/frontx-unit-producer` triple by name, so it carries no
 * package names and works on any layout.
 *
 * Core logic is exported for unit tests; only the thin CLI wrapper in
 * `scripts/clear-unit-cache.mjs` touches the process.
 */
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

/** Directory name produced by the unit-producer build cache. */
export const CACHE_SEGMENT = 'frontx-unit-producer';
/** The two parent segments that must surround {@link CACHE_SEGMENT}. */
export const PARENT_SEGMENT = '.cache';
export const GRANDPARENT_SEGMENT = 'node_modules';

export class ClearUnitCache {
  /**
   * @param {{
   *   root: string;
   *   log?: (line: string) => void;
   *   readdirFn?: typeof readdir;
   *   rmFn?: typeof rm;
   * }} opts
   */
  constructor({ root, log = (line) => console.log(line), readdirFn = readdir, rmFn = rm } = {}) {
    if (!root) throw new Error('ClearUnitCache: root is required');
    this.root = root;
    this.log = log;
    this.readdirFn = readdirFn;
    this.rmFn = rmFn;
  }

  /**
   * Walks below {@link root}, removes every `node_modules/.cache/frontx-unit-producer`
   * directory found, prints each removed path, and returns the count removed.
   * Exits 0 (returns 0) when nothing exists. Deletes nothing else.
   *
   * @returns {Promise<number>} number of cache directories removed.
   */
  async run() {
    /** @type {string[]} */
    const targets = [];
    await this.#collect(this.root, targets);
    for (const target of targets) {
      await this.rmFn(target, { recursive: true, force: true });
      this.log(target);
    }
    return targets.length;
  }

  /**
   * Recursively collects the cache directories below `dir`. A directory named
   * {@link CACHE_SEGMENT} is only collected when its parent is
   * {@link PARENT_SEGMENT} and its grandparent is {@link GRANDPARENT_SEGMENT};
   * the walk does not descend into a directory it will delete.
   *
   * @param {string} dir
   * @param {string[]} targets
   */
  async #collect(dir, targets) {
    /** @type {import('node:fs').Dirent[]} */
    let entries;
    try {
      entries = await this.readdirFn(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === CACHE_SEGMENT && this.#isCacheLocation(full)) {
        targets.push(full);
        continue; // do not descend into a directory we will delete
      }
      await this.#collect(full, targets);
    }
  }

  /**
   * @param {string} full absolute path to a `frontx-unit-producer` candidate.
   * @returns {boolean} true when the parent is `.cache` and the grandparent is `node_modules`.
   */
  #isCacheLocation(full) {
    const parent = path.basename(path.dirname(full));
    const grand = path.basename(path.dirname(path.dirname(full)));
    return parent === PARENT_SEGMENT && grand === GRANDPARENT_SEGMENT;
  }
}
