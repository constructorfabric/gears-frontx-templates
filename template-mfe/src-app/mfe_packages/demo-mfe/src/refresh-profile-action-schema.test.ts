/**
 * Admission tests for `demo-mfe`'s own `refresh_profile` action schema
 * (`mfe.json`'s `schemas[0]`), run through the REAL `GtsPlugin` — the same
 * validator `register()` runs any action instance through before the
 * mediator ever looks for a handler. The schema is self-contained and
 * closed (`additionalProperties: false` on itself and on its own payload),
 * so an undeclared field at either level must be refused here, at
 * admission, not silently accepted.
 *
 * A fresh `GtsPlugin` instance, per its own guidance for tests that need
 * isolated state — this file registers entities no other suite should see.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GtsPlugin } from '@gears-frontx/gts-plugin';
import { extensionScreenSchema, languageSchema, themeSchema } from '@gears-frontx/frontx-template-shell';
import type { ExtensionDomain, Extension } from '@gears-frontx/react';
import { PROFILE_EXTENSION_ID, DEMO_ACTION_REFRESH_PROFILE } from './shared/extension-ids';
import refreshProfileSchemaJson from '../mfe.json' with { type: 'json' };

const REFRESH_PROFILE_SCHEMA = refreshProfileSchemaJson.schemas[0] as Record<string, unknown>;

const SCREEN_DOMAIN_ID = 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1';

const SCREEN_DOMAIN = {
  id: SCREEN_DOMAIN_ID,
  route: 'screen',
  sharedProperties: [],
  actions: [],
  extensionsActions: [],
  defaultActionTimeout: 5000,
  lifecycleStages: [],
  extensionsLifecycleStages: [],
} as unknown as ExtensionDomain;

const PROFILE_ENTRY_ID =
  'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.demo.mfe.profile.v1';

const PROFILE_EXTENSION = {
  id: PROFILE_EXTENSION_ID,
  domain: SCREEN_DOMAIN_ID,
  entry: PROFILE_ENTRY_ID,
  route: '/profile',
  presentation: {
    label: 'Profile',
  },
} as unknown as Extension;

let gtsPlugin: GtsPlugin;

beforeAll(() => {
  gtsPlugin = new GtsPlugin();
  gtsPlugin.registerSchema(themeSchema);
  gtsPlugin.registerSchema(languageSchema);
  gtsPlugin.registerSchema(extensionScreenSchema);
  gtsPlugin.registerSchema(REFRESH_PROFILE_SCHEMA as never);
  gtsPlugin.register(SCREEN_DOMAIN);
  gtsPlugin.register(PROFILE_EXTENSION);
});

afterEach(() => {
  // Nothing mutates shared state across cases in this file (every
  // `register()` call below is an action instance check, not a new entity
  // registration) — kept for symmetry with this suite's sibling files.
});

describe('refresh_profile action schema — real GTS admission', () => {
  it('admits a well-formed refresh_profile action aimed at the Profile extension', () => {
    expect(() =>
      gtsPlugin.register({ type: DEMO_ACTION_REFRESH_PROFILE, target: PROFILE_EXTENSION_ID }),
    ).not.toThrow();
  });

  it('refuses a refresh_profile action carrying an undeclared top-level field', () => {
    expect(() =>
      gtsPlugin.register({
        type: DEMO_ACTION_REFRESH_PROFILE,
        target: PROFILE_EXTENSION_ID,
        extraneous: true,
      }),
    ).toThrow();
  });

  it('refuses a refresh_profile action carrying an undeclared payload field', () => {
    expect(() =>
      gtsPlugin.register({
        type: DEMO_ACTION_REFRESH_PROFILE,
        target: PROFILE_EXTENSION_ID,
        payload: { extraneous: true },
      }),
    ).toThrow();
  });
});
