/**
 * MFE Registry Composition Root
 *
 * The singleton wiring is app-layer composition, so it lives here, in the
 * template's framework package, rather than in a core SDK package.
 *
 * This is the primary way application code obtains a MfeRegistry instance:
 * the factory accepts configuration (including a TypeSystemPlugin) and
 * returns the registry singleton. After the first `build()`, subsequent
 * calls return the cached instance.
 *
 * @packageDocumentation
 */

import { createMfeRegistryFactory, type MfeRegistryFactory } from '@gears-frontx/mfes';

export const mfeRegistryFactory: MfeRegistryFactory = createMfeRegistryFactory();
