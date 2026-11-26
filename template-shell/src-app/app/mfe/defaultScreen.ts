/**
 * The default screen: the one the shell opens when the address names none.
 *
 * The menu owns the order screens are presented in, so the selection lives
 * next to it rather than beside a second copy of the sort: the default screen
 * is the menu's first item by definition, and one function serving both keeps
 * them from drifting apart.
 */

import { screenDomain, type ScreenExtension } from '../../../src/index';

/** A screen extension as the registry hands it out: without its `route`, which only the injected router receives. */
export type RegistryScreenExtension = Omit<ScreenExtension, 'route'>;

/** The order a screen without one sorts at, the fallback the menu has always used. */
const ORDER_WITHOUT_ONE = 999;

/**
 * The screens in menu order: only screens that carry `presentation` (the same
 * ones the menu lists), lowest `presentation.order` first, a screen without an
 * order at the `ORDER_WITHOUT_ONE` mark, ties in registration order. Returns a
 * new array; the registry's own list is left untouched.
 *
 * The registry types `presentation` as present on a screen extension, but
 * nothing between the manifest and `registry.registerExtension` checks it, so
 * an extension without it is dropped here instead of throwing mid-sort.
 */
export function screensInMenuOrder(extensions: readonly RegistryScreenExtension[]): RegistryScreenExtension[] {
  return extensions
    .filter((extension) => extension?.presentation)
    // sort() runs on the new array filter() returns, so the caller's list (the registry's) is never
    // reordered; on equal orders the comparator returns 0, so ties keep registration order (sort is stable).
    .sort(
      (a, b) => (a.presentation.order ?? ORDER_WITHOUT_ONE) - (b.presentation.order ?? ORDER_WITHOUT_ONE),
    );
}

/**
 * The screen to open when the address names none: the first item of the menu,
 * or `undefined` when there are no screens to open.
 */
export function firstScreenId(extensions: readonly RegistryScreenExtension[]): string | undefined {
  return screensInMenuOrder(extensions)[0]?.id;
}

/**
 * The screen entry the address carries under the screen domain's route key
 * (`?screen=...`), or `undefined` when it names none. An empty value (`?screen=`
 * or a bare `?screen`) names no entry either: only a non-empty value names one.
 * A domain declaration without a route is not routed, so no address can name
 * an entry for one.
 *
 * @param search - The query string to read; the live address's by default.
 */
export function addressScreenEntry(
  search: string = window.location.search,
  routeKey: string | undefined = screenDomain.route,
): string | undefined {
  if (!routeKey) return undefined;
  return new URLSearchParams(search).get(routeKey) || undefined;
}
