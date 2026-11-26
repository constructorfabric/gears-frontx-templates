import { describe, expect, it } from 'vitest';

import { BarrelRewritePolicy } from '../BarrelRewritePolicy';

const free = (sideEffects: string[], file: string): boolean =>
  BarrelRewritePolicy.declaresSideEffectFreedom(sideEffects, file);

describe('sideEffects patterns follow the bundler glob semantics', () => {
  it('a pattern without a slash matches the file name in any directory', () => {
    expect(free(['*.css'], 'dist/index.css')).toBe(false);
    expect(free(['*.css'], 'index.css')).toBe(false);
    expect(free(['setup.js'], 'dist/setup.js')).toBe(false);
    expect(free(['setup.js'], 'setup.js')).toBe(false);
    expect(free(['*.css'], 'dist/button.js')).toBe(true);
  });

  it('a pattern with a slash is anchored at the package root', () => {
    expect(free(['./dist/setup.js'], 'dist/setup.js')).toBe(false);
    expect(free(['dist/setup.js'], 'lib/dist/setup.js')).toBe(true);
    expect(free(['dist/*.css'], 'dist/a.css')).toBe(false);
    expect(free(['dist/*.css'], 'dist/sub/a.css')).toBe(true);
  });

  it('`**/` matches zero or more directories', () => {
    expect(free(['**/*.css'], 'a.css')).toBe(false);
    expect(free(['**/*.css'], 'dist/deep/a.css')).toBe(false);
    expect(free(['dist/**/polyfill.js'], 'dist/polyfill.js')).toBe(false);
    expect(free(['dist/**/polyfill.js'], 'dist/x/y/polyfill.js')).toBe(false);
  });
});
