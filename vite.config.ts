import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': "AIzaSyCkr90gzbAM2Bo4ZGo6Ub1ybpA9lx_wXp0",
        'process.env.GEMINI_API_KEY': "AIzaSyCkr90gzbAM2Bo4ZGo6Ub1ybpA9lx_wXp0"
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
