import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The bare specifiers of a consumer that imports each package its
 * `package.json` declares: the producer builds a package's root entry only
 * when some code imports it.
 */
export function declaredDependencies(root: string): string[] {
  const json = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as {
    dependencies?: Record<string, string>;
  };
  return Object.keys(json.dependencies ?? {});
}
