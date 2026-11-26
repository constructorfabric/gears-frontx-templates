/**
 * `CssAttributor` — CSS attribution for the MFE build: decides which
 * emitted CSS files each expose reaches and guards that no stylesheet an
 * expose needs is left undeliverable to the MFE's shadow root.
 *
 * Kit CSS reaches a screen only through its manifest, like every other
 * stylesheet: the host document holds only the kit components the host
 * itself uses. So every stylesheet counts — the package's own and those
 * from `node_modules` alike (a stylesheet a shared package's module
 * loads is imported into the MFE's own CSS at build time, see
 * `SharedStylesheetImports`) — except one that compiles to no CSS, which
 * needs no delivery.
 */

import type { CapturedChunk, FederationExpose } from './types';

export class CssAttributor {
  /**
   * The `cssModules` capture filter, applied to a raw Rollup module id:
   * every stylesheet Vite extracts, `node_modules` ones included, because
   * kit CSS must reach a screen through its manifest like any other
   * stylesheet.
   */
  static isDeliverableCssModule(moduleId: string): boolean {
    return CssAttributor.isExtractedStylesheet(moduleId);
  }

  /**
   * The stylesheet modules of a chunk the CSS-delivery guard counts:
   * every stylesheet Vite extracts whose compiled CSS is not the empty
   * string. A stylesheet that compiles to no CSS needs no delivery — Vite
   * links no rules for it, so no emitted CSS file carries it — and must
   * never fail the guard: it is the only thing that guard can fire on in
   * a build with per-chunk CSS, since a chunk holding CSS with rules
   * emits a file the attribution lists. `emptyCssModuleIds` is the empty
   * stylesheet recorder's recording (`EmptyCssRecorder`).
   */
  static deliverableCssModules(
    moduleIds: readonly string[],
    emptyCssModuleIds: ReadonlySet<string>
  ): string[] {
    return moduleIds.filter(
      (id) => CssAttributor.isDeliverableCssModule(id) && !emptyCssModuleIds.has(id)
    );
  }

  /**
   * Whether a module id is a stylesheet Vite extracts into a CSS file:
   * any language Vite compiles to CSS, except the queries Vite's CSS
   * plugins leave out of the extracted CSS (`?inline`, `?raw`, `?url`,
   * `?worker`, `?sharedworker`, `?commonjs-proxy`, `?transform-only`).
   */
  static isExtractedStylesheet(moduleId: string): boolean {
    const [pathPart, query] = moduleId.split('?', 2);
    if (!/\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)$/.test(pathPart)) {
      return false;
    }
    return (
      query === undefined ||
      !/(^|&)(inline|raw|url|worker|sharedworker|commonjs-proxy|transform-only)(=|&|$)/.test(
        query
      )
    );
  }

  /**
   * Whether Vite removes a rendered chunk as CSS-only in `generateBundle`
   * and rewrites every `import()` of it to an empty promise: a chunk that
   * exports nothing, holds extracted stylesheets and no CSS Module, and
   * whose other modules render to no code.
   */
  static isCssOnlyChunk(chunk: {
    exports: string[];
    moduleIds: string[];
    isEntry: boolean;
    modules: Record<string, { renderedLength: number }>;
  }): boolean {
    const stylesheets = chunk.moduleIds.filter(
      CssAttributor.isExtractedStylesheet
    );
    return (
      chunk.exports.length === 0 &&
      stylesheets.length > 0 &&
      !stylesheets.some((id) =>
        /\.module\.[a-z]+$/.test(id.split('?', 1)[0])
      ) &&
      chunk.moduleIds.every(
        (id) =>
          CssAttributor.isExtractedStylesheet(id) ||
          (!chunk.isEntry && chunk.modules[id]?.renderedLength === 0)
      )
    );
  }

  /**
   * Attributes to each expose the CSS files of every chunk it reaches, in
   * place on `exposes`; returns whether any list changed.
   *
   * The host injects into a screen's shadow root exactly the CSS files
   * the manifest attributes to its expose, appending them in list order.
   * `@module-federation/vite` lists only the CSS of the expose's own
   * chunk, so CSS Rollup hoists into a chunk several exposes share, or
   * into a chunk the expose reaches only through a dynamic import,
   * reaches no screen. This rebuilds both lists from the chunk graph,
   * dependencies before their importers (post-order), the order Vite
   * itself links CSS in, so a chunk's rules still follow the rules of
   * what it imports. `css.sync` takes the CSS of chunks reached through
   * static imports from the expose's sync JS, which ends with the
   * expose's own CSS; `css.async` takes the CSS of chunks reached only
   * through dynamic imports, each lazy chunk after its static
   * dependencies. Every file the walk reaches is listed,
   * `node_modules`-only ones included. A file federation lists in
   * `css.sync` moves to walk order when the static walk reaches it and
   * otherwise keeps its place ahead of the walk's files; `css.async`
   * keeps federation's files first.
   */
  static attributeReachableChunkCss(
    exposes: FederationExpose[],
    chunks: ReadonlyMap<string, CapturedChunk>
  ): boolean {
    let changed = false;
    for (const expose of exposes) {
      const { css, js } = expose.assets;

      const staticSeen = new Set<string>();
      const staticCss: string[] = [];
      const visitStatic = (fileName: string): void => {
        if (staticSeen.has(fileName)) return;
        staticSeen.add(fileName);
        const chunk = chunks.get(fileName);
        if (!chunk) return;
        chunk.imports.forEach(visitStatic);
        staticCss.push(...chunk.cssAssets);
      };
      js.sync.forEach(visitStatic);

      const lazySeen = new Set<string>(staticSeen);
      const lazyCss: string[] = [];
      const lazyRoots = [
        ...js.async,
        ...[...staticSeen].flatMap((f) => chunks.get(f)?.dynamicImports ?? []),
      ];
      const visitLazy = (fileName: string): void => {
        if (lazySeen.has(fileName)) return;
        lazySeen.add(fileName);
        const chunk = chunks.get(fileName);
        if (!chunk) return;
        chunk.imports.forEach(visitLazy);
        lazyCss.push(...chunk.cssAssets);
        lazyRoots.push(...chunk.dynamicImports);
      };
      for (let i = 0; i < lazyRoots.length; i++) visitLazy(lazyRoots[i]);

      const walked = new Set(staticCss);
      const sync = [
        ...new Set([...css.sync.filter((f) => !walked.has(f)), ...staticCss]),
      ];
      const inSync = new Set(sync);
      const async = [...new Set([...css.async, ...lazyCss])].filter(
        (f) => !inSync.has(f)
      );
      if (
        sync.join('\n') !== css.sync.join('\n') ||
        async.join('\n') !== css.async.join('\n')
      ) {
        css.sync = sync;
        css.async = async;
        changed = true;
      }
    }
    return changed;
  }

  /**
   * Detects CSS an expose needs at runtime but that the federation
   * manifest does not attribute to it: CSS that can never reach the MFE's
   * shadow root.
   *
   * Runs after {@link attributeReachableChunkCss}, which places every CSS
   * file Vite emitted per chunk. For each expose whose manifest
   * attributes no CSS at all: walk the chunk graph reachable from its
   * declared JS assets (static and dynamic imports) and collect the CSS
   * modules found there, the package's own and `node_modules` ones (kit
   * CSS): every stylesheet the walk reaches must be deliverable through
   * the manifest. Stylesheets whose compiled CSS is empty are not in the
   * walk's `cssModules` (see {@link deliverableCssModules}): they need no
   * delivery and never fail the guard. An expose that does declare CSS
   * is trusted.
   */
  static findUndeclaredExposeCss(
    exposes: readonly FederationExpose[],
    chunks: ReadonlyMap<string, CapturedChunk>
  ): Array<{ exposePath: string; missingCss: string[] }> {
    const results: Array<{ exposePath: string; missingCss: string[] }> = [];
    for (const expose of exposes) {
      if (
        expose.assets.css.sync.length > 0 ||
        expose.assets.css.async.length > 0
      ) {
        continue;
      }
      const needed = new Set<string>();
      const queue = [...expose.assets.js.sync, ...expose.assets.js.async];
      const seen = new Set<string>(queue);
      while (queue.length > 0) {
        const chunk = chunks.get(queue.pop() as string);
        if (!chunk) continue;
        for (const css of chunk.cssModules) needed.add(css);
        for (const next of [...chunk.imports, ...chunk.dynamicImports]) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      if (needed.size > 0) {
        results.push({ exposePath: expose.path, missingCss: [...needed] });
      }
    }
    return results;
  }

  /**
   * Formats the guard failure. The plugin builds with per-chunk CSS
   * (`build.cssCodeSplit: true` is enforced), which lets it attribute
   * each file, kit CSS from `node_modules` and CSS Modules included, to
   * the exposes that reach it; for a plain stylesheet owned by one
   * lifecycle, inlining also works: `?inline` turns it into a string
   * bundled with the lifecycle chunk, and `initializeStyles()` (the
   * `ThemeAwareReactLifecycle` hook) appends it to the mount container; a
   * CSS Module imported that way loses its class map. See the
   * `mfe-package-contract` guideline, "CSS delivery" section.
   */
  static formatUndeclaredExposeCssError(
    findings: ReadonlyArray<{ exposePath: string; missingCss: string[] }>
  ): string {
    const lines = findings.map(
      (f) => `  - expose '${f.exposePath}' needs: ${f.missingCss.join(', ')}`
    );
    return (
      `[vite-plugin-mfe-gts] CSS imported by an exposed module was not ` +
      `attributed to that expose in mf-manifest.json — the host injects ` +
      `only manifest-attributed CSS into the MFE's shadow root, so these ` +
      `styles would silently never render:\n${lines.join('\n')}\n` +
      `Fix: keep build.cssCodeSplit: true (the plugin enforces it) so ` +
      `each chunk's CSS gets a file the build attributes to every expose ` +
      `that reaches it (this covers kit CSS from node_modules, and is the ` +
      `only delivery for a CSS Module), or, for a plain package stylesheet ` +
      `owned by one lifecycle, import it with '?inline' and append it in ` +
      `an initializeStyles() override (see the mfe-package-contract ` +
      `guideline, "CSS delivery").`
    );
  }
}
