/**
 * Tells the header whether something else on the page already supplies its
 * level-one heading.
 *
 * A page needs exactly one h1 (axe: page-has-heading-one; the design
 * guidelines ask for one page heading). Screens usually render their own, but
 * they mount inside open shadow roots the shell does not render, so the header
 * cannot know from its own props or state whether one exists. It watches the
 * document instead, shadow roots included. It uses axe's heading-one selector
 * and approximates screen reader visibility with hidden, aria-hidden and
 * checkVisibility (display, content-visibility, visibility, closed details).
 */
import { useEffect, useState, type RefObject } from 'react';

const HEADING_ONE = 'h1:not([role], [aria-level]), :is(h1, h2, h3, h4, h5, h6):not([role])[aria-level="1"], [role="heading"][aria-level="1"]';

/** The document and every open shadow root below it, outermost first. */
function collectRoots(root: Document | ShadowRoot, into: (Document | ShadowRoot)[]): void {
  into.push(root);
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) collectRoots(el.shadowRoot, into);
  }
}

/**
 * `el` and its ancestors in the flat tree, innermost first: a slotted element's
 * next ancestor is its slot, a shadow root's top element's is the host.
 */
function flatTreeChain(el: Element): Element[] {
  const chain: Element[] = [];
  for (let current: Element | null = el; current;) {
    chain.push(current);
    const root: Node = current.getRootNode();
    current = current.assignedSlot ?? current.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
  }
  return chain;
}

// `inert` is not checked: the shell makes the header inert together with the
// screen (narrow menu overlay), so counting it would not leave an h1 reachable.
function visibleToScreenReaders(chain: readonly Element[]): boolean {
  const [el] = chain;
  // `visibility` is inherited, so the heading's own computed value covers its
  // ancestors, also where checkVisibility ignores visibilityProperty. Without
  // checkVisibility, `display` is not checked.
  if (getComputedStyle(el).visibility !== 'visible') return false;
  if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ visibilityProperty: true })) return false;
  return !chain.some((node) => node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true');
}

/** Every level-one heading other than `own`, visible or not, in any of `roots`. */
function otherHeadingsOne(roots: readonly (Document | ShadowRoot)[], own: Element | null): Element[] {
  return roots.flatMap((root) => Array.from(root.querySelectorAll(HEADING_ONE)).filter((el) => el !== own));
}


/**
 * `true` while any level-one heading other than `ownHeading` is in the
 * document or in an open shadow root. Re-checked in the frame after a DOM
 * change, inside shadow roots too, or a resize, so a screen that mounts, swaps,
 * hides or drops its heading later is followed.
 */
export function useOtherHeadingOne(ownHeading: RefObject<Element | null>): boolean {
  const [present, setPresent] = useState(false);

  useEffect(() => {
    const observed = new WeakSet<Node>();
    // A busy screen mutates often and each check walks the whole document, so
    // the checks a burst of mutations asks for collapse into one per frame.
    let frame = 0;
    const schedule = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          check();
        });
      }
    };
    // A class, style or data-state change can hide or show a heading through
    // CSS, but such changes are frequent (animations, widget states), so only
    // one on another heading or on one of its flat-tree ancestors (as of the
    // last check) asks for a check. A heading hidden through a sibling
    // selector or a stylesheet change is followed at the next check.
    const cssOnly = new Set(['class', 'style', 'data-state']);
    let watched = new Set<Node>();
    const touchesHeading = (target: Node): boolean => watched.has(target);
    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some(
        (m) => m.type === 'childList' || !cssOnly.has(m.attributeName ?? '') || touchesHeading(m.target),
      );
      if (relevant) schedule();
    });
    const options: MutationObserverInit = {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['role', 'aria-level', 'hidden', 'aria-hidden', 'open', 'slot', 'name', 'class', 'style', 'data-state'],
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
      const chains = otherHeadingsOne(roots, ownHeading.current).map(flatTreeChain);
      watched = new Set(chains.flat());
      setPresent(chains.some(visibleToScreenReaders));
    }

    check();
    // Media queries can hide or show a heading without any DOM change.
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [ownHeading]);

  return present;
}
