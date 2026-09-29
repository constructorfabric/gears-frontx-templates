import type { JSONSchema } from '@gears-frontx/gts-plugin';
import entryAddressesSchemaJson from './schemas/entry_addresses.v1.json';

/**
 * Schema for the entry-addresses shared property required by the framework's
 * base extension domains. `microfrontends()` registers it on its supplied
 * type system before constructing the MFE registry.
 */
export const entryAddressesSchema = entryAddressesSchemaJson as JSONSchema;
