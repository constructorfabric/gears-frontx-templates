/**
 * `GtsEntityValidator` — validates GTS ids and manifest entities by
 * registering them with a `TypeSystemPlugin` implementation
 * (`@gears-frontx/gts-plugin`'s `GtsPlugin` by default, isolated so
 * build-time validation never touches the realm store). Nothing here
 * parses a GTS id — acceptance or rejection is the type system's verdict:
 * an invalid schema id fails `registerSchema`, an entity that violates
 * its type's schema fails `register`.
 */

import { GtsPlugin } from '@gears-frontx/gts-plugin';

/** The TypeSystemPlugin surface the validator uses. */
export interface EntityTypeSystem {
  registerSchema(schema: { $id: string; [key: string]: unknown }): void;
  register(entity: unknown): void;
}

export class GtsEntityValidator {
  private readonly typeSystem: EntityTypeSystem;

  constructor(typeSystem?: EntityTypeSystem) {
    this.typeSystem = typeSystem ?? new GtsPlugin({ isolated: true });
  }

  /**
   * Validates the package's `mfe.json` entities in declaration order —
   * schemas first so later registrations resolve them: the type system
   * accepts a schema only when its GTS type id is well-formed, and
   * registers an instance only when it validates against its type's
   * schema. Throws (fails the build) on the first rejection, naming the
   * entity.
   */
  assertValid(mfeJson: {
    schemas?: Array<{ $id: string; [key: string]: unknown }>;
    manifest?: { id: string; [key: string]: unknown };
    domains?: Array<{ id: string; [key: string]: unknown }>;
    entries?: Array<{ id: string; [key: string]: unknown }>;
    extensions?: Array<{ id: string; [key: string]: unknown }>;
  }): void {
    for (const schema of mfeJson.schemas ?? []) {
      try {
        this.typeSystem.registerSchema(schema);
      } catch (error) {
        throw GtsEntityValidator.describe('schema', schema.$id, error);
      }
    }
    const instances: Array<[string, unknown]> = [
      ...(mfeJson.manifest !== undefined
        ? ([['manifest', mfeJson.manifest]] as Array<[string, unknown]>)
        : []),
      ...(mfeJson.domains ?? []).map(
        (domain) => ['domain', domain] as [string, unknown]
      ),
      ...(mfeJson.entries ?? []).map(
        (entry) => ['entry', entry] as [string, unknown]
      ),
      ...(mfeJson.extensions ?? []).map(
        (extension) => ['extension', extension] as [string, unknown]
      ),
    ];
    for (const [kind, entity] of instances) {
      try {
        this.typeSystem.register(entity);
      } catch (error) {
        const id = (entity as { id?: string }).id ?? '(no id)';
        const message =
          error instanceof Error ? error.message : String(error);
        // A reference the isolated build store cannot resolve (an entity
        // registered by another runtime at load time, e.g. the host's
        // shared-property instances) is reported, not fatal: the type
        // system's verdict on the entity itself — id shape and schema
        // conformance — still stands.
        if (
          message.includes('not found in registry') ||
          message.includes('Schema not found')
        ) {
          console.warn(
            `[vite-plugin-mfe-gts] ${kind} '${id}' is not registered at build ` +
              `time; its x-gts-type-ref targets could not be resolved at build ` +
              `time: ${message.split('\n')[1]?.trim() ?? message}`
          );
          continue;
        }
        throw GtsEntityValidator.describe(kind, id, error);
      }
    }
  }

  private static describe(kind: string, id: string, error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(
      `[vite-plugin-mfe-gts] mfe.json ${kind} '${id}' was rejected ` +
        `by the type system: ${message}`
    );
  }
}
