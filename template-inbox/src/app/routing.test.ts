import { act, createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { contactRoute, hashOf, parseRoute, useRoute, type Route } from './routing';

describe('parseRoute', () => {
  it('opens on the dashboard for the addresses a first visit can arrive with', () => {
    // An empty fragment is what a bare origin gives; the trailing-slash and
    // unknown forms are what a hand-edited or stale link gives, and
    // `#/dashboard` is the route itself.
    for (const hash of ['', '#', '#/', '#/dashboard', '#/nowhere']) {
      expect(parseRoute(hash)).toEqual({ name: 'dashboard' });
    }
  });

  it('opens the chat section on its own route and on the address it had before', () => {
    expect(parseRoute('#/chat')).toEqual({ name: 'inbox' });
    expect(parseRoute('#/inbox')).toEqual({ name: 'inbox' });
  });

  it('separates the directory from one person', () => {
    expect(parseRoute('#/contacts')).toEqual({ name: 'contacts' });
    expect(parseRoute('#/contacts/r-26')).toEqual({ name: 'contact', contactId: 'r-26' });
  });

  it('opens the directory, rather than throwing, for a contact id that does not decode', () => {
    for (const hash of ['#/contacts/%', '#/contacts/%E0%A4', '#/contacts/%zz']) {
      expect(parseRoute(hash)).toEqual({ name: 'contacts' });
    }
  });

  it('opens the mail section on its own route', () => {
    expect(parseRoute('#/mail')).toEqual({ name: 'mail' });
  });

  it('round-trips an id through the encoding the link is written with', () => {
    // Ids are opaque to this app - whatever the backend calls a contact has to
    // survive the trip into a URL and back out of it.
    const contactId = 'r/26 +x';
    expect(parseRoute(contactRoute(contactId))).toEqual({ name: 'contact', contactId });
  });

  it('writes every route back to a fragment that parses to the same route', () => {
    const routes: Route[] = [
      { name: 'dashboard' },
      { name: 'inbox' },
      { name: 'mail' },
      { name: 'contacts' },
      { name: 'contact', contactId: 'r-3' },
    ];
    for (const route of routes) {
      expect(parseRoute(hashOf(route))).toEqual(route);
    }
  });
});

describe('useRoute', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '#');
  });

  function RouteProbe() {
    const route = useRoute();
    return createElement('output', null, route.name === 'contact' ? `contact:${route.contactId}` : route.name);
  }

  it('rewrites an unknown, a legacy or an undecodable address to the one it opened, without a history entry', () => {
    const cases: [string, string, string][] = [
      ['#/nowhere', 'dashboard', '#/dashboard'],
      ['#/inbox', 'inbox', '#/chat'],
      ['#/contacts/%E0%A4', 'contacts', '#/contacts'],
    ];
    for (const [hash, shown, rewritten] of cases) {
      window.history.replaceState(null, '', hash);
      const historyLength = window.history.length;
      const view = render(createElement(RouteProbe));

      expect(view.container.textContent).toBe(shown);
      expect(window.location.hash).toBe(rewritten);
      expect(window.history.length).toBe(historyLength);
      view.unmount();
    }
  });

  it('leaves a bare origin as it is and follows a later navigation', () => {
    window.history.replaceState(null, '', '#');
    const view = render(createElement(RouteProbe));
    expect(view.container.textContent).toBe('dashboard');
    expect(window.location.hash).toBe('');

    act(() => {
      window.location.hash = '#/contacts/r-3';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(view.container.textContent).toBe('contact:r-3');
    view.unmount();
  });
});
