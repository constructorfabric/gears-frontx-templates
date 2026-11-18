/**
 * The release helper the default-screen and modal teardowns call: both routed
 * domains are unregistered, and a failure of one does not hide the other.
 */
import { describe, expect, it } from 'vitest';
import {
  POPUP_DOMAIN,
  RoutedDomainReleaseError,
  releaseRoutedDomains,
  SCREEN_DOMAIN,
} from './__test-utils__/releaseRoutedDomains';

describe('releaseRoutedDomains', () => {
  it('unregisters the popup and the screen domain', async () => {
    const released: string[] = [];

    await releaseRoutedDomains({
      async unregisterDomain(domainId) {
        released.push(domainId);
      },
    });

    expect(released).toEqual([POPUP_DOMAIN, SCREEN_DOMAIN]);
  });

  it('releases the other domain and keeps both errors when one rejects', async () => {
    const released: string[] = [];
    const popupError = new Error('the popup domain refused');
    const screenError = new Error('the screen domain refused');

    const failure = await releaseRoutedDomains({
      async unregisterDomain(domainId) {
        released.push(domainId);
        throw domainId === POPUP_DOMAIN ? popupError : screenError;
      },
    }).catch((error: unknown) => error);

    // Both routes are handed back even though both calls rejected ...
    expect(released).toEqual([POPUP_DOMAIN, SCREEN_DOMAIN]);
    // ... and the teardown reports both failures, not the last one only.
    expect(failure).toBeInstanceOf(RoutedDomainReleaseError);
    expect((failure as RoutedDomainReleaseError).reasons).toEqual([popupError, screenError]);
  });
});
