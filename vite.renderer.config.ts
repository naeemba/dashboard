import { defineConfig } from 'vite';
import { buildVersionDefine } from './vite.build-version';

// https://vitejs.dev/config
export default defineConfig({ define: buildVersionDefine });
