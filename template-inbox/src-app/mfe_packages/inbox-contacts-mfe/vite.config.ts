import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import { frontxMfGts } from '@gears-frontx/frontx-template-shell/build/mf-gts';
import { inboxRemoteConfig } from '../shared/inbox/build/inboxRemote.config';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(
  inboxRemoteConfig({
    federationName: 'inboxContactsMfe',
    sharedDir: path.resolve(here, '../shared/inbox'),
    plugins: { react, federation, frontxMfGts },
  })
);
