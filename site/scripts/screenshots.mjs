// Checkpoint screenshots of the built site (served by `astro preview`) at 1440x900 and 390x844.
// Usage: ./node.sh node scripts/screenshots.mjs [baseUrl] [outDir] [path]
// Shots: preloader, hero, menu, then every home section (reveals forced to their final state).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:4321/';
const out = path.resolve(process.argv[3] || 'shots');
const pagePath = process.argv[4] || '';
fs.mkdirSync(out, { recursive: true });

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true },
];
const SECTIONS = [
  ['05-intro', '.intro'],
  ['06-ceiling', '#ceiling .ceil__panel'],
  ['07-jv', '.ceil__jv'],
  ['08-experiments', '#experiments'],
  ['09-laptop', '.lap'],
  ['10-screen-statement', '.scr__statement'],
  ['11-screen-funnel', '[data-beat="funnel"]'],
  ['12-screen-honest', '[data-beat="honest"]'],
  ['13-screen-dots', '[data-beat="dots"]'],
  ['14-screen-hopv', '[data-beat="hopv"]'],
  ['15-screen-ood', '[data-beat="ood"]'],
  ['16-predictor', '#predictor'],
  ['17-footer', '.ftr'],
  ['18-next', '[data-next] .next__sticky'],
];

// WebGL moments are captured as viewport shots at scroll positions (the page canvas is fixed).
// [name, anchor selector, f] scrolls to anchor top + f * viewport height;
// [name, anchor, 'mid' | 'bottom', f?] puts the anchor's middle (or bottom) mid-screen, plus f * vh.
const MOMENTS = [
  ['04a-ray-intro', '.intro', -0.35],
  ['04b-ceiling-grow', '[data-ceiling-track]', -0.45],
  ['04c-ceiling-open', '[data-ceiling-track]', 0.3],
  ['04d-ray-laptop', '.lap', -0.25],
  ['04e-laptop', '[data-laptop]', -0.3],
  ['04f-photon', '.lap', 'bottom', -0.6],
  ['04g-scr-statement', '.scr__statement', 'mid'],
  ['04h-scr-tunnel', '.scr__funnel li:nth-child(1)', 'mid'],
  ['04i-scr-funnel-81', '.scr__funnel li:nth-child(3)', 'mid'],
  ['04j-scr-honest', '[data-beat="honest"] [data-gl-gap]', 'mid'],
  ['04k-scr-dots', '[data-beat="dots"] [data-gl-gap]', 'mid'],
  ['04l-scr-shatter', '[data-beat="hopv"] [data-gl-gap]', 'mid', -0.3],
  ['04m-scr-real', '[data-beat="hopv"] .scr__pair', 'mid'],
  ['04n-ray-end', '[data-ray-end]', -0.6],
];

// Headless Chromium falls back to software GL; on Windows use the real GPU through ANGLE/D3D11.
const gpuArgs = process.platform === 'win32' ? ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] : [];
const browser = await chromium.launch({ args: gpuArgs });
const errors = [];
for (const vp of viewports) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
  });
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${vp.name}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${vp.name}: ${e.message}`));
  await page.goto(base + pagePath, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, `${vp.name}-01-preloader.png`) });
  await page.waitForFunction(() => !document.documentElement.classList.contains('preload'), null, { timeout: 15000 });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(out, `${vp.name}-02-hero.png`) });

  await page.click('[data-menu-btn]');
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(out, `${vp.name}-03-menu.png`) });
  await page.click('[data-menu-btn]');
  await page.waitForTimeout(700);

  for (const [name, selector, mode, extra] of MOMENTS) {
    const y = await page.evaluate(([s, mode, extra]) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const top = r.top + window.scrollY, vh = window.innerHeight;
      if (mode === 'mid') return top + r.height / 2 - vh / 2 + (extra || 0) * vh;
      if (mode === 'bottom') return top + r.height - vh / 2 + (extra || 0) * vh;
      return top + mode * vh;
    }, [selector, mode, extra]);
    if (y === null) continue;
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(name.includes('scr-statement') ? 3500 : 1600);
    await page.screenshot({ path: path.join(out, `${vp.name}-${name}.png`) });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);

  // Final state of every reveal, so tall sections show all their text.
  await page.evaluate(() => document.querySelectorAll('[data-reveal],[data-fade]').forEach((el) => el.classList.add('is-in')));
  await page.waitForTimeout(1500);
  for (const [name, selector] of SECTIONS) {
    const el = await page.$(selector);
    if (!el) continue;
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await el.screenshot({ path: path.join(out, `${vp.name}-${name}.png`) });
  }
  await context.close();
}
await browser.close();
console.log(`screenshots written to ${out}`);
if (errors.length) {
  console.error('console errors:\n' + errors.join('\n'));
  process.exit(1);
}
