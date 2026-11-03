import { defineConfig } from 'vite';

// Vite answers only host names it knows (a guard against DNS rebinding). The sandbox's HTTPS proxy reaches these
// servers under *.shopee.io names, so those are let through as well.
const allowedHosts = ['.shopee.io'];

export default defineConfig({
  // relative paths, so the built site works under any sub-path (the sandbox proxy, a static host)
  base: './',
  server: { host: '0.0.0.0', port: 5192, allowedHosts },
  preview: { host: '0.0.0.0', port: 5193, allowedHosts },
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
});
