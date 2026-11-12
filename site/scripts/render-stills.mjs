// Render stills of the real WebGL hero from the built site:
//   public/hero-poster.jpg  the static poster shown when WebGL is unavailable (and before it loads)
//   public/og.png           the 1200x630 social preview (hero still + title + author; no numbers)
// Both are also copied into dist/. Runs after `astro build`; the built site is served from dist/
// through request interception, so no server is needed. If WebGL cannot start, it warns and keeps
// the existing files (the build does not fail on a machine without a GPU).
// Usage: ./node.sh node scripts/render-stills.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(site, 'dist');
const pub = path.join(site, 'public');
const ORIGIN = 'http://stills.local';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff' };

function serve(route) {
  const url = new URL(route.request().url());
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!file.startsWith(dist)) return route.fulfill({ status: 403 });
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
  return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
}

function write(name, buffer) {
  for (const dir of [pub, dist]) fs.writeFileSync(path.join(dir, name), buffer);
  console.log(`render-stills: wrote ${name} (${(buffer.length / 1024).toFixed(0)} KB)`);
}

if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('render-stills: dist/index.html not found; run astro build first');
const gpuArgs = process.platform === 'win32' ? ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] : ['--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: gpuArgs });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  await context.route(`${ORIGIN}/**`, serve);
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/`, { waitUntil: 'load' });
  const live = await page
    .waitForFunction(() => document.documentElement.classList.contains('gl-hero') && !document.documentElement.classList.contains('preload'), null, { timeout: 60000 })
    .then(() => true)
    .catch(() => false);
  if (!live) {
    console.warn('render-stills: WebGL hero did not start; keeping the existing poster and og.png');
  } else {
    await page.mouse.move(5, 5); // keep the cursor away from the pile
    await page.waitForTimeout(2500);
    // Hide the card's text overlays (hint, name tag) so only the 3D render is captured.
    await page.evaluate(() => {
      document.querySelectorAll('[data-hero-card] *').forEach((el) => (el.style.visibility = el.tagName === 'CANVAS' ? 'visible' : 'hidden'));
    });
    const canvas = page.locator('[data-hero-card] canvas').first();
    const poster = await canvas.screenshot({ type: 'jpeg', quality: 82 });
    write('hero-poster.jpg', poster);

    // Social card: the still, the title and the author line. Fonts are the site's own files.
    const fontDir = path.join(site, 'src', 'assets', 'fonts');
    const font = (f) => fs.readFileSync(path.join(fontDir, f)).toString('base64');
    const og = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await og.setContent(`<!doctype html><html><head><style>
      @font-face { font-family: GS; src: url(data:font/woff2;base64,${font('GeneralSans-Regular.woff2')}) format('woff2'); font-weight: 400; }
      @font-face { font-family: GS; src: url(data:font/woff2;base64,${font('GeneralSans-Medium.woff2')}) format('woff2'); font-weight: 500; }
      html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #f0f1fa; font-family: GS, sans-serif; }
      .card { position: absolute; inset: 28px; border-radius: 22px; overflow: hidden; background: #05060c url(data:image/jpeg;base64,${poster.toString('base64')}) center / cover; }
      .card::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(5,6,12,0) 35%, rgba(5,6,12,0.88) 100%); }
      .t { position: absolute; left: 64px; right: 64px; bottom: 58px; z-index: 1; color: #fff; }
      .k { font-size: 18px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: #c1ff00; margin: 0 0 14px; }
      h1 { font-size: 64px; line-height: 1; font-weight: 400; letter-spacing: -0.03em; margin: 0 0 18px; }
      .a { font-size: 20px; color: rgba(255,255,255,0.78); margin: 0; }
    </style></head><body><div class="card"></div><div class="t">
      <p class="k">Solar Dye</p>
      <h1>Designing a Solar Dye on a Laptop</h1>
      <p class="a">Tanmay Jampala · Computational Chemistry · Jain University</p>
    </div></body></html>`);
    await og.evaluate(() => document.fonts.ready);
    write('og.png', await og.screenshot({ type: 'png' }));
  }
} finally {
  await browser.close();
}
