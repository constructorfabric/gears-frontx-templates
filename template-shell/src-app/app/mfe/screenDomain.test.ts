/**
 * The schema set `registerScreenDomain` puts on the type system stands on its
 * own.
 *
 * The screen extension type and the chrome action schemas are registered here,
 * not by the app entry, so a host that wires `microfrontends` without
 * `main.tsx`'s language code registration still has to admit the actions the
 * screen domain answers. This file registers the two shared property types the
 * screen domain declaration names, as any host must, and the chrome action
 * schemas, so the refusal below comes from the dangling reference rather than
 * from an unknown action type. It registers nothing else from the app entry's
 * schema block. It runs in its own test process, so the `gtsPlugin` singleton's
 * store holds no language code type: whatever the screen domain does not
 * register itself is missing and the reference dangles. The first assertion
 * below states that premise, so the case cannot pass on a store some other test
 * filled in.
 */
import { describe, expect, it } from 'vitest';
import { createFrontX } from '@gears-frontx/react';
import { microfrontends } from '@gears-frontx/react/mfe';
import { FRONTX_SCREEN_DOMAIN } from '../../../src/index';
import { gtsPlugin } from '@gears-frontx/gts-plugin';
import { languageSchema, themeSchema } from '../../../src/index';

import { CHROME_ACTION_SCHEMAS, CHROME_SET_LANGUAGE } from './chrome-actions';
import { registerScreenDomain } from './screenDomain';

const SET_LANGUAGE_ACTION = {
  type: CHROME_SET_LANGUAGE,
  target: FRONTX_SCREEN_DOMAIN,
} as const;

describe('registerScreenDomain on a type system without main.tsx schema block', () => {
  it('admits set_language with a listed language and refuses an unlisted one', () => {
    gtsPlugin.registerSchema(themeSchema);
    gtsPlugin.registerSchema(languageSchema);
    // Put the chrome action schemas on the type system first, so the
    // set_language type is known and the payload is what gets validated.
    // Nothing has put the language code type there, and the payload's $ref
    // names it, so the refusal has to name that reference rather than an
    // unknown action type.
    for (const schema of CHROME_ACTION_SCHEMAS) {
      gtsPlugin.registerSchema(schema);
    }

    expect(() => gtsPlugin.register({ ...SET_LANGUAGE_ACTION, payload: { language: 'de' } })).toThrow(
      /Could not resolve \$ref 'gts\.frontx\.i18n\.lang\.code\.v1~'/,
    );

    const app = createFrontX()
      .use(microfrontends({ typeSystem: gtsPlugin, mfeHandlers: [] }))
      .build();
    registerScreenDomain(app);

    expect(() => gtsPlugin.register({ ...SET_LANGUAGE_ACTION, payload: { language: 'de' } })).not.toThrow();

    // The payload constraint is enforced, not skipped: the reference resolves
    // to the language code type and its enum refuses a code it does not list.
    expect(() => gtsPlugin.register({ ...SET_LANGUAGE_ACTION, payload: { language: 'xx' } })).toThrow();
  });
});
