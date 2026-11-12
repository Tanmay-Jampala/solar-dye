import { defineConfig } from 'astro/config';

// Fully static output in site/dist. No server, no source maps (they could leak local paths).
export default defineConfig({
  output: 'static',
  // For GitHub Pages: SITE_URL=https://<user>.github.io SITE_BASE=/solar-dye/ (scripts/publish-pages.mjs).
  site: process.env.SITE_URL || undefined,
  base: process.env.SITE_BASE || '/',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  vite: {
    build: { sourcemap: false },
    css: { devSourcemap: false },
  },
});
