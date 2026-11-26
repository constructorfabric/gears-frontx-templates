/**
 * `ExportClauseMembers` — the members of the `export { … }` clauses in
 * a module's text, read as `local` or `local as exported`, where either
 * name may be written as a string (`a as "b"`), which is how the
 * producer spells names it restores.
 */

export interface ExportClauseMember {
  /** The binding the clause exports. */
  local: string;
  /** The name it is exported under (the binding's own when not renamed). */
  exported: string;
}

export class ExportClauseMembers {
  private static readonly MEMBER = /^(["']?)([\w$]+)\1(?:\s+as\s+(["']?)([\w$]+)\3)?$/;

  protected constructor() {}

  /** Every member of every `export { … }` clause in `text`, in order. */
  static of(text: string): ExportClauseMember[] {
    const members: ExportClauseMember[] = [];
    for (const clause of text.matchAll(/export\s*\{([^}]*)\}/g)) {
      for (const member of clause[1].split(',')) {
        const m = member.trim().match(ExportClauseMembers.MEMBER);
        if (m === null) continue;
        members.push({ local: m[2], exported: m[4] ?? m[2] });
      }
    }
    return members;
  }
}
