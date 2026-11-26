/**
 * `SharedSpecifierMatcher` — decides whether an import specifier names a
 * module of a shared package, by root package name: `react`,
 * `react/jsx-runtime` and `react-dom/client` all match when `react` /
 * `react-dom` are shared. Asset specifiers (`pkg/theme.css`,
 * `pkg/x.css?inline`, `pkg/package.json`) are not JavaScript modules a
 * unit can provide, so they never match — the build that imports them
 * handles them as assets.
 */

import { SharedSetResolver } from './SharedSetResolver';

export class SharedSpecifierMatcher {
  private static readonly ASSET_EXTENSION =
    /\.(css|scss|sass|less|styl|stylus|pcss|postcss|svg|png|jpe?g|gif|webp|avif|ico|bmp|woff2?|ttf|otf|eot|json|wasm|html|txt|md)$/i;

  private readonly roots: ReadonlySet<string>;

  constructor(sharedNames: Iterable<string>) {
    this.roots = new Set(
      [...sharedNames].map(SharedSetResolver.extractRootPackageName)
    );
  }

  /**
   * Whether `specifier` is a bare JavaScript module specifier: not
   * relative, not absolute, no URL scheme, no query or hash, no asset
   * extension.
   */
  static isBareModuleSpecifier(specifier: string): boolean {
    if (specifier === '' || specifier.startsWith('.') || specifier.startsWith('/')) {
      return false;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(specifier)) return false;
    if (specifier.includes('?') || specifier.includes('#')) return false;
    return !SharedSpecifierMatcher.ASSET_EXTENSION.test(specifier);
  }

  /** Whether `specifier` names a module of a shared package. */
  matches(specifier: string): boolean {
    return (
      SharedSpecifierMatcher.isBareModuleSpecifier(specifier) &&
      this.roots.has(SharedSetResolver.extractRootPackageName(specifier))
    );
  }

  /** Whether `rootName` is a shared root package. */
  hasRoot(rootName: string): boolean {
    return this.roots.has(rootName);
  }
}
