/**
 * `PackageBuildCache` — the per-`package@version` build-machine cache.
 * The package's chunk computation — the
 * Rollup split build and its derived edge records — is stored keyed
 * by the package's content fingerprint, so a second producing build
 * of the same `package@version` skips the bundler work entirely.
 *
 * The cache is build speed only: it stores the *unpatched* Rollup
 * outputs plus the records derived from the bundle graph (edges,
 * module ownership, entry mapping). Byte-shaping passes (CJS interop
 * via Rollup's commonjs plugin, the `frontx-owned:` marker rewrite,
 * member-export restore, content hashing) run on every build, so a
 * cached package still emits bytes fixed by the producer's own
 * settings — the cache can never smuggle in stale interop decisions.
 * A fingerprint miss simply rebuilds.
 *
 * Layout: `<cacheDir>/<name>@<version>/<fingerprint>/` holding
 * `chunks/` (raw outputs by chunk id) and `manifest.json` (records).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ConsumerBarrelOriginRecord } from './ConsumerBarrelRewriteLedger';
import { ContentHasher } from './ContentHasher';

/** One chunk record the cache persists (pre-patch bytes + edges). */
export interface CachedChunkRecord {
  /** Chunk id — its file name under `chunks/` in the cache entry. */
  id: string;
  /** Path segment used for content naming (from the output path). */
  namePath: string;
  /** Absolute input file when this chunk is an entry output. */
  entryPoint?: string;
  /** Package-relative module paths the chunk owns. */
  modulePaths: string[];
  /** External edges: specifier + kind. */
  externalEdges: Array<{ specifier: string; kind: string }>;
  /** Internal edges to sibling chunk ids, with kind. */
  internalEdges: Array<{ id: string; kind: string }>;
  /** Whether the entry output wraps a CommonJS module. */
  isCjsEntry: boolean;
}

/** The cached computation of one `package@version`. */
export interface CachedPackageBuild {
  chunks: CachedChunkRecord[];
  /** Entry specifier → chunk id of its entry output. */
  entryChunks: Record<string, string>;
  /**
   * Entry specifier → resolved file: the transitive-skip
   * fixpoint re-screens these on a cache hit exactly as on a miss.
   */
  entries?: Record<string, string>;
  /** Entries the production-runtime screen excluded, with reasons. */
  excludedEntries?: Array<{ entry: string; file: string; specifier: string; reason: string }>;
  /** Entries deferred on an optional-peer reach. */
  deferredEntries?: Array<{ entry: string; file: string; specifier: string; reason: string; optionalPeer?: string }>;
  /** Unsplittable-barrel report notes. */
  barrelNotes: Array<{ entry: string; reason: string; fix: string }>;
  /** Entry specifiers computed for the complete entry set. */
  entrySpecifiers: string[];
  /** Build input module ids — the inlining guard's data on a cache hit. */
  inputs: string[];
  /**
   * The member respells the package's own build applied to imports of
   * other shared packages' barrels — what turning one back needs.
   */
  respells?: ConsumerBarrelOriginRecord[];
}

export class PackageBuildCache {
  private readonly cacheDir: string;

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
  }

  /**
   * The cache key of a package's installed bytes: `package@version`
   * plus a SHA-256 over every file's package-relative path and
   * content hash — so two installs claiming the same version with
   * different bytes never share a cache entry. `mix` folds the
   * producer identity and the fixed build settings into the key: the
   * cached raw outputs are shaped by them, so a producer or settings
   * change must not reuse a computation it did not run. Nested
   * `node_modules` directories do not participate: a dependency's own
   * nested copies are resolved through the shared-set walk, not bundled.
   */
  static fingerprint(
    packageDir: string,
    mix = '',
    fileDigests: string = PackageBuildCache.fileDigests(packageDir)
  ): string {
    return ContentHasher.ofText(`${mix}\n${fileDigests}`);
  }

  /**
   * One line per file of the package — its package-relative path and
   * content hash — the part of the key that costs a read of every file.
   */
  static fileDigests(packageDir: string): string {
    const parts: string[] = [];
    const walk = (dir: string): void => {
      for (const name of fs.readdirSync(dir).sort()) {
        const p = path.join(dir, name);
        const stat = fs.statSync(p);
        if (stat.isDirectory()) {
          if (name === 'node_modules') continue;
          walk(p);
          continue;
        }
        if (!stat.isFile()) continue;
        const rel = path.relative(packageDir, p).split(path.sep).join('/');
        parts.push(`${rel}:${ContentHasher.ofFile(p) ?? 'unreadable'}`);
      }
    };
    walk(packageDir);
    return parts.join('\n');
  }

  /** Loads a cached build, or `undefined` on any miss. */
  load(
    name: string,
    version: string,
    fingerprint: string
  ): { build: CachedPackageBuild; chunkDir: string } | undefined {
    const dir = this.entryDir(name, version, fingerprint);
    try {
      const manifest = path.join(dir, 'manifest.json');
      const build = JSON.parse(
        fs.readFileSync(manifest, 'utf-8')
      ) as CachedPackageBuild;
      const chunkDir = path.join(dir, 'chunks');
      for (const chunk of build.chunks) {
        if (!fs.existsSync(path.join(chunkDir, chunk.id))) return undefined;
      }
      return { build, chunkDir };
    } catch {
      return undefined;
    }
  }

  /**
   * Stores a computed build: `chunkSourceDir` holds the raw output
   * files named by each record's `id`. The entry is assembled in a
   * sibling staging directory and moved into place with one
   * `renameSync`, so a concurrent `load` never observes a torn entry
   * (manifest without its chunks or vice versa). Two producers racing
   * the same fingerprint compute identical bytes; the loser of the
   * rename simply discards its staging directory and keeps the
   * winner's entry.
   */
  store(
    name: string,
    version: string,
    fingerprint: string,
    build: CachedPackageBuild,
    chunkSourceDir: string
  ): void {
    const dir = this.entryDir(name, version, fingerprint);
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    const tmp =
      `${dir}.tmp-${process.pid}-` +
      `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const chunkDir = path.join(tmp, 'chunks');
    try {
      fs.mkdirSync(chunkDir, { recursive: true });
      for (const chunk of build.chunks) {
        const src = path.join(chunkSourceDir, chunk.id);
        const dest = path.join(chunkDir, chunk.id);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        // Copy: the staged outputs stay in place for this build's own
        // byte-shaping; the cache keeps pristine pre-patch bytes.
        fs.copyFileSync(src, dest);
      }
      fs.writeFileSync(
        path.join(tmp, 'manifest.json'),
        JSON.stringify(build) + '\n',
        'utf-8'
      );
      try {
        fs.renameSync(tmp, dir);
      } catch (err) {
        // A rename race surfaces as the target existing
        // (`EEXIST`/`ENOTEMPTY`) or, on Windows, a transient
        // `EPERM` while the target is being settled. Only those
        // are races — another producer computing the same
        // fingerprint wins, and the entries are byte-identical so
        // the loser's staging dir is discarded. Anything else
        // (EACCES, ENOSPC, EROFS, …) is a real I/O failure this
        // store cannot recover from; rethrow so the build dies
        // with the cause instead of silently dropping the cache
        // write.
        const code = (err as NodeJS.ErrnoException).code;
        if (
          code === 'EEXIST' ||
          code === 'ENOTEMPTY' ||
          code === 'EPERM'
        ) {
          fs.rmSync(tmp, { recursive: true, force: true });
        } else {
          throw err;
        }
      }
    } catch (err) {
      fs.rmSync(tmp, { recursive: true, force: true });
      throw err;
    }
  }

  private entryDir(name: string, version: string, fingerprint: string): string {
    return path.join(this.cacheDir, `${name}@${version}`, fingerprint);
  }
}
