/**
 * `ImportMapComposer` — generates the shell's native-boot import map
 * from the fetch lists the producer returned
 * for the host's own dist: every bare specifier the host's own
 * chunks import maps at the top level to the chunk its emitted entry
 * list answers it with, and every bare specifier a shared chunk imports
 * maps inside the importing package's URL `scope` to the chunk its own
 * list (or its parent chain, or the emitted universe when unambiguous)
 * answers it with — the same answer the per-load mint picks, expressed
 * natively so the content-identical shared chunks load without runtime
 * rewriting.
 *
 * Scope keys are the package-directory URL prefixes (`<unitsBase><pkg>
 * @<ver>/`): an emitted shared chunk's URL always sits under its
 * package dir, so its bare imports resolve through its scope. One
 * specifier resolved to two different chunks inside a single scope is
 * a genuine ambiguity an import map cannot express: the build fails
 * naming the specifier and both locations rather than silently picking
 * one.
 *
 * The composer also returns the `sha256-…` token of the exact inline
 * JSON text for a `script-src` CSP source, and the plugin supports a
 * `nonce` on the tag itself — a strict CSP admits the inline map either
 * way.
 */

import { createHash } from 'node:crypto';
import type { ProducedFetchList } from '@gears-frontx/unit-producer';

export interface ComposedImportMap {
  /** Top-level specifier → own-dist URL (the host chunks' bare imports). */
  imports: Record<string, string>;
  /** URL-prefix scope → specifier → own-dist URL (shared chunks' imports). */
  scopes: Record<string, Record<string, string>>;
  /** The exact inline text the `<script type="importmap">` tag carries. */
  json: string;
  /** The `sha256-…` CSP source token admitting the inline map. */
  cspHash: string;
}

const sortRecord = (rec: Map<string, string>): Record<string, string> =>
  Object.fromEntries(
    [...rec.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  );

export class ImportMapComposer {
  /**
   * @param unitsBaseUrl the URL prefix item locations resolve under in
   *   the emitted HTML — the base the host's own chunks are served under
   *   plus the units dir (e.g. `'./shared/'`, `'/app/shared/'`).
   * @param specifiers the bare specifiers the host's own chunks import —
   *   the top-level answers the map must carry.
   * @param lists the producer's emitted entry lists keyed by the
   *   consumer specifier they were requested for — a host specifier's
   *   answer is read off its own list first (the emitted universe is
   *   the fallback and must be unambiguous).
   * @param onError fatal-reporting callback: an answer ambiguity or a
   *   specifier no emitted item answers fails the build naming it.
   */
  static compose(options: {
    unitsBaseUrl: string;
    specifiers: readonly string[];
    lists: Record<string, ProducedFetchList>;
    onError: (message: string) => never;
  }): ComposedImportMap {
    const { unitsBaseUrl, specifiers, lists, onError } = options;
    const urlOf = (location: string): string => `${unitsBaseUrl}${location}`;
    const scopeOf = (location: string): string =>
      urlOf(location.slice(0, location.lastIndexOf('/') + 1));

    // ── Every returned list, entry lists and their nested lazy/pattern
    // lists alike, keyed by an id; each nested list's parent is the list
    // it is nested in. ──────────────────────────────────────────────
    const docs = new Map<string, ProducedFetchList>();
    const parentOf = new Map<string, string>();
    const walk = (id: string, list: ProducedFetchList, parent?: string): void => {
      docs.set(id, list);
      if (parent !== undefined) parentOf.set(id, parent);
      for (const [kind, record] of [['lazy', list.lazy], ['patterns', list.patterns]] as const) {
        for (const [key, nested] of Object.entries(record ?? {})) {
          walk(`${id} > ${kind}:${key}`, nested, id);
        }
      }
    };
    for (const [spec, list] of Object.entries(lists)) walk(spec, list);
    const chainOf = (rel: string): ProducedFetchList[] => {
      const chain: ProducedFetchList[] = [];
      for (let cur: string | undefined = rel; cur !== undefined; cur = parentOf.get(cur)) {
        chain.push(docs.get(cur)!);
      }
      return chain;
    };

    /** The single location on `docs` answering `spec`, or undefined. */
    const answerIn = (
      docSet: ProducedFetchList[],
      spec: string,
      scope: string
    ): string | undefined => {
      const locations = new Set<string>();
      for (const doc of docSet) {
        for (const item of doc.items ?? []) {
          if ((item.answers ?? []).includes(spec)) locations.add(item.location);
        }
      }
      if (locations.size > 1) {
        onError(
          `[vite-plugin-shell] import map: specifier "${spec}" in scope ` +
            `"${scope}" is answered by ${[...locations].join(' and ')} — a ` +
            `native import map cannot point one specifier at two chunks.`
        );
      }
      return [...locations][0];
    };

    const allDocs = [...docs.values()];

    // ── Scopes: every bare edge an emitted shared chunk carries. ────
    const scopes = new Map<string, Map<string, string>>();
    for (const [rel, doc] of docs) {
      const chain = chainOf(rel);
      for (const item of doc.items ?? []) {
        const scope = scopeOf(item.location);
        let scoped = scopes.get(scope);
        for (const edge of item.imports ?? []) {
          if (typeof edge !== 'string' || edge.startsWith('node:')) continue;
          if (scoped === undefined) {
            scoped = new Map<string, string>();
            scopes.set(scope, scoped);
          }
          const location =
            answerIn(chain, edge, scope) ??
            answerIn(allDocs, edge, scope);
          if (location === undefined) {
            // Unanswered specifier: the mint path leaves it unrewritten
            // too — a chunk carrying it (e.g. a Node-only branch of a
            // package) is emitted but never imported browser-side, so
            // nothing resolves it natively either. Skipped, not fatal.
            continue;
          }
          const known = scoped.get(edge);
          if (known !== undefined && known !== urlOf(location!)) {
            onError(
              `[vite-plugin-shell] import map: specifier "${edge}" in scope ` +
                `"${scope}" resolves to both "${known}" and ` +
                `"${urlOf(location!)}" — a native import map cannot point ` +
                `one specifier at two chunks.`
            );
          }
          scoped.set(edge, urlOf(location!));
        }
      }
    }

    // ── Top level: the host chunks' bare imports, answered off the
    // entry list each specifier was emitted for (the emitted universe
    // is the fallback and must be unambiguous). ──────────────────────
    const imports = new Map<string, string>();
    for (const spec of specifiers) {
      const own = lists[spec];
      const location =
        (own !== undefined ? answerIn([own], spec, 'the host chunks') : undefined) ??
        answerIn(allDocs, spec, 'the host chunks');
      if (location === undefined) {
        onError(
          `[vite-plugin-shell] import map: host specifier "${spec}" is ` +
            `answered by no emitted item.`
        );
      }
      imports.set(spec, urlOf(location!));
    }

    const sortedImports = sortRecord(imports);
    const sortedScopes = Object.fromEntries(
      [...scopes.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([scope, scoped]) => [scope, sortRecord(scoped)])
    );
    const json = JSON.stringify(
      Object.keys(sortedScopes).length > 0
        ? { imports: sortedImports, scopes: sortedScopes }
        : { imports: sortedImports }
    );
    return {
      imports: sortedImports,
      scopes: sortedScopes,
      json,
      cspHash: `sha256-${createHash('sha256').update(json, 'utf-8').digest('base64')}`,
    };
  }
}
