/**
 * The framework event bus, typed with the augmentable `EventPayloadMap`
 * of `@gears-frontx/react` (declared in the package barrel, where app
 * code augments it), so code importing `eventBus` from
 * `@gears-frontx/react` gets type-safe access to both framework events
 * and app-layer augmented events.
 *
 * Its own module, re-exported from the barrel, so the barrel declares
 * nothing at runtime and can be skipped for the modules that define the
 * bindings a consumer uses.
 */

import { eventBus as frameworkEventBus, type EventBus } from '@gears-frontx/framework';

import type { EventPayloadMap } from './index';

export const eventBus: EventBus<EventPayloadMap> = frameworkEventBus as EventBus<EventPayloadMap>;
