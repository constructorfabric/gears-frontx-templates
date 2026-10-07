/// <reference types="node" />
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import { defineMfeProject } from '../../vitest.mfe.base';
import { inboxTestConfig } from '../shared/inbox/build/inboxRemote.config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
  defineMfeProject(__dirname),
  defineConfig(inboxTestConfig({ sharedDir: path.resolve(__dirname, '../shared/inbox'), dedupe: ['recharts'] }))
);
