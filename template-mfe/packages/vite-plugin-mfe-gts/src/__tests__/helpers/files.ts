/** File helpers the fixture-building tests share. */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Writes a file, creating its directory. */
export function put(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
}
