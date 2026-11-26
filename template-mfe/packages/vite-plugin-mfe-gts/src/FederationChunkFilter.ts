/**
 * `FederationChunkFilter` — the plugin's isolated couplings to
 * `@module-federation/vite`: the control chunks the lazy-import
 * transform must skip, and the federation virtual-module id shape whose
 * relative `exposes` ids must resolve from the package root.
 */

export class FederationChunkFilter {
  /**
   * The ids of the virtual modules `@module-federation/vite` generates
   * for its own runtime — share initialisation, remote-entry bootstrap,
   * the expose map, the local shared import map. Rollup reports them
   * with an optional leading NUL.
   */
  private static readonly CONTROL_MODULE = /^\0?virtual:mf[-:]/;

  /**
   * The module `@module-federation/vite` generates to load the exposes
   * (`virtual:mf-exposes:<name>`, or `virtual:mf-exposes-ssr:<name>`).
   */
  private static readonly EXPOSES_MODULE =
    /^virtual:mf-exposes(?:-ssr)?:/;

  /**
   * Whether the chunk is federation runtime plumbing to leave alone: it
   * holds federation's virtual modules and nothing else. Their `import()`
   * calls are federation's internal protocol, never MFE lazy chunks. A
   * chunk of the MFE's own code is never one, whatever its file name.
   */
  static isFederationControlChunk(moduleIds: readonly string[]): boolean {
    return (
      moduleIds.length > 0 &&
      moduleIds.every((id) => FederationChunkFilter.CONTROL_MODULE.test(id))
    );
  }

  /**
   * Whether a relative `source` must resolve from the package root: ids
   * requested with no importer (Vite would root them at the working
   * directory) and ids imported by federation's virtual exposes module
   * (a virtual id has no directory).
   */
  static resolvesFromPackageRoot(
    source: string,
    importer: string | undefined
  ): boolean {
    if (!source.startsWith('./') && !source.startsWith('../')) return false;
    return (
      importer === undefined ||
      FederationChunkFilter.EXPOSES_MODULE.test(importer)
    );
  }
}
