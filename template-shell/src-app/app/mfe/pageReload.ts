/**
 * The reload seam behind the shell's `refresh_page` chrome action.
 *
 * The action's whole behaviour is one browser call, and a test cannot observe
 * `window.location.reload` (jsdom implements no navigation), so the call sits
 * in its own function: the handler calls this, and a test replaces this module
 * to watch the reload happen without navigating anywhere.
 */
export function reloadPage(): void {
  window.location.reload();
}
