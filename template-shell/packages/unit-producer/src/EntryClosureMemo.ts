/**
 * `EntryClosureMemo` — the entry screen's closure walk, memoized for
 * the lifetime of one owner (one producer run, or one package's
 * entry-set computation). Files never change while the owner lives,
 * so every result is computed once:
 *  - per file: its load edges (read + parse) and, per specifier, the
 *    relative module it resolves to;
 *  - per `(packageDir, file)`: the entry closure assembled from those
 *    per-file results.
 *
 * The walk itself is unchanged — the same breadth-first order over the
 * same edges — so each closure, its first-reaching module per bare
 * specifier included, is exactly what an unmemoized walk returns. The
 * memo is an instance owned by its caller, never module state: two
 * independent owners never share results.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { ModuleLinkageScanner } from './ModuleLinkageScanner';

/** One bare specifier an entry's closure reaches, with its first reach. */
export interface ClosureBareSpecifier {
  specifier: string;
  /** The module (absolute path) that reaches it first in walk order. */
  via: string;
  kind: 'import' | 'require';
  optional: boolean;
}

/** An entry's intra-package load closure, as the entry screen reads it. */
export interface EntryClosure {
  /** Bare specifiers reached, sorted by specifier. */
  bare: readonly ClosureBareSpecifier[];
  /** `require(<non-literal>)` calls kept, sorted by module. */
  opaque: ReadonlyArray<{ via: string; expression: string }>;
}

/** One load edge of a single file, as the walk consumes it. */
interface FileEdge {
  spec: string;
  kind: 'import' | 'require';
  optional: boolean;
}

/** A single file's parsed load edges; `undefined` when unreadable or unparseable. */
interface FileEdges {
  edges: readonly FileEdge[];
  opaqueExpressions: readonly string[];
}

const JS_RESOLVE_EXTENSIONS = ['.js', '.mjs', '.jsx', '.cjs', '.ts', '.mts', '.tsx'];

export class EntryClosureMemo {
  private readonly fileEdges = new Map<string, FileEdges | undefined>();
  private readonly relativeTargets = new Map<string, string | undefined>();
  private readonly closures = new Map<string, EntryClosure>();

  /**
   * @param readSource reads one module's text; throws when unreadable.
   */
  constructor(
    private readonly readSource: (file: string) => string = (file) =>
      fs.readFileSync(file, 'utf-8')
  ) {}

  /**
   * Every bare specifier `file`'s load closure reaches through relative
   * specifiers inside the package — `file`'s own edges included — each
   * with the first module reaching it and how. Static `import`/`export
   * … from` statements and literal `require()` calls are both load
   * edges (a bundler follows a CommonJS or UMD build's requires exactly
   * like imports); dynamic `import()` targets are excluded:
   * the screen asks what the entry needs to load, not what it may
   * reach.
   */
  closure(packageDir: string, file: string): EntryClosure {
    const key = `${packageDir}\0${file}`;
    let closure = this.closures.get(key);
    if (closure === undefined) {
      closure = this.walk(packageDir, file);
      this.closures.set(key, closure);
    }
    return closure;
  }

  /** Resolves a `./x` specifier relative to `fromFile`'s directory. */
  static resolveRelative(fromFile: string, spec: string): string | undefined {
    const base = path.resolve(path.dirname(fromFile), spec);
    const candidates = [
      base,
      ...JS_RESOLVE_EXTENSIONS.map((ext) => base + ext),
      ...JS_RESOLVE_EXTENSIONS.map((ext) => path.join(base, `index${ext}`)),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return fs.realpathSync(candidate);
      }
    }
    return undefined;
  }

  /** `file` as a posix path relative to the package dir, or undefined. */
  static moduleRel(packageDir: string, file: string): string | undefined {
    const rel = path.relative(packageDir, file).split(path.sep).join('/');
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
      return undefined;
    }
    return rel;
  }

  /** The breadth-first closure walk over the memoized per-file results. */
  private walk(packageDir: string, file: string): EntryClosure {
    const bare = new Map<string, ClosureBareSpecifier>();
    const opaque: Array<{ via: string; expression: string }> = [];
    const seen = new Set<string>();
    const queue = [file];
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head];
      if (seen.has(current)) continue;
      seen.add(current);
      const loaded = this.edgesOf(current);
      if (loaded === undefined) continue;
      if (loaded.opaqueExpressions.length > 0) {
        const rel = EntryClosureMemo.moduleRel(packageDir, current) ?? current;
        for (const expression of loaded.opaqueExpressions) {
          opaque.push({ via: rel, expression });
        }
      }
      for (const { spec, kind, optional } of loaded.edges) {
        if (spec.startsWith('.')) {
          const target = this.relativeTarget(current, spec);
          if (
            target !== undefined &&
            !path.relative(packageDir, target).startsWith('..')
          ) {
            queue.push(target);
          }
        } else if (!spec.startsWith('/') && !bare.has(spec)) {
          bare.set(spec, { specifier: spec, via: current, kind, optional });
        }
      }
    }
    return {
      bare: [...bare.values()].sort((a, b) =>
        a.specifier < b.specifier ? -1 : a.specifier > b.specifier ? 1 : 0
      ),
      opaque: opaque.sort((a, b) => (a.via < b.via ? -1 : a.via > b.via ? 1 : 0)),
    };
  }

  /** One file's load edges in source order: static statements, then requires. */
  private edgesOf(file: string): FileEdges | undefined {
    if (this.fileEdges.has(file)) return this.fileEdges.get(file);
    let loaded: FileEdges | undefined;
    let source: string | undefined;
    try {
      source = this.readSource(file);
    } catch {
      source = undefined;
    }
    if (source !== undefined) {
      const edges = ModuleLinkageScanner.loadEdges(source, path.basename(file));
      if (edges !== undefined) {
        loaded = {
          edges: [
            ...edges.statements
              .filter((s) => !s.typeOnly)
              .map((s) => ({
                spec: s.specifier,
                kind: 'import' as const,
                optional: false,
              })),
            ...edges.requireCalls.map((r) => ({
              spec: r.specifier,
              kind: 'require' as const,
              optional: r.optional,
            })),
          ],
          opaqueExpressions: edges.opaqueRequires.map((o) => o.expression),
        };
      }
    }
    this.fileEdges.set(file, loaded);
    return loaded;
  }

  /** {@link resolveRelative}, memoized per (directory, specifier). */
  private relativeTarget(fromFile: string, spec: string): string | undefined {
    const key = `${path.dirname(fromFile)}\0${spec}`;
    if (this.relativeTargets.has(key)) return this.relativeTargets.get(key);
    const target = EntryClosureMemo.resolveRelative(fromFile, spec);
    this.relativeTargets.set(key, target);
    return target;
  }
}
