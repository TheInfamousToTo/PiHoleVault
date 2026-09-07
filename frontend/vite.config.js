import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  build: {
    // The Dockerfile copies frontend/build into the nginx html root, so keep
    // Vite's output there rather than its default `dist`.
    outDir: 'build',
    sourcemap: false,
    // Fail the build rather than shipping a chunk large enough to stall a
    // first load on a Raspberry Pi over LAN.
    chunkSizeWarningLimit: 900
  },

  server: {
    port: 3000,
    // In development the UI runs on its own origin, so /api and /health are
    // proxied to the backend. In production nginx does this, and the app uses
    // relative URLs.
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true
      },
      '/health': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
