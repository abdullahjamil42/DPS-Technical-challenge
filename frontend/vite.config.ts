import { defineConfig } from '@lovable.dev/vite-tanstack-config';

const BACKEND_TARGET = process.env.BACKEND_URL || 'http://localhost:3001';

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: 'server' },
  },
  vite: {
    server: {
      proxy: {
        '/api/departures': {
          target: BACKEND_TARGET,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 3000,
      proxy: {
        '/api/departures': {
          target: BACKEND_TARGET,
          changeOrigin: true,
        },
      },
    },
  },
});

