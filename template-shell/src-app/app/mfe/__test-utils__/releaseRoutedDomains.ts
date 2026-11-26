/**
 * The teardown of the popup and screen domain routes, shared by the
 * default-screen and modal suites.
 *
 * `MfeScreenContainer` registers both routed domains (the screen one and the
 * shell's modal domain on the popup one), and the routed-route registry is a
 * realm slot (`Symbol.for` on `globalThis`), so the routes survive a module
 * reset: the next case or file must find them free. The two ids are the
 * framework's own domain constants, re-exported here under the names the
 * suites use, so a release can never name a different id than the container
 * registered.
 *
 * Both unregistrations always run. Awaited one after the other, a rejection
 * in the first would skip the second; in a `finally`, a rejection of the second
 * would replace the error of the first. Settling both promises releases both
 * routes and keeps every failure.
 */

import { FRONTX_POPUP_DOMAIN, FRONTX_SCREEN_DOMAIN } from '../../../../src/index';

/** The popup domain the shell's modal extension domain is registered under. */
export const POPUP_DOMAIN = FRONTX_POPUP_DOMAIN;

/** The screen domain the shell's screen extension domain is registered under. */
export const SCREEN_DOMAIN = FRONTX_SCREEN_DOMAIN;

/** The one method the teardown needs from the MFE registry. */
export interface RoutedDomainRegistry {
  unregisterDomain(domainId: string): Promise<void>;
}

/** Every rejection of one release, in the order the domains were released. */
export class RoutedDomainReleaseError extends Error {
  readonly reasons: unknown[];

  constructor(reasons: unknown[]) {
    super(
      `the routed domains were not all released: ${reasons
        .map((reason) => String(reason))
        .join('; ')}`,
    );
    this.name = 'RoutedDomainReleaseError';
    this.reasons = reasons;
  }
}

/**
 * Unregisters both routed domains and throws a `RoutedDomainReleaseError` of
 * every rejection, so a failed teardown reports both domains instead of the
 * last one only.
 */
export async function releaseRoutedDomains(registry: RoutedDomainRegistry): Promise<void> {
  const results = await Promise.allSettled([
    registry.unregisterDomain(POPUP_DOMAIN),
    registry.unregisterDomain(SCREEN_DOMAIN),
  ]);
  const reasons = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
  if (reasons.length > 0) {
    throw new RoutedDomainReleaseError(reasons);
  }
}
