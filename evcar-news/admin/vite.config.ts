/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Vite does not put .env files into process.env for the config itself:
  // read EVCAR_API_PROXY_TARGET from admin/.env[.mode][.local] explicitly
  // (a real environment variable still wins). Only this key is read; it is
  // not exposed to the bundle (no VITE_ prefix).
  const fileEnv = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'EVCAR_');
  const backendUrl =
    process.env.EVCAR_API_PROXY_TARGET ?? fileEnv.EVCAR_API_PROXY_TARGET ?? 'http://localhost:3000';
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        // All API traffic (incl. the httpOnly refresh cookie on /api/v1/auth) goes
        // through the dev server so the cookie stays first-party.
        '/api': {
          target: backendUrl,
          changeOrigin: false,
          // Forward the browser's IP (X-Forwarded-For) so the API's per-IP
          // rate limits / login lockouts see real clients (TRUST_PROXY).
          xfwd: true,
        },
      },
    },
    preview: {
      port: 4173,
      proxy: {
        '/api': { target: backendUrl, changeOrigin: false, xfwd: true },
      },
    },
    build: {
      sourcemap: true,
      chunkSizeWarningLimit: 1500,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      restoreMocks: true,
      unstubGlobals: true,
      include: ['src/**/*.test.{ts,tsx}'],
      // Generous limits: lazily loaded route modules are transformed on first
      // use, which takes seconds on a loaded CI machine (flaky 5 s timeouts).
      testTimeout: 30_000,
      hookTimeout: 30_000,
    },
  };
});
