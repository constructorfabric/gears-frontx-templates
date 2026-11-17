/// <reference types="node" />
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineMfeProject } from '../../vitest.mfe.base';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineMfeProject(__dirname);
