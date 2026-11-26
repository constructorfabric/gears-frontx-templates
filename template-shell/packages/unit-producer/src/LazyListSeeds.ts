/**
 * `LazyListSeeds` — the lazy targets one fetch list reaches, each to
 * get a list of its own. A target is keyed as the runtime looks it up:
 * a relative target by its chunk location, a bare one
 * (`import('pkg/sub')`) by the bare specifier itself. A target is
 * seeded once per key.
 */

export interface LazyListSeed<Build, Chunk> {
  build: Build;
  chunk: Chunk;
  key: string;
}

export class LazyListSeeds<Build, Chunk extends { location: string; publishAliases?: string[] }> {
  private readonly seeded = new Set<string>();
  private readonly seeds: Array<LazyListSeed<Build, Chunk>> = [];

  /** Seeds `chunk` under `key` (its own location when relative). */
  add(build: Build, chunk: Chunk, key: string = chunk.location): void {
    if (this.seeded.has(key)) return;
    this.seeded.add(key);
    this.seeds.push({ build, chunk, key });
  }

  [Symbol.iterator](): Iterator<LazyListSeed<Build, Chunk>> {
    return this.seeds[Symbol.iterator]();
  }

  /**
   * Every key one seed's list answers: its own, and — for a relative
   * target — the alias spellings a cyclic importer carries for it.
   */
  static keysOf<Build, Chunk extends { location: string; publishAliases?: string[] }>(
    seed: LazyListSeed<Build, Chunk>
  ): string[] {
    return seed.key === seed.chunk.location
      ? [seed.key, ...(seed.chunk.publishAliases ?? [])]
      : [seed.key];
  }
}
