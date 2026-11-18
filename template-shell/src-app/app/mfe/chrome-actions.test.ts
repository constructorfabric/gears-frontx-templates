/**
 * Covers the admission half of the chrome contract: which domain a
 * microfrontend may aim a chrome action at. Exercised against the real type
 * system rather than a double, because the behaviour under test is `x-gts-instance-ref`
 * resolution inside gts-ts — the same call the mediator makes on every action
 * of a chain before any handler is looked up.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import {
  FRONTX_POPUP_DOMAIN,
  FRONTX_SCREEN_DOMAIN,
  gtsPlugin,
  popupDomain,
  screenDomain,
  sidebarDomain,
  type JSONSchema,
} from '@gears-frontx/react';
// The GTS solution schemas are application-layer and owned by the template
// package; `@gears-frontx/react` stopped re-exporting them so that framework and
// react resolve for a consumer outside this workspace (#601). `main.tsx` reaches
// for them the same way.
import {
  extensionScreenSchema,
  languageCodeSchema,
  languageSchema,
  themeSchema,
} from '@gears-frontx/frontx-template-shell';

import {
  CHROME_ACTION_SCHEMAS,
  CHROME_MODAL_ACTION_SCHEMAS,
  CHROME_REFRESH_PAGE,
  CHROME_SET_LANGUAGE,
  CHROME_SET_MENU_COLLAPSED,
  CHROME_SET_THEME,
  CHROME_SIGN_IN,
} from './chrome-actions';

/** Every chrome action type with a payload its schema accepts, so a case
 * that fails does so over the target and nothing else. */
const CHROME_ACTIONS = [
  { type: CHROME_SET_THEME, payload: { themeId: 'dark' } },
  { type: CHROME_SET_MENU_COLLAPSED, payload: { collapsed: true } },
  { type: CHROME_SET_LANGUAGE, payload: { language: 'es' } },
] as const;

/** The payload-less chrome actions and the domain each one is answered on. */
const CHROME_ACTIONS_WITHOUT_PAYLOAD = [
  { name: 'sign_in', type: CHROME_SIGN_IN, target: FRONTX_POPUP_DOMAIN },
  { name: 'refresh_page', type: CHROME_REFRESH_PAGE, target: FRONTX_SCREEN_DOMAIN },
] as const;

/** The schema carrying `actionTypeId`, found by its `$id` rather than by
 * position, so the pairing is asserted instead of assumed. */
function schemaFor(actionTypeId: string): JSONSchema {
  const schema = [...CHROME_ACTION_SCHEMAS, ...CHROME_MODAL_ACTION_SCHEMAS].find(
    (candidate) => candidate.$id === `gts://${actionTypeId}`,
  );
  if (!schema) {
    throw new Error(`no chrome action schema carries the id 'gts://${actionTypeId}'`);
  }
  return schema;
}

/** The `target` ref a schema declares, narrowed off the index signature
 * `JSONSchema` ends in rather than cast through it. */
function targetRefOf(schema: JSONSchema): string {
  const ref = schema.properties?.target?.['x-gts-instance-ref'];
  if (typeof ref !== 'string') {
    throw new Error(`the schema '${schema.$id ?? '(no id)'}' declares no string target x-gts-instance-ref`);
  }
  return ref;
}

beforeAll(() => {
  // The process-wide `gtsPlugin` singleton, as the app itself uses it. Nothing
  // registered here is case-specific: the schemas and the three domain instances
  // are static, registering a type that is already registered leaves it
  // unchanged, and the actions the cases below register are anonymous, so no
  // case can leave state another one reads.
  //
  // The shared-property and screen-extension schemas come first because both
  // layout domain instances reference them; without them the domains fail their
  // own admission and every case would refuse over a missing domain rather than
  // over the target pattern.
  gtsPlugin.registerSchema(themeSchema);
  gtsPlugin.registerSchema(languageCodeSchema);
  gtsPlugin.registerSchema(languageSchema);
  gtsPlugin.registerSchema(extensionScreenSchema);
  for (const schema of [...CHROME_ACTION_SCHEMAS, ...CHROME_MODAL_ACTION_SCHEMAS]) {
    gtsPlugin.registerSchema(schema);
  }
  gtsPlugin.register(screenDomain);
  gtsPlugin.register(popupDomain);
  gtsPlugin.register(sidebarDomain);
});

describe('CHROME_ACTION_SCHEMAS', () => {
  it.each(CHROME_ACTIONS)('admits $type aimed at the screen domain', ({ type, payload }) => {
    expect(() => gtsPlugin.register({ type, target: screenDomain.id, payload })).not.toThrow();
  });

  it.each(CHROME_ACTIONS)(
    'refuses $type aimed at a domain that opts into no chrome handler, naming the domain it needed',
    ({ type, payload }) => {
      // The sidebar domain is registered and valid — it simply is not the
      // domain these actions are declared against. The refusal has to come from
      // the target ref here, at admission, rather than from the mediator finding
      // no handler two layers further in, which would name a missing handler
      // instead of the domain the caller should have targeted.
      expect(() => gtsPlugin.register({ type, target: sidebarDomain.id, payload })).toThrow(
        new RegExp(`does not match pattern '${screenDomain.id}'`),
      );
    },
  );

  it.each(CHROME_ACTIONS)(
    'refuses $type carrying an undeclared top-level field, through the real GTS admission path',
    ({ type, payload }) => {
      expect(() =>
        gtsPlugin.register({ type, target: screenDomain.id, payload, extraneous: true }),
      ).toThrow();
    },
  );

  it.each(CHROME_ACTIONS)(
    'refuses $type carrying an undeclared payload field, through the real GTS admission path',
    ({ type, payload }) => {
      expect(() =>
        gtsPlugin.register({ type, target: screenDomain.id, payload: { ...payload, extraneous: true } }),
      ).toThrow();
    },
  );
});

describe('the chrome actions that carry no payload', () => {
  it.each(CHROME_ACTIONS_WITHOUT_PAYLOAD)(
    'admits $name with no payload aimed at the domain that answers it',
    ({ type, target }) => {
      expect(() => gtsPlugin.register({ type, target })).not.toThrow();
    },
  );

  it.each(CHROME_ACTIONS_WITHOUT_PAYLOAD)(
    'refuses $name aimed at a foreign domain, naming the domain it needed',
    ({ name, type, target }) => {
      const foreign = name === 'sign_in' ? screenDomain.id : sidebarDomain.id;
      expect(() => gtsPlugin.register({ type, target: foreign })).toThrow(
        new RegExp(`does not match pattern '${target}'`),
      );
    },
  );

  it.each(CHROME_ACTIONS_WITHOUT_PAYLOAD)(
    'refuses $name carrying any payload field at all: the schema closes the payload empty',
    ({ type, target }) => {
      // The validator names the extra property and its path, so a failure for
      // any other reason (a missing schema dependency, an id clash, a broken
      // target ref) can no longer pass this case.
      expect(() => gtsPlugin.register({ type, target, payload: { subject: 'ext.x' } })).toThrow(
        'Additional property `subject` in `#/payload/subject` is not allowed',
      );
    },
  );
});

/**
 * The `$id` and `target` inside the JSON schema files are literal strings, while
 * the rest of the shell dispatches on the constants this module exports and
 * registers the domain named by `FRONTX_SCREEN_DOMAIN` or `FRONTX_POPUP_DOMAIN`.
 * Nothing in the type system ties a literal to a constant, and drift between
 * them is silent: a schema whose `$id` no longer matches an action type is
 * simply never the one the mediator resolves.
 */
describe('the chrome action JSON schemas against the constants they are addressed by', () => {
  it('covers every exported action type, and declares no schema beyond them', () => {
    const declaredIds = [...CHROME_ACTION_SCHEMAS, ...CHROME_MODAL_ACTION_SCHEMAS]
      .map((schema) => schema.$id)
      .sort();

    expect(declaredIds).toEqual(
      [
        CHROME_SET_THEME,
        CHROME_SET_MENU_COLLAPSED,
        CHROME_SET_LANGUAGE,
        CHROME_SIGN_IN,
        CHROME_REFRESH_PAGE,
      ]
        .map((type) => `gts://${type}`)
        .sort(),
    );
  });

  it.each([
    ['set_theme', CHROME_SET_THEME, FRONTX_SCREEN_DOMAIN],
    ['set_menu_collapsed', CHROME_SET_MENU_COLLAPSED, FRONTX_SCREEN_DOMAIN],
    ['set_language', CHROME_SET_LANGUAGE, FRONTX_SCREEN_DOMAIN],
    ['refresh_page', CHROME_REFRESH_PAGE, FRONTX_SCREEN_DOMAIN],
    ['sign_in', CHROME_SIGN_IN, FRONTX_POPUP_DOMAIN],
  ])('points %s at the domain the shell actually registers', (_name, actionTypeId, domainId) => {
    expect(targetRefOf(schemaFor(actionTypeId))).toBe(domainId);
  });
});
