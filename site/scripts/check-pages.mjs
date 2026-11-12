// Page check in three modes: normal, prefers-reduced-motion, and no WebGL. For every page:
//   - every [data-key] (<Num>) rendered a non-empty value;
//   - no "undefined" or "NaN" in the visible text;
//   - no console errors or uncaught exceptions;
//   - after scrolling top to bottom, every reveal ([data-reveal], [data-fade]) has played and no
//     text-bearing element is left invisible (opacity 0 or visibility hidden);
//   - every honest-negative block and secondary-source tag is rendered;
//   - in no-WebGL mode no <canvas> was created; in reduced-motion mode smooth scroll is off.
// Optional: --shots=<dir> writes a viewport screenshot of each home section in each mode.
// Usage: ./node.sh node scripts/check-pages.mjs [baseUrl] [--shots=dir]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--')) || 'http://127.0.0.1:4321/';
const shots = args.find((a) => a.startsWith('--shots='))?.slice(8);
if (shots) fs.mkdirSync(shots, { recursive: true });
const PAGES = ['', 'parts/data/', 'parts/ceiling/', 'parts/hf-vs-b3lyp/', 'parts/twist/', 'parts/descriptors/', 'parts/surrogate/', 'parts/quantum-dots/', 'parts/cost/', 'checks/'];
const gpuArgs = process.platform === 'win32' ? ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] : [];
const MODES = [
  { name: 'normal', args: gpuArgs, motion: 'no-preference' },
  { name: 'reduced-motion', args: gpuArgs, motion: 'reduce' },
  { name: 'no-webgl', args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'], motion: 'no-preference' },
];
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true },
];

const failures = [];
const summary = [];
for (const mode of MODES) {
  const browser = await chromium.launch({ args: mode.args });
  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, reducedMotion: mode.motion });
    for (const p of PAGES) {
      const tag = `${mode.name} ${vp.name} /${p}`;
      const page = await context.newPage();
      const errors = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(base + p, { waitUntil: 'load' });
      // Wait for the preloader (home page) to finish, as a reader would.
      await page.waitForFunction(() => !document.documentElement.classList.contains('preload'), null, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(800);
      const webgl = await page.evaluate(() => {
        try {
          const c = document.createElement('canvas');
          return !!(c.getContext('webgl2') || c.getContext('webgl'));
        } catch {
          return false;
        }
      });
      // Scroll through the page in viewport steps so every observer fires; shoot home sections.
      // Stop above the next-page panel: scrolling through it auto-advances to the next page.
      const height = await page.evaluate(() => {
        const next = document.querySelector('[data-next]');
        const top = next ? next.getBoundingClientRect().top + window.scrollY : document.documentElement.scrollHeight;
        return Math.max(0, top - window.innerHeight * 0.6);
      });
      for (let y = 0; y <= height; y += Math.round(vp.height * 0.7)) {
        await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y);
        await page.waitForTimeout(mode.motion === 'reduce' ? 120 : 260);
      }
      await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), height);
      await page.waitForTimeout(1600);
      const navigated = page.url() !== base + p;
      const r = await page.evaluate(() => {
        const keys = Array.from(document.querySelectorAll('[data-key]'));
        const emptyKeys = keys.filter((el) => !el.textContent.trim()).map((el) => el.getAttribute('data-key'));
        const text = document.body.innerText;
        // (The checks page legitimately says "no NaN or infinity anywhere in results.json".)
        const bad = (text.match(/[^\n]{0,40}\b(undefined|NaN)\b[^\n]{0,40}/g) || []).filter((m) => !/\bno NaN\b/.test(m)).slice(0, 5);
        const unrevealed = Array.from(document.querySelectorAll('[data-reveal],[data-fade]')).filter((el) => !el.classList.contains('is-in') && el.getClientRects().length && !el.closest('[data-next]')).length;
        // Text that is laid out but invisible (excluding sr-only, aria-hidden decoration, closed menu,
        // letter-roll copies and the preloader).
        const hidden = [];
        for (const el of document.querySelectorAll('main p, main h1, main h2, main h3, main li, main td, main th, main dd, main dt, main figcaption')) {
          if (!el.textContent.trim() || !el.getClientRects().length || el.closest('[aria-hidden="true"], .sr-only, [hidden], [data-next]')) continue;
          let n = el, invisible = false;
          while (n && n !== document.body) {
            const cs = getComputedStyle(n);
            if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.05 || cs.display === 'none') {
              invisible = true;
              break;
            }
            n = n.parentElement;
          }
          if (invisible) hidden.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 50)}"`);
        }
        const honest = Array.from(document.querySelectorAll('.honest, [data-honest]')).filter((el) => el.getClientRects().length).length;
        const secondary = document.querySelectorAll('.tag-secondary').length;
        const canvases = document.querySelectorAll('canvas').length;
        const lenis = document.documentElement.classList.contains('lenis');
        return { keys: keys.length, emptyKeys, bad, unrevealed, hidden: hidden.slice(0, 6), hiddenCount: hidden.length, honest, secondary, canvases, lenis };
      });
      if (shots && p === '') {
        const sections = await page.$$eval('main > section[id], main > section', (els) => els.map((e, i) => e.id || `s${i}`));
        for (const id of [...new Set(sections)]) {
          const loc = id.startsWith('s') && /^s\d+$/.test(id) ? page.locator('main > section').nth(Number(id.slice(1))) : page.locator(`#${id}`);
          await loc.scrollIntoViewIfNeeded().catch(() => {});
          await page.waitForTimeout(500);
          await page.screenshot({ path: path.join(shots, `${mode.name}-${vp.name}-${id}.png`) });
        }
      }
      const problems = [];
      if (navigated) problems.push(`navigated away to ${page.url()}`);
      if (errors.length) problems.push(`console errors: ${errors.slice(0, 3).join(' | ')}`);
      if (r.emptyKeys.length) problems.push(`empty data-key: ${r.emptyKeys.slice(0, 5).join(', ')}`);
      if (r.bad.length) problems.push(`undefined/NaN: ${r.bad.join(' | ')}`);
      if (r.unrevealed) problems.push(`${r.unrevealed} reveal(s) never played`);
      if (r.hiddenCount) problems.push(`${r.hiddenCount} invisible text element(s): ${r.hidden.join('; ')}`);
      if (mode.name === 'no-webgl' && (webgl || r.canvases)) problems.push(`WebGL still active (context: ${webgl}, canvases: ${r.canvases})`);
      if (mode.motion === 'reduce' && r.lenis) problems.push('smooth scroll active under reduced motion');
      if (problems.length) failures.push(`${tag}\n    ${problems.join('\n    ')}`);
      summary.push(`${tag.padEnd(44)} keys ${String(r.keys).padStart(4)}  honest ${r.honest}  secondary ${r.secondary}  canvases ${r.canvases}  ${problems.length ? 'FAIL' : 'ok'}`);
      await page.close();
    }
    await context.close();
  }
  await browser.close();
}
console.log(summary.join('\n'));
if (failures.length) {
  console.error(`\n${failures.length} page view(s) failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`\ncheck-pages: all ${summary.length} page views passed`);
