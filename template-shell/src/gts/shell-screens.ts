/**
 * Shell Screens - the project's say over the screen extension type
 *
 * The shell keeps one screen extension type id,
 * `gts.frontx.mfes.ext.extension.v1~frontx.screensets.layout.screen.v1~`, and
 * ships `extension_screen.v1.json` as its default schema. A project may
 * replace that schema, derive its own screen type from it, read its own menu
 * presentation, or have no screen domain at all, from a module the template
 * does not own (`src-app/shell-config/screens.ts`). Without that module the
 * shell behaves exactly as the defaults below describe.
 *
 * @packageDocumentation
 */

import type { JSONSchema } from '@gears-frontx/gts-plugin';
import type { Extension } from '@gears-frontx/mfes';
import { extensionScreenSchema as defaultScreenSchema } from './index';

const GTS_SCHEMA_ID_PREFIX = 'gts://';
const BASE_EXTENSION_TYPE_ID = 'gts.frontx.mfes.ext.extension.v1~';
const SCREEN_EXTENSION_TYPE_ID = defaultScreenSchema.$id!.slice(GTS_SCHEMA_ID_PREFIX.length);

/** What the shell menu shows for one screen extension. */
export interface ScreenMenuItem {
  /** Menu item text. */
  label: string;
  /** Iconify icon name. */
  icon?: string;
  /** Sort key, lower first; a missing one sorts last. */
  order?: number;
}

/**
 * Reads the menu item for a registered screen extension, or `undefined` to
 * leave the extension out of the menu. The extension has already passed the
 * screen type's schema when it reaches the reader.
 */
export type ScreenMenuItemReader = (extension: Extension) => ScreenMenuItem | undefined;

/** The default export of a project's `src-app/shell-config/screens.ts`. Every field is optional. */
export interface ShellScreensConfig {
  /** `false` leaves the screen domain unregistered: no screen slot, no screen menu items. Default `true`. */
  enabled?: boolean;
  /**
   * Screen type schemas the project registers before the shell's default.
   * Each `$id` is the screen type id itself, which replaces the default schema
   * (the first definition of a type id wins), or a type derived from it. A
   * replacement must keep `route` required.
   */
  schemas?: readonly JSONSchema[];
  /** The type every screen extension must derive from: the screen type id (default) or a type derived from it in `schemas`. */
  extensionsTypeId?: string;
  /** Reads the menu item from an extension. Default: the flat `presentation.label`, `.icon` and `.order`. */
  readMenuItem?: ScreenMenuItemReader;
}

/** A project config checked and completed with the defaults. */
export interface ResolvedShellScreens {
  readonly enabled: boolean;
  /** The project's schemas, then the shell default unless one of them replaces it. */
  readonly schemas: readonly JSONSchema[];
  readonly extensionsTypeId: string;
  readonly readMenuItem: ScreenMenuItemReader;
}

/** Types a project's screens config; returns it unchanged. */
export function defineShellScreens(config: ShellScreensConfig): ShellScreensConfig {
  return config;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The default reader: the flat `presentation` the default schema declares. */
export const readFlatScreenMenuItem: ScreenMenuItemReader = (extension) => {
  const presentation = (extension as { presentation?: unknown }).presentation;
  if (!isRecord(presentation) || typeof presentation.label !== 'string') return undefined;
  const { label, icon, order } = presentation;
  return {
    label,
    ...(typeof icon === 'string' ? { icon } : {}),
    ...(typeof order === 'number' ? { order } : {}),
  };
};

/** A type id (trailing `~`) that is the screen type or derives from it. */
function isScreenTypeId(typeId: string): boolean {
  return typeId.startsWith(SCREEN_EXTENSION_TYPE_ID) && typeId.endsWith('~');
}

function typeIdOf(schema: JSONSchema): string | undefined {
  const id = schema.$id;
  return typeof id === 'string' && id.startsWith(GTS_SCHEMA_ID_PREFIX) ? id.slice(GTS_SCHEMA_ID_PREFIX.length) : undefined;
}

/** The type ids a schema's top-level `allOf` references. */
function allOfRefs(schema: JSONSchema): string[] {
  const allOf = schema.allOf;
  if (!Array.isArray(allOf)) return [];
  return allOf
    .map((part: unknown) => (typeof part === 'object' && part !== null ? (part as { $ref?: unknown }).$ref : undefined))
    .filter((ref): ref is string => typeof ref === 'string' && ref.startsWith(GTS_SCHEMA_ID_PREFIX))
    .map((ref) => ref.slice(GTS_SCHEMA_ID_PREFIX.length));
}

function fail(message: string): never {
  throw new Error(`[shell screens] ${message}`);
}

/**
 * Checks a project's screens config and fills in the defaults.
 *
 * @throws Error when a schema is not a screen type or is listed twice, a
 * replacement drops the required `route` or the base extension, a derived type does not inherit from a screen type it
 * derives from, or `extensionsTypeId` names a type that is neither the screen
 * type nor one of the project's own schemas
 */
export function resolveShellScreens(config: ShellScreensConfig = {}): ResolvedShellScreens {
  const projectSchemas = config.schemas ?? [];
  const projectTypeIds = new Set<string>();
  for (const schema of projectSchemas) {
    const typeId = typeIdOf(schema);
    if (!typeId || !isScreenTypeId(typeId)) {
      fail(
        `schema '${String(schema.$id)}' is not a screen type: its $id must be gts://${SCREEN_EXTENSION_TYPE_ID} or gts://<a type id derived from it, ending in ~>`,
      );
    }
    if (projectTypeIds.has(typeId)) {
      fail(`schema '${String(schema.$id)}' is listed more than once; the first definition of a type id wins`);
    }
    projectTypeIds.add(typeId);
  }

  for (const schema of projectSchemas) {
    const typeId = typeIdOf(schema)!;
    if (typeId === SCREEN_EXTENSION_TYPE_ID) {
      // A schema loaded from JSON can carry `required` as a string, which
      // `includes` would match as a substring.
      const required: unknown = schema.required;
      if (!Array.isArray(required) || !required.includes('route')) {
        fail(`the replacement screen schema must keep 'route' in its top-level required list`);
      }
      if (!allOfRefs(schema).includes(BASE_EXTENSION_TYPE_ID)) {
        fail(`the replacement screen schema must list { "$ref": "gts://${BASE_EXTENSION_TYPE_ID}" } in its allOf`);
      }
      continue;
    }
    // A derived type is validated against its own schema only; the base
    // schema's rules (route, presentation) hold under it only through allOf.
    const inherits = allOfRefs(schema).some(
      (parent) =>
        parent !== typeId &&
        typeId.startsWith(parent) &&
        (parent === SCREEN_EXTENSION_TYPE_ID || projectTypeIds.has(parent)),
    );
    if (!inherits) {
      fail(`derived screen schema '${String(schema.$id)}' must list { "$ref": "gts://<the screen type it derives from>" } in its allOf`);
    }
  }

  const extensionsTypeId = config.extensionsTypeId ?? SCREEN_EXTENSION_TYPE_ID;
  if (extensionsTypeId !== SCREEN_EXTENSION_TYPE_ID && !projectTypeIds.has(extensionsTypeId)) {
    fail(
      `extensionsTypeId '${extensionsTypeId}' must be ${SCREEN_EXTENSION_TYPE_ID} or the type id of one of the configured schemas`,
    );
  }

  return {
    enabled: config.enabled ?? true,
    // A replacement takes the default's place rather than racing it: the store
    // would keep the first anyway, and warn about the second.
    schemas: projectTypeIds.has(SCREEN_EXTENSION_TYPE_ID) ? [...projectSchemas] : [...projectSchemas, defaultScreenSchema],
    extensionsTypeId,
    readMenuItem: config.readMenuItem ?? readFlatScreenMenuItem,
  };
}

/**
 * Registers the screen type schemas in their resolved order. Runs even when
 * the screen domain is off: an MFE may still declare screen extensions, and the
 * host registers those it does not mount as plain type-system entities, which
 * validate against these schemas.
 */
export function registerShellScreenSchemas(
  typeSystem: { registerSchema(schema: JSONSchema): void },
  screens: ResolvedShellScreens,
): void {
  for (const schema of screens.schemas) {
    typeSystem.registerSchema(schema);
  }
}
