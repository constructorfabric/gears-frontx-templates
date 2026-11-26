/**
 * `EmptyCssRecorder` — the plugin that records which stylesheets compile
 * to the empty string, so the CSS-delivery guard skips them.
 *
 * Invariant: a stylesheet that compiles to no CSS needs no delivery —
 * Vite links no rules for it, so no emitted CSS file carries it — and it
 * must never fail the guard (with per-chunk CSS it is the only thing the
 * guard can fire on). `vite:css` hands every stylesheet's compiled CSS
 * to the next transform in the chain, and `vite:css-post` stores exactly
 * that string per module id and later concatenates it into the chunk's
 * CSS file, so a recorded id contributes nothing to any emitted file.
 *
 * The main plugin is `enforce: 'post'`, whose transform would only see
 * the empty module `vite:css-post` leaves behind, and an `order: 'pre'`
 * transform would see the raw source instead; so the recorder is a
 * plugin of its own, never listed by the user: the main plugin's
 * `configResolved` ({@link place}) splices it into the resolved plugin
 * list immediately before `vite:css-post`, the last transform every
 * stylesheet's compiled CSS flows through before `vite:css-post` stores
 * it — wherever the user lists the plugin, so a plugin after it that
 * fills an empty stylesheet is seen before the recording, not after it.
 * When `vite:css-post` cannot be found, the recorder is not placed,
 * records nothing and a warning says so: the guard then counts every
 * stylesheet, an empty one too.
 *
 * The recording starts empty for every build (`configResolved` runs
 * once per build, not on a watch rebuild) and persists across a watch
 * rebuild: Rollup replays a rebuild's cached transforms without running
 * them, so a stylesheet that did not change keeps its last recorded
 * state, and one that did change runs the transform again, which
 * records it afresh.
 */

import type { Plugin, ResolvedConfig } from 'vite';

import { CssAttributor } from './CssAttributor';

export class EmptyCssRecorder {
  private readonly emptyCssModuleIds: Set<string>;
  private readonly plugin: Plugin;

  /** @param emptyCssModuleIds the build state's recording, filled in place. */
  constructor(emptyCssModuleIds: Set<string>) {
    this.emptyCssModuleIds = emptyCssModuleIds;
    const recorded = emptyCssModuleIds;
    this.plugin = {
      name: 'gears-frontx-vite-plugin-mfe-gts-empty-css-recorder',
      transform: {
        handler(code, id) {
          if (!CssAttributor.isDeliverableCssModule(id)) return;
          if (code === '') recorded.add(id);
          else recorded.delete(id);
        },
      },
    };
  }

  /**
   * Called from the main plugin's `configResolved`: starts the build's
   * recording empty and splices the recorder into the resolved plugin
   * list right before `vite:css-post`. Vite's per-hook sort cache reads
   * `config.plugins` after the `configResolved` hooks have run, so the
   * placement is final for every build of this config; it is made for
   * the single-environment `vite build` every MFE runs. Returns whether
   * the recorder was placed.
   */
  place(config: ResolvedConfig): boolean {
    this.emptyCssModuleIds.clear();
    // A resolved Vite config always lists its plugins; a partial config
    // (a hook driven by hand) has nothing to place the recorder in.
    if (!Array.isArray(config.plugins)) return false;
    const plugins = config.plugins as Plugin[];
    const existing = plugins.indexOf(this.plugin);
    if (existing !== -1) plugins.splice(existing, 1);
    const cssPostIndex = plugins.findIndex((plugin) => plugin.name === 'vite:css-post');
    if (cssPostIndex === -1) {
      config.logger.warn(
        '[vite-plugin-mfe-gts] could not place the empty-CSS recorder before vite:css-post ' +
          '(vite:css-post was not found among the resolved plugins); empty-stylesheet ' +
          'exclusions are off for this build, so the CSS-delivery guard counts every stylesheet'
      );
      return false;
    }
    plugins.splice(cssPostIndex, 0, this.plugin);
    return true;
  }
}
