/**
 * `BootChunkGraph` — which of the host's own chunks the shell boot
 * evaluates, and so which shared specifiers compete with the boot.
 *
 * The boot evaluates the entry chunks and, transitively, every chunk they
 * import statically. A chunk reached only through a dynamic `import()` is
 * fetched when the code that owns it asks for it, never at boot. The
 * shared specifiers the boot-evaluated chunks import form the boot list
 * (its modulepreload links and the realm-cache fill); the
 * specifiers only the lazily reached chunks import are produced and
 * answered by the import map but never fetched ahead of the boot.
 */

/** One emitted host chunk, as the bundler reports it. */
export interface BootGraphChunk {
  fileName: string;
  isEntry: boolean;
  /** Emitted chunk files this chunk imports statically. */
  staticImports: readonly string[];
  /** Bare (shared) specifiers this chunk imports statically. */
  bareImports: readonly string[];
}

export class BootChunkGraph {
  private readonly byFile: ReadonlyMap<string, BootGraphChunk>;

  constructor(private readonly chunks: readonly BootGraphChunk[]) {
    this.byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  }

  /** Chunk files reachable from the entry chunks through static imports. */
  bootChunkFiles(): Set<string> {
    const reached = new Set<string>();
    const pending = this.chunks.filter((c) => c.isEntry).map((c) => c.fileName);
    while (pending.length > 0) {
      const file = pending.pop() as string;
      if (reached.has(file)) continue;
      const chunk = this.byFile.get(file);
      if (chunk === undefined) continue;
      reached.add(file);
      pending.push(...chunk.staticImports);
    }
    return reached;
  }

  /** Bare specifiers the boot-evaluated chunks import, sorted. */
  bootSpecifiers(): string[] {
    const files = this.bootChunkFiles();
    const specifiers = new Set<string>();
    for (const file of files) {
      for (const spec of this.byFile.get(file)?.bareImports ?? []) specifiers.add(spec);
    }
    return [...specifiers].sort();
  }

  /** Bare specifiers imported only by lazily reached chunks, sorted. */
  lazyOnlySpecifiers(): string[] {
    const boot = new Set(this.bootSpecifiers());
    const lazy = new Set<string>();
    for (const chunk of this.chunks) {
      for (const spec of chunk.bareImports) if (!boot.has(spec)) lazy.add(spec);
    }
    return [...lazy].sort();
  }
}
