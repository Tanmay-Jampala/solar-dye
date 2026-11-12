import { defineConfig } from 'astro/config';

// Fully static output in site/dist. No server, no source maps (they could leak local paths).
export default defineConfig({
  output: 'static',
  base: process.env.SITE_BASE || '/',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  vite: {
    build: { sourcemap: false },
    css: { devSourcemap: false },
  },
});
