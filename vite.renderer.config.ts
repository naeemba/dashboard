import { defineConfig } from 'vite';
import { buildVersionDefine } from './vite.build-version';
import { changelogDefine } from './vite.changelog';

// https://vitejs.dev/config
export default defineConfig({ define: { ...buildVersionDefine, ...changelogDefine } });
