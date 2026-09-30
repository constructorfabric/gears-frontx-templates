import { describe, expect, it } from 'vitest';
import { isSafeLinkHref } from './ConversationThread';

describe('isSafeLinkHref', () => {
  it('opens absolute http, https and mailto links', () => {
    for (const href of ['https://example.com/help', 'http://example.com', 'mailto:help@example.com']) {
      expect(isSafeLinkHref(href)).toBe(true);
    }
  });

  it('refuses a script, a data URL, a relative path and anything that is not a URL', () => {
    for (const href of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,<p>x</p>', '#', '/inbox', 'not a url', '']) {
      expect(isSafeLinkHref(href)).toBe(false);
    }
  });
});
