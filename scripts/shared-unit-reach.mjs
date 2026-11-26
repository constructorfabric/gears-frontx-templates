/**
 * Shared list-walk helpers for the build-time gates (list model). The runtime performs no reach walk — every exposed module's
 * and lazy target's needs are precomputed flat fetch lists held in the
 * manifest — so the gates walk the manifest's `lists` instead: each list
 * names units of the manifest's unit table `units` by content identity,
 * and names the lazy-target and pattern-import lists it reaches by key.
 *
 * A "unit" here is a unit-table entry: `{ location, contentHash, answers,
 * imports }`. A "resolved list" is a list with its units resolved through
 * the table: `{ items, allUnits, ownChunks }`. A package is
 * reachable when at least one unit on an entry's combined lists belongs
 * to it — ownership comes from the unit's location under `<pkg>@<version>/`
 * (`@scope/name@<ver>` for scoped packages).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** The path of a URL or URL-shaped base: origin, query and hash removed. */
function urlPath(url) {
  return String(url)
    .replace(/^(?:[a-z][a-z\d+.-]*:)?\/\/[^/]*/i, '')
    .replace(/[?#].*$/, '');
}

/**
 * The on-disk units directory (relative to the dist) a shell's declared
 * `unitsBase` names: the base is `${ownBase}${unitsDir}/` — `./shared/`,
 * `/shared/`, `/app/shared/`, `https://cdn/x/shared/` — so the directory
 * is its trailing segment.
 *
 * @param {string | undefined} unitsBase
 * @returns {string}
 */
export function unitsDirOf(unitsBase) {
  if (typeof unitsBase !== 'string') return 'shared';
  const segments = urlPath(unitsBase).split('/').filter((seg) => seg !== '' && seg !== '.');
  return segments[segments.length - 1] ?? 'shared';
}

/**
 * The dist-relative path of a URL the built shell emits (an import-map
 * entry): a URL under the units directory resolves through that
 * directory whatever base prefixes it; any other URL is read relative to
 * the dist.
 *
 * @param {string} url
 * @param {string} unitsDir
 * @returns {string}
 */
export function distPathOfUrl(url, unitsDir) {
  const pathname = urlPath(url);
  const at = `/${pathname}`.indexOf(`/${unitsDir}/`);
  return at === -1 ? pathname.replace(/^\.?\//, '') : `/${pathname}`.slice(at + 1);
}

/**
 * Shared-asset base directory for a dist: `metaData.sharedBase`, else
 * `metaData.publicPath`, resolved against the dist dir when relative.
 * Returns the dist dir itself when neither is declared.
 *
 * @param {string} distDir
 * @param {{ metaData?: { sharedBase?: string, publicPath?: string } }} manifest
 */
export function sharedDir(distDir, manifest) {
  const meta = manifest?.metaData ?? {};
  const base = typeof meta.sharedBase === 'string' ? meta.sharedBase : meta.publicPath;
  if (typeof base !== 'string' || base === '' || /^[a-z][a-z\d+.-]*:/i.test(base) || base.startsWith('//')) {
    // A remote base has no filesystem leg; fall back to ./shared/.
    return path.resolve(distDir, 'shared');
  }
  return path.resolve(distDir, base);
}

/**
 * The package an item location belongs to: the `<pkg>@<version>` path
 * head, two segments for scoped packages (`@scope/name@ver`).
 *
 * @param {string} location
 * @returns {string | null}
 */
export function packageOfLocation(location) {
  const segments = location.split('/');
  let head = segments[0];
  if (head === undefined) return null;
  if (head.startsWith('@')) {
    if (segments.length < 2) return null;
    head = `${head}/${segments[1]}`;
  }
  const match = /^(.*)@[^@/]+$/.exec(head);
  return match?.[1] ?? null;
}

/**
 * Resolve `list` through the unit table: each content identity it names
 * becomes the table's first unit with that identity (the runtime fetches
 * one unit per identity; `allUnits` also holds the byte-identical twins at
 * other locations, which resolve relative specifiers the same way).
 * `missing` collects every identity the table does not hold.
 *
 * @param {{ units: string[], ownChunks?: string[] }} list
 * @param {ReadonlyMap<string, object[]>} byHash unit table by content identity
 * @param {string[]} [missing]
 * @returns {{ items: object[], allUnits: object[], ownChunks: string[] }}
 */
export function resolveList(list, byHash, missing = []) {
  const items = [];
  const allUnits = [];
  for (const hash of list.units ?? []) {
    const units = byHash.get(hash);
    if (units === undefined) missing.push(hash);
    else {
      items.push(units[0]);
      allUnits.push(...units);
    }
  }
  return { items, allUnits, ownChunks: list.ownChunks ?? [] };
}

/** The unit table by content identity: every unit of each identity, in table order. */
export function unitsByHash(units) {
  const byHash = new Map();
  for (const unit of units ?? []) {
    const same = byHash.get(unit.contentHash);
    if (same === undefined) byHash.set(unit.contentHash, [unit]);
    else same.push(unit);
  }
  return byHash;
}

/**
 * Every resolved list of a manifest, keyed by its key in `lists`, with the
 * lists that name it as a lazy or pattern target as its parents. An entry
 * is a list no other list names; its docs are the list and every list it
 * reaches. `missing` names every content identity a list names that the
 * unit table does not hold, and `dangling` every key a list names that
 * `lists` does not hold.
 *
 * @param {{ units?: object[], lists?: Record<string, { units: string[], ownChunks?: string[], lazy?: string[], patterns?: string[] }> }} manifest
 */
export function manifestLists(manifest) {
  const byHash = unitsByHash(manifest.units);
  const missing = [];
  const dangling = [];
  const lists = manifest.lists ?? {};
  const docs = new Map();
  const parents = new Map();
  const named = new Set();
  const reached = (list) => [...(list.lazy ?? []), ...(list.patterns ?? [])];
  for (const [key, list] of Object.entries(lists)) {
    docs.set(key, resolveList(list, byHash, missing));
    for (const child of reached(list)) {
      named.add(child);
      if (lists[child] === undefined) {
        dangling.push(child);
        continue;
      }
      (parents.get(child) ?? parents.set(child, new Set()).get(child)).add(key);
    }
  }
  const entries = [];
  for (const [entry, list] of Object.entries(lists)) {
    if (named.has(entry)) continue;
    const seen = new Set();
    const entryDocs = [];
    const queue = [entry];
    for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
      if (seen.has(key) || lists[key] === undefined) continue;
      seen.add(key);
      entryDocs.push({ location: key, doc: docs.get(key) });
      queue.push(...reached(lists[key]));
    }
    entries.push({ entry, location: entry, docs: entryDocs });
    void list;
  }
  return { docs, parents, entries, missing, dangling };
}

/**
 * Read a fixture's emitted manifest plus every entry's combined lists:
 * each entry list and the lists it reaches through `lazy`/`patterns`, resolved
 * through the unit table. Returns the entry name → resolved lists and
 * every resolved list, keyed by id.
 *
 * @param {string} distDir fixture dist holding `mfe-manifest.json`
 * @returns {{
 *   manifest: object;
 *   base: string;
 *   entries: Array<{ entry: string, location: string, docs: Array<{ location: string, doc: object }> }>;
 *   docs: Map<string, object>;
 * }}
 */
export function readEntryLists(distDir) {
  const manifestPath = path.join(distDir, 'mfe-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')).manifest;
  if (typeof manifest !== 'object' || manifest === null) {
    throw new Error(`emitted manifest at ${manifestPath} has no "manifest" object`);
  }
  const base = sharedDir(distDir, manifest);
  const { docs, entries, missing, dangling } = manifestLists(manifest);
  if (dangling.length > 0) {
    throw new Error(`manifest lists name lists its \`lists\` does not hold: ${dangling.join(', ')}`);
  }
  if (missing.length > 0) {
    throw new Error(`manifest lists name content identities its unit table does not hold: ${missing.join(', ')}`);
  }
  return { manifest, base, entries, docs };
}

/**
 * Evaluation scope of one built fixture: every item on every entry's
 * combined lists — the bytes a load of that fixture can evaluate.
 *
 * @param {string} distDir
 * @returns {{ manifest: object, base: string, reachedUnits: Map<string, Set<object>>, reachedPackages: Set<string>, docLocations: Set<string> }}
 */
export function walkLists(distDir) {
  const { manifest, base, entries, docs } = readEntryLists(distDir);
  const reachedUnits = new Map();
  const reachedPackages = new Set();
  for (const { doc } of entries.flatMap((e) => e.docs)) {
    for (const item of doc.items) {
      const name = packageOfLocation(item.location) ?? '(unattributed shared)';
      reachedPackages.add(name);
      let set = reachedUnits.get(name);
      if (set === undefined) reachedUnits.set(name, (set = new Set()));
      set.add(item);
    }
  }
  return { manifest, base, reachedUnits, reachedPackages, docLocations: new Set(docs.keys()) };
}

/**
 * Build-time list-completeness walk over one built output: resolve the
 * manifest's lists through its unit table, verify every content identity a
 * list names is held by the table, every unit's chunk exists under `base`
 * with matching bytes, every `{ unit }` edge resolves to a unit on the
 * same list or its parent chain, every specifier edge of a delivered
 * package is answered somewhere in the output, and no nested list repeats
 * a chunk its parent chain already carries.
 *
 * @param {{ units?: object[], lists?: Record<string, object> }} manifest
 * @param {string} base the shared directory containing `<pkg>@<ver>` dirs
 * @returns {string[]} human-readable violations, empty when conforming
 */
export function checkOutputLists(manifest, base) {
  const violations = [];
  if (!fs.existsSync(base)) return [`no shared directory at ${base}`];
  const { docs, parents, missing, dangling } = manifestLists(manifest);
  for (const key of new Set(dangling)) {
    violations.push(`manifest list names list "${key}", which its lists do not hold`);
  }
  for (const hash of new Set(missing)) {
    violations.push(`manifest list names content identity ${hash}, which the unit table does not hold`);
  }
  const answers = new Set();
  for (const unit of manifest.units ?? []) for (const a of unit.answers ?? []) answers.add(a);
  const deliveredPackages = new Set();
  for (const unit of manifest.units ?? []) {
    const name = packageOfLocation(unit.location);
    if (name !== null) deliveredPackages.add(name);
  }
  const chain = (start, links) => {
    const seen = new Set();
    const queue = [...(links.get(start) ?? [])];
    while (queue.length) {
      const next = queue.pop();
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(...(links.get(next) ?? []));
    }
    return seen;
  };
  // Every root-to-document chain a load can take: a document shared by
  // several entries sits on each of their chains, and each chain is its
  // own "combined lists". Answer uniqueness and the delta property bind
  // per chain, not over the union of all ancestors.
  const pathsToRoots = (start) => {
    const ups = [...(parents.get(start) ?? [])].filter((p) => docs.has(p));
    if (ups.length === 0) return [[start]];
    const out = [];
    for (const p of ups) {
      for (const tail of pathsToRoots(p)) {
        if (!tail.includes(start)) out.push([start, ...tail]);
      }
    }
    return out.length > 0 ? out : [[start]];
  };
  for (const [rel, doc] of docs) {
    const ancestors = chain(rel, parents);
    const selfAndAncestorsHashes = new Set();
    for (const r of [rel, ...ancestors]) {
      for (const i of docs.get(r).items ?? []) selfAndAncestorsHashes.add(i.contentHash);
    }
    const perChain = pathsToRoots(rel).map((p) => {
      const answers = new Map();
      const imported = new Set();
      const ancestorHashes = new Set();
      const hashes = new Set();
      const locations = new Set();
      for (const r of p) {
        for (const i of docs.get(r).items ?? []) {
          for (const a of i.answers ?? []) {
            // Uniqueness is by content identity: byte-identical twin
            // items under different locations answer a specifier with
            // the same bytes — an unambiguous provision.
            const byHash = answers.get(a) ?? answers.set(a, new Set()).get(a);
            byHash.add(i.contentHash);
          }
          for (const e of i.imports ?? []) if (typeof e === 'string') imported.add(e);
          if (r !== rel) ancestorHashes.add(i.contentHash);
          hashes.add(i.contentHash);
        }
        for (const u of docs.get(r).allUnits ?? []) locations.add(u.location);
      }
      return { answers, imported, ancestorHashes, hashes, locations };
    });
    // The delivered-set closure: a document shared by several
    // parents must close under EACH root-to-document chain — a runtime
    // loads it under exactly one parent, so an edge satisfied only by
    // a different parent's items leaves a native second-round fetch.
    for (const item of doc.items ?? []) {
      if (perChain.every((c) => c.ancestorHashes.has(item.contentHash))) {
        violations.push(`${rel}: carries chunk ${item.contentHash} ("${item.location}") every parent chain already delivers — lazy/pattern lists hold only the delta`);
      }
      const chunkPath = path.join(base, item.location);
      let text;
      if (!fs.existsSync(chunkPath)) {
        violations.push(`${rel}: item names chunk "${item.location}" but no such file exists`);
      } else {
        const bytes = fs.readFileSync(chunkPath);
        const actual = crypto.createHash('sha256').update(bytes).digest('hex');
        if (actual !== item.contentHash) {
          violations.push(`${rel}: item "${item.location}" declares contentHash ${item.contentHash} but file SHA-256 is ${actual}`);
        }
        text = bytes.toString('utf-8');
      }
      for (const edge of item.imports ?? []) {
        if (typeof edge !== 'string') {
          if (perChain.some((c) => !c.hashes.has(edge.unit))) {
            violations.push(`${rel}: resolved unit edge ${edge.unit} of "${item.location}" has no answering unit on this list or its parent chain`);
          }
          continue;
        }
        const root = edge.startsWith('@') ? edge.split('/').slice(0, 2).join('/') : edge.split('/')[0];
        const delivered = deliveredPackages.has(root);
        if (delivered && perChain.some((c) => !c.answers.has(edge))) {
          violations.push(`${rel}: specifier "${edge}" imported by "${item.location}" is answered by no item on this list or its parent chain`);
        }
      }
      // Static relative specifiers in the emitted text resolve
      // natively against the item's own location — the chunk they
      // reach must be delivered by this list or its parent chain, on
      // every chain. A cyclic chunk's unhashed alias resolves
      // to its delivered hashed twin; dynamic `import(...)` goes
      // through the lazy record, not this leg.
      if (text !== undefined) {
        for (const m of text.matchAll(/(?:from\s*["']|import\s*["'])([^"']+)["']/g)) {
          const spec = m[1];
          if (!spec.startsWith('./') && !spec.startsWith('../')) continue;
          const resolved = new URL(spec, `http://r/${item.location}`).pathname.slice(1);
          const aliasOf = `${resolved.replace(/\.js$/, '')}.`;
          for (const c of perChain) {
            if (c.locations.has(resolved)) continue;
            const aliasDelivered = [...c.locations].some(
              (l) => l.startsWith(aliasOf) && /\.[0-9a-f]{64}\.js$/.test(l)
            );
            if (!aliasDelivered) {
              violations.push(`${rel}: item "${item.location}" imports relative specifier "${spec}" resolving to "${resolved}", delivered by no item on this list or its parent chain`);
              break;
            }
          }
        }
      }
    }
    // The uniqueness rule binds the specifiers a chain's lists actually
    // import — an extra item answering a specifier nothing imports is
    // spare capacity, not a double provision.
    const seenUniques = new Set();
    for (const c of perChain) {
      for (const [specifier, hashes] of c.answers) {
        if (hashes.size > 1 && c.imported.has(specifier) && !seenUniques.has(specifier)) {
          seenUniques.add(specifier);
          violations.push(`${rel}: specifier "${specifier}" is imported by the combined lists but answered by items with ${hashes.size} different content identities — exactly one item must answer it`);
        }
      }
    }
  }
  return violations;
}
