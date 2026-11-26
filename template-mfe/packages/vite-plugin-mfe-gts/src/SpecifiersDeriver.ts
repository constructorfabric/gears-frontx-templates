/**
 * `SpecifiersDeriver` — derives the shared specifiers each exposed
 * entry and each lazily loaded chunk reaches directly through its
 * static import chain, from Rollup's captured output graph. The
 * specifiers select which producer fetch lists merge into the entry's
 * manifest list (exposes) or its lazy chunk's nested list (lazy
 * chunks).
 */

import { SharedSpecifierMatcher } from '@gears-frontx/unit-producer';
import type { CapturedChunk } from './types';

export class SpecifiersDeriver {
  /**
   * Whether a chunk import is a shared specifier — root or subpath
   * (`react/jsx-runtime`) of a shared package — rather than another
   * chunk of the MFE.
   */
  private static isShared(
    specifier: string,
    chunks: ReadonlyMap<string, CapturedChunk>,
    sharedDepNames: ReadonlySet<string>
  ): boolean {
    return (
      !chunks.has(specifier) &&
      new SharedSpecifierMatcher(sharedDepNames).matches(specifier)
    );
  }

  /**
   * Reached specifiers per exposed entry, keyed by the expose path
   * (e.g. `'./lifecycle'`), matching `exposedModule` on the MFE
   * entries.
   */
  static entrySpecifiers(params: {
    exposes: ReadonlyArray<{
      path: string;
      assets: { js: { sync: string[] } };
    }>;
    chunks: ReadonlyMap<string, CapturedChunk>;
    sharedDepNames: ReadonlySet<string>;
  }): Record<string, string[]> {
    const { exposes, chunks, sharedDepNames } = params;
    const specifiers: Record<string, string[]> = {};
    for (const expose of exposes) {
      const visited = new Set<string>();
      const reached = new Set<string>();
      const queue = [...expose.assets.js.sync];
      while (queue.length > 0) {
        const fileName = queue.pop() as string;
        if (visited.has(fileName)) continue;
        visited.add(fileName);
        const chunk = chunks.get(fileName);
        if (!chunk) continue;
        for (const imp of chunk.imports) {
          if (SpecifiersDeriver.isShared(imp, chunks, sharedDepNames)) {
            reached.add(imp);
          } else {
            queue.push(imp);
          }
        }
      }
      specifiers[expose.path] = [...reached].sort();
    }
    return specifiers;
  }

  /**
   * Reached specifiers per lazy target: a lazily loaded own chunk, keyed
   * by its file name (path relative to the asset base), and a shared
   * package the MFE's own code imports dynamically by bare specifier,
   * keyed by that specifier — the key the runtime looks its list up
   * under — reaching that specifier itself.
   */
  static lazyChunkSpecifiers(params: {
    chunks: ReadonlyMap<string, CapturedChunk>;
    sharedDepNames: ReadonlySet<string>;
  }): Record<string, string[]> {
    const { chunks, sharedDepNames } = params;
    const specifiers: Record<string, string[]> = {};
    const lazyChunks = new Set<string>();
    for (const chunk of chunks.values()) {
      for (const dyn of chunk.dynamicImports) lazyChunks.add(dyn);
    }
    for (const lazyChunkName of lazyChunks) {
      const chunk = chunks.get(lazyChunkName);
      if (!chunk) {
        if (SpecifiersDeriver.isShared(lazyChunkName, chunks, sharedDepNames)) {
          specifiers[lazyChunkName] = [lazyChunkName];
        }
        continue;
      }
      const visited = new Set<string>([lazyChunkName]);
      const reached = new Set<string>();
      const queue = [...chunk.imports];
      while (queue.length > 0) {
        const fileName = queue.pop() as string;
        if (visited.has(fileName)) continue;
        visited.add(fileName);
        if (SpecifiersDeriver.isShared(fileName, chunks, sharedDepNames)) {
          reached.add(fileName);
          continue;
        }
        const inner = chunks.get(fileName);
        if (!inner) continue;
        for (const imp of inner.imports) {
          if (!visited.has(imp)) queue.push(imp);
        }
      }
      specifiers[lazyChunkName] = [...reached].sort();
    }
    return specifiers;
  }

  /**
   * The MFE's own chunks the static import chains of `roots` reach,
   * excluding the `excluded` entry chunk (requested in the first round)
   * and every shared specifier — the
   * `ownChunks` of a fetch list: file names relative to the asset base
   * (`metaData.publicPath`), sorted, no content identity.
   */
  private static reachedOwnChunks(
    roots: readonly string[],
    excluded: string,
    chunks: ReadonlyMap<string, CapturedChunk>,
    sharedDepNames: ReadonlySet<string>
  ): string[] {
    const visited = new Set<string>();
    const reached = new Set<string>();
    const queue = [...roots];
    while (queue.length > 0) {
      const fileName = queue.pop() as string;
      if (visited.has(fileName)) continue;
      visited.add(fileName);
      const chunk = chunks.get(fileName);
      if (!chunk) continue;
      // A removed CSS-only chunk has no emitted file: traverse through it,
      // never list it.
      if (fileName !== excluded && chunk.noEmittedFile !== true) {
        reached.add(fileName);
      }
      for (const imp of chunk.imports) {
        if (!SpecifiersDeriver.isShared(imp, chunks, sharedDepNames)) {
          queue.push(imp);
        }
      }
    }
    return [...reached].sort();
  }

  /**
   * Own chunks each exposed entry reaches statically beyond its own
   * entry chunk (requested in the first round), keyed by the expose
   * path.
   */
  static entryOwnChunks(params: {
    exposes: ReadonlyArray<{
      path: string;
      assets: { js: { sync: string[] } };
    }>;
    chunks: ReadonlyMap<string, CapturedChunk>;
    sharedDepNames: ReadonlySet<string>;
  }): Record<string, string[]> {
    const own: Record<string, string[]> = {};
    for (const expose of params.exposes) {
      // Only the entry chunk (the first sync asset) is requested in the
      // first round; any further sync asset is an own chunk to list.
      own[expose.path] = SpecifiersDeriver.reachedOwnChunks(
        expose.assets.js.sync,
        expose.assets.js.sync[0] ?? '',
        params.chunks,
        params.sharedDepNames
      );
    }
    return own;
  }

  /**
   * Own chunks each lazily loaded chunk reaches statically beyond the
   * chunk itself, keyed by the chunk's file name.
   */
  static lazyChunkOwnChunks(params: {
    chunks: ReadonlyMap<string, CapturedChunk>;
    sharedDepNames: ReadonlySet<string>;
  }): Record<string, string[]> {
    const { chunks, sharedDepNames } = params;
    const lazyChunks = new Set<string>();
    for (const chunk of chunks.values()) {
      for (const dyn of chunk.dynamicImports) lazyChunks.add(dyn);
    }
    const own: Record<string, string[]> = {};
    for (const lazyChunkName of lazyChunks) {
      if (!chunks.has(lazyChunkName)) continue;
      own[lazyChunkName] = SpecifiersDeriver.reachedOwnChunks(
        [lazyChunkName],
        lazyChunkName,
        chunks,
        sharedDepNames
      );
    }
    return own;
  }
}
