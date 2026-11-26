/**
 * `WorkspaceRoot` — finds the workspace root a package belongs to
 * (the build cache's scope): the nearest ancestor
 * directory (the package's own directory included) whose
 * `package.json` declares `workspaces`, or that carries a
 * `pnpm-workspace.yaml`. A package outside any workspace is its own
 * project root.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export class WorkspaceRoot {
  /** The workspace root enclosing `packageRoot`, else `packageRoot` itself. */
  static of(packageRoot: string): string {
    const start = path.resolve(packageRoot);
    let dir = start;
    for (;;) {
      if (WorkspaceRoot.declaresWorkspaces(dir)) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) return start;
      dir = parent;
    }
  }

  private static declaresWorkspaces(dir: string): boolean {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return true;
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')
      ) as { workspaces?: unknown };
      return pkg.workspaces !== undefined && pkg.workspaces !== null;
    } catch {
      return false;
    }
  }
}
