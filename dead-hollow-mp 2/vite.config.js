import { defineConfig } from 'vite';
// Client lives in /client; it imports ../shared directly. In dev, /ws is proxied to the Node server (port 3000).
export default defineConfig({
  root: 'client',
  build: { outDir: 'dist', emptyOutDir: true },
  server: { host: true, port: 5173, fs: { strict: false }, proxy: { '/ws': { target: 'ws://localhost:3000', ws: true } } }
});
