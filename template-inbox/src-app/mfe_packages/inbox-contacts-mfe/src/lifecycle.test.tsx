import { act } from 'react';
import { render, waitFor, within } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES,
  FRONTX_SHARED_PROPERTY_LANGUAGE,
  FRONTX_SHARED_PROPERTY_THEME,
} from '@gears-frontx/react';
import { createMfeBridgeFixture } from '@frontx-test-utils/createMfeBridgeFixture';
import { InboxScreenLifecycle } from '@inbox-shared/lifecycle/InboxScreenLifecycle';
import { INBOX_SCREENS } from '@inbox-shared/navigation/screens';
import lifecycle, { ContactsLifecycle } from './lifecycle';
import { t } from './test-support/translate';

const EXTENSION_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~frontx.inbox_contacts.screens.contacts.v1';

type Mounted = { shadowRoot: ShadowRoot; screen: ReturnType<typeof within>; setTheme: (theme: string) => void };

type LifecycleHooks = {
  initializeStyles: (container: ShadowRoot) => void;
  renderContent: (bridge: ReturnType<typeof createMfeBridgeFixture>['bridge']) => React.ReactNode;
};

const hooks = lifecycle as unknown as LifecycleHooks;

/**
 * Puts the lifecycle's styles and content into a shadow root at a page
 * address carrying `route` inside the screen domain's entry for contacts,
 * the parts of a mount this package owns: the base class's own mount (the
 * FrontX provider, host style adoption) is the shell's and tested there. The
 * entry-addresses property is what the shell broadcasts before mounting:
 * this screen's domain key and token.
 */
function mountAt(route: string | undefined, composed = true): Mounted {
  const address = route === undefined ? `/?screen=${INBOX_SCREENS.contacts}` : `/?screen=${INBOX_SCREENS.contacts};route=${route}`;
  window.history.replaceState(null, '', composed ? address : '/');
  const fixture = createMfeBridgeFixture({
    extDomainId: 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1',
    extensionId: EXTENSION_ID,
    initialProperties: {
      [FRONTX_SHARED_PROPERTY_THEME]: 'light',
      [FRONTX_SHARED_PROPERTY_LANGUAGE]: 'en',
      ...(composed
        ? { [FRONTX_SHARED_PROPERTY_ENTRY_ADDRESSES]: { [EXTENSION_ID]: { domainKey: 'screen', extension: INBOX_SCREENS.contacts } } }
        : {}),
    },
  });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const shadowRoot = host.attachShadow({ mode: 'open' });
  hooks.initializeStyles.call(lifecycle, shadowRoot);
  const container = document.createElement('div');
  shadowRoot.appendChild(container);
  render(<>{hooks.renderContent.call(lifecycle, fixture.bridge)}</>, { container });
  return {
    shadowRoot,
    screen: within(container),
    setTheme: (theme) => act(() => fixture.setProperty(FRONTX_SHARED_PROPERTY_THEME, theme)),
  };
}

afterEach(() => {
  // Testing Library's cleanup unmounts the trees; the hosts go with the body.
  document.body.replaceChildren();
});

describe('ContactsLifecycle', () => {
  it('is the inbox screen lifecycle, exported as the module default', () => {
    expect(lifecycle).toBeInstanceOf(ContactsLifecycle);
    expect(lifecycle).toBeInstanceOf(InboxScreenLifecycle);
  });

  it("anchors the kit's tokens on the shadow host, including the dark block", () => {
    const { shadowRoot } = mountAt(undefined);
    const css = Array.from(shadowRoot.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n');

    expect(css).toContain(':host');
    expect(css).toContain('--background');
    expect(css).toContain(":host(:not([data-theme='light']))");
  });

  it('renders the directory at the screen root, inside a frame carrying the kit theme scope', async () => {
    const { shadowRoot, screen, setTheme } = mountAt(undefined);

    expect(await screen.findByRole('heading', { level: 1, name: t('all_contacts') })).toBeTruthy();
    const frame = shadowRoot.querySelector('[data-theme]');
    expect(frame?.getAttribute('data-theme')).toBe('light');
    expect(frame?.getAttribute('dir')).toBe('ltr');

    setTheme('dark');
    expect(frame?.getAttribute('data-theme')).toBe('dark');
  });

  it('keeps the portal node inside the shadow root, ahead of the screen', async () => {
    const { shadowRoot, screen } = mountAt(undefined);
    await screen.findByRole('heading', { level: 1, name: t('all_contacts') });

    const portal = shadowRoot.querySelector('[data-inbox-portal]');
    expect(portal).not.toBeNull();
    expect(portal?.getRootNode()).toBe(shadowRoot);
    expect(portal?.parentElement?.firstElementChild).toBe(portal);
  });

  it("opens a person's page from the route inside the screen's entry", async () => {
    const { screen } = mountAt('r-1');

    expect(await screen.findByText(t('qualification'))).toBeTruthy();
    // The directory stays mounted behind the page, hidden.
    expect(screen.getByRole('heading', { level: 1, hidden: true, name: t('all_contacts') })).toBeTruthy();
  });

  it('says a contact was not found for a route naming no contact', async () => {
    const { screen } = mountAt('c-42');

    expect(await screen.findByRole('heading', { level: 1, name: t('contact_not_found_title') })).toBeTruthy();
  });

  it("answers an address that names no page of the screen with the screen's own not-found", async () => {
    const { shadowRoot } = mountAt('r-1/extra');

    await waitFor(() => expect(shadowRoot.querySelector('[data-testid="contacts-route-not-found"]')).not.toBeNull());
  });

  it('matches the real URL when the shell broadcast no entry address', async () => {
    const { screen } = mountAt(undefined, false);

    expect(await screen.findByRole('heading', { level: 1, name: t('all_contacts') })).toBeTruthy();
  });

  it('names the document after the section', async () => {
    const { screen } = mountAt(undefined);
    await screen.findByRole('heading', { level: 1, name: t('all_contacts') });

    expect(document.title).toBe(t('document_title', { section: t('nav_label') }));
  });
});
