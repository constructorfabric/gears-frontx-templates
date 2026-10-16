/**
 * Tells the header whether something else on the page already supplies its
 * level-one heading.
 *
 * A page needs exactly one h1 (axe: page-has-heading-one; the design
 * guidelines ask for one page heading). Screens usually render their own, but
 * they mount inside open shadow roots the shell does not render, so the header
 * cannot know from its own props or state whether one exists. It watches the
 * document instead, shadow roots included, the same way axe reads it: an
 * `h1` without a role, or an element with `role="heading"` and
 * `aria-level="1"`.
 */
import { useEffect, useState, type RefObject } from 'react';

const HEADING_ONE = 'h1:not([role]), [role="heading"][aria-level="1"]';

/** The document and every open shadow root below it, outermost first. */
function collectRoots(root: Document | ShadowRoot, into: (Document | ShadowRoot)[]): void {
  into.push(root);
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) collectRoots(el.shadowRoot, into);
  }
}

function hasOtherHeadingOne(roots: readonly (Document | ShadowRoot)[], own: Element | null): boolean {
  return roots.some((root) => Array.from(root.querySelectorAll(HEADING_ONE)).some((el) => el !== own));
}

/**
 * `true` while any level-one heading other than `ownHeading` is in the
 * document or in an open shadow root. Re-checked in the frame after any DOM
 * change, inside shadow roots too, so a screen that mounts, swaps or drops its
 * heading later is followed.
 */
export function useOtherHeadingOne(ownHeading: RefObject<Element | null>): boolean {
  const [present, setPresent] = useState(false);

  useEffect(() => {
    const observed = new WeakSet<Node>();
    // A busy screen mutates often and each check walks the whole document, so
    // the checks a burst of mutations asks for collapse into one per frame.
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame === 0) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          check();
        });
      }
    });
    const options: MutationObserverInit = {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['role', 'aria-level'],
    };

    function check(): void {
      const roots: (Document | ShadowRoot)[] = [];
      collectRoots(document, roots);
      // A shadow root's own changes never reach an observer on the document,
      // so each one gets observed the first time it is seen.
      for (const root of roots) {
        if (!observed.has(root)) {
          observed.add(root);
          observer.observe(root, options);
        }
      }
      setPresent(hasOtherHeadingOne(roots, ownHeading.current));
    }

    check();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [ownHeading]);

  return present;
}
