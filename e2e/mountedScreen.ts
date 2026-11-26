import type { Page } from '@playwright/test';

/**
 * Waits until the screen `extensionId` is mounted: the host's
 * `[data-mfe-screen-container]` holds the element stamped with that
 * extension id, and the MFE rendered into it or into its shadow root.
 *
 * Waiting on the expected id, not on any mounted screen, keeps a sample
 * from ending when a different screen (such as the one the shell mounts
 * at boot) finishes first.
 */
export async function waitForMountedScreen(page: Page, extensionId: string, timeout = 30_000) {
  try {
    await page.waitForFunction(
      (id) => {
        const hosts = document.querySelectorAll('[data-mfe-screen-container] [data-extension-id]');
        for (const h of hosts) {
          const el = h as HTMLElement;
          if (el.dataset.extensionId !== id) continue;
          const root = el.shadowRoot ?? el;
          if (root.childElementCount > 0) return true;
        }
        return false;
      },
      extensionId,
      { timeout },
    );
  } catch (error) {
    throw new Error(`screen "${extensionId}" did not mount within ${timeout} ms`, { cause: error });
  }
}
