import { FRONTX_THEME_HOST_ATTRIBUTE } from '@gears-frontx/react';
import type { ContainerHooks } from '@gears-frontx/react';

/**
 * Container hooks that keep a domain's occupancy store in step with the
 * element map the mount strategy holds, shared by the screen and the modal
 * domain implementations (`screenDomain.ts`, `modalDomain.ts`): `create`
 * records the container element and names the extension as the domain's
 * mounted one, `destroy` forgets both when the strategy releases them.
 *
 * @param store - The occupancy store of the domain the hooks serve, the shape
 *   of `screenState` and of the modal domain's `modalState`.
 */
export function createElementTrackingHooks(store: {
  getSnapshot(): string | undefined;
  set(id: string | undefined): void;
}): ContainerHooks {
  const elements = new Map<string, HTMLElement>();
  return {
    create(extensionId: string): Element {
      const el = document.createElement('div');
      el.dataset.extensionId = extensionId;
      // The theme host attribute: the theme registry's managed rule names it as
      // its second selector, so a shell theme value declared on the document
      // root reaches the extension host. Inside the shadow root the kit's sheet
      // is re-anchored to `:host`, and that declaration would beat one
      // inherited from the document tree; an outer-tree rule beats a `:host`
      // rule before specificity is compared, but only a rule that names this
      // element can apply to it.
      el.setAttribute(FRONTX_THEME_HOST_ATTRIBUTE, '');
      el.style.height = '100%';
      elements.set(extensionId, el);
      store.set(extensionId);
      return el;
    },
    destroy(extensionId: string, container?: Element): void {
      if (!container || elements.get(extensionId) === container) {
        elements.delete(extensionId);
      }
      if (store.getSnapshot() === extensionId) store.set(undefined);
    },
  };
}
