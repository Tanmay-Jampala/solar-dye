// Checkpoint screenshots of the part pages and the checks page at 1440x900 and 390x844:
// a full-page shot of each (reveals forced to their final state), plus the interactives after
// one interaction. Exits 1 on console errors.
// Usage: ./node.sh node scripts/screenshots-pages.mjs [baseUrl] [outDir]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:4321/';
const out = path.resolve(process.argv[3] || 'shots/pages');
fs.mkdirSync(out, { recursive: true });
const PAGES = ['parts/data/', 'parts/ceiling/', 'parts/hf-vs-b3lyp/', 'parts/twist/', 'parts/descriptors/', 'parts/surrogate/', 'parts/quantum-dots/', 'parts/cost/', 'checks/'];
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true },
];
const gpuArgs = process.platform === 'win32' ? ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] : [];
const browser = await chromium.launch({ args: gpuArgs });
const errors = [];
for (const vp of viewports) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  for (const p of PAGES) {
    const page = await context.newPage();
    const tag = `${vp.name}-${p.replace(/\/$/, '').replace(/\//g, '-')}`;
    page.on('console', (m) => m.type() === 'error' && errors.push(`${tag}: ${m.text()}`));
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    await page.goto(base + p, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    await page.evaluate(() => document.querySelectorAll('[data-reveal],[data-fade]').forEach((el) => el.classList.add('is-in')));
    // interactions
    if (p.includes('hf-vs-b3lyp')) await page.click('tr[data-mol="azobenzene"]').catch(() => {});
    if (p.includes('twist')) await page.$eval('[data-torsion-slider]', (s) => { s.value = '9'; s.dispatchEvent(new Event('input')); });
    if (p.includes('quantum-dots')) await page.$eval('[data-radius-slider]', (s) => { s.value = '60'; s.dispatchEvent(new Event('input')); });
    await page.waitForTimeout(1500);
    for (const sel of ['[data-viewer]', '[data-torsion]', '[data-radius]']) {
      const el = await page.$(sel);
      if (el) {
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(800);
        await el.screenshot({ path: path.join(out, `${tag}-widget-${sel.replace(/\W/g, '')}.png`) });
      }
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, `${tag}.png`), fullPage: true });
    await page.close();
  }
  await context.close();
}
await browser.close();
console.log(`page screenshots written to ${out}`);
if (errors.length) {
  console.error('console errors:\n' + errors.join('\n'));
  process.exit(1);
}
