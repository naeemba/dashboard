import { defineConfig } from 'vite';
import { buildVersionDefine } from './vite.build-version';
import { readChangelog } from './vite.changelog';

// https://vitejs.dev/config
export default defineConfig({ define: { ...buildVersionDefine, __CHANGELOG__: JSON.stringify(readChangelog()) } });
