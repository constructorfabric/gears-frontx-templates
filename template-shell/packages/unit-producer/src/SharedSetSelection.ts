/**
 * `SharedSetSelection` — the `include` / `exclude` pair a runtime's build
 * configures its shared set with. The two options are mutually exclusive:
 *
 * - neither set: `default` — every bare package the build graph imports
 *   is shared;
 * - `include` set (an empty list is valid): only the listed packages and
 *   their runtime dependencies are shared;
 * - `exclude` set (non-empty): the default set minus the listed packages.
 *
 * Both runtimes' plugins and the producer read the selection through this
 * one class, so the rule is the same everywhere.
 */

export type SharedSetMode = 'default' | 'include' | 'exclude';

export interface SharedSetSelectionOptions {
  include?: readonly string[];
  exclude?: readonly string[];
}

export class SharedSetSelection {
  readonly include?: readonly string[];
  readonly exclude: readonly string[];

  constructor(options?: SharedSetSelectionOptions) {
    this.include = options?.include;
    this.exclude = options?.exclude ?? [];
  }

  get mode(): SharedSetMode {
    if (this.include !== undefined) return 'include';
    return this.exclude.length > 0 ? 'exclude' : 'default';
  }

  /** The build-failing message when both options are set, else `undefined`. */
  conflict(): string | undefined {
    if (this.include !== undefined && this.exclude.length > 0) {
      return (
        `[unit-producer] shared set: "include" and "exclude" are mutually ` +
        `exclusive — "include" lists the only packages to share, "exclude" ` +
        `removes packages from the default set.\n` +
        `Fix: configure one of them, or neither to share every imported package.`
      );
    }
    return undefined;
  }
}
