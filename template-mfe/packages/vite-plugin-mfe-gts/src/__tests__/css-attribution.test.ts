/**
 * CSS attribution: extracted-stylesheet detection, deliverable
 * stylesheet modules, reachable-chunk attribution (kit CSS from
 * node_modules included), and the undeclared-CSS guard.
 */

import { describe, expect, it } from 'vitest';
import { CssAttributor } from '../CssAttributor';
import type { CapturedChunk, FederationExpose } from '../types';

const chunk = (partial: Partial<CapturedChunk>): CapturedChunk => ({
  fileName: 'x.js',
  cssAssets: [],
  imports: [],
  dynamicImports: [],
  cssModules: [],
  ...partial,
});

const expose = (cssSync: string[] = [], jsSync: string[] = []): FederationExpose => ({
  id: 'e',
  name: 'e',
  path: './lifecycle',
  assets: {
    js: { sync: jsSync, async: [] },
    css: { sync: cssSync, async: [] },
  },
});

describe('CssAttributor', () => {
  it('detects extracted stylesheets and excludes query forms', () => {
    expect(CssAttributor.isExtractedStylesheet('/a/b.css')).toBe(true);
    expect(CssAttributor.isExtractedStylesheet('/a/b.scss')).toBe(true);
    expect(CssAttributor.isExtractedStylesheet('/a/b.css?inline')).toBe(false);
    expect(CssAttributor.isExtractedStylesheet('/a/b.ts')).toBe(false);
  });

  it('deliverable CSS modules include node_modules and skip the recorded empty ones', () => {
    expect(
      CssAttributor.deliverableCssModules(
        [
          '/pkg/src/x.css',
          '/pkg/node_modules/lib/x.css',
          '/pkg/src/empty.css',
          '/pkg/src/x.css?inline',
          '/pkg/src/a.ts',
        ],
        new Set(['/pkg/src/empty.css'])
      )
    ).toEqual(['/pkg/src/x.css', '/pkg/node_modules/lib/x.css']);
  });

  it('attributes kit CSS from node_modules like any other chunk CSS', () => {
    const chunks = new Map<string, CapturedChunk>([
      ['life.js', chunk({ fileName: 'life.js', imports: ['kit.js'], cssAssets: ['life.css'] })],
      ['kit.js', chunk({ fileName: 'kit.js', cssAssets: ['kit-button.css'] })],
    ]);
    const e = expose([], ['life.js']);
    CssAttributor.attributeReachableChunkCss([e], chunks);
    expect(e.assets.css.sync).toEqual(['kit-button.css', 'life.css']);
  });

  it('attributes reachable chunk CSS to exposes', () => {
    const chunks = new Map<string, CapturedChunk>([
      ['life.js', chunk({ fileName: 'life.js', imports: ['dep.js'], cssAssets: ['life.css'] })],
      ['dep.js', chunk({ fileName: 'dep.js', cssAssets: ['dep.css'] })],
    ]);
    const e = expose([], ['life.js']);
    const changed = CssAttributor.attributeReachableChunkCss([e], chunks);
    expect(changed).toBe(true);
    expect(e.assets.css.sync).toEqual(['dep.css', 'life.css']);
  });

  it('flags CSS not attributed to an expose', () => {
    const chunks = new Map<string, CapturedChunk>([
      ['life.js', chunk({ fileName: 'life.js', cssModules: ['/pkg/src/x.css'] })],
    ]);
    const findings = CssAttributor.findUndeclaredExposeCss(
      [expose([], ['life.js'])],
      chunks
    );
    expect(findings).toEqual([
      { exposePath: './lifecycle', missingCss: ['/pkg/src/x.css'] },
    ]);
    expect(CssAttributor.formatUndeclaredExposeCssError(findings)).toContain(
      "'./lifecycle'"
    );
  });
});
