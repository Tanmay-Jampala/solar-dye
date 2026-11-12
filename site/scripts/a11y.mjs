// Accessibility audit: axe-core (WCAG 2.0/2.1 A + AA rules) on every page at 1440x900 and 390x844,
// plus a heading-order check and a keyboard walk that records every focus stop and whether it
// shows a visible focus ring. Exits 1 on any axe violation.
// Usage: ./node.sh node scripts/a11y.mjs [baseUrl] [--motion=reduce] [--json=out.json]
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--')) || 'http://127.0.0.1:4321/';
const motion = args.includes('--motion=reduce') ? 'reduce' : 'no-preference';
const jsonOut = args.find((a) => a.startsWith('--json='))?.slice(7);
const PAGES = ['', 'parts/data/', 'parts/ceiling/', 'parts/hf-vs-b3lyp/', 'parts/twist/', 'parts/descriptors/', 'parts/surrogate/', 'parts/quantum-dots/', 'parts/cost/', 'checks/'];
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true },
];
const gpuArgs = process.platform === 'win32' ? ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] : [];
const browser = await chromium.launch({ args: gpuArgs });
const report = [];
let violations = 0;

for (const vp of viewports) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, reducedMotion: motion });
  for (const p of PAGES) {
    const page = await context.newPage();
    const tag = `${vp.name} /${p}`;
    await page.goto(base + p, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    // Show everything that animates in, so contrast is measured on the final state.
    await page.evaluate(() => document.querySelectorAll('[data-reveal],[data-fade]').forEach((el) => el.classList.add('is-in')));
    await page.waitForTimeout(1600);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const headings = await page.evaluate(() => {
      const hs = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter((h) => !h.closest('[aria-hidden="true"]'));
      const levels = hs.map((h) => Number(h.tagName[1]));
      const skips = [];
      levels.forEach((l, i) => i && l > levels[i - 1] + 1 && skips.push(`${hs[i - 1].tagName}→${hs[i].tagName} "${hs[i].textContent.trim().slice(0, 40)}"`));
      return { h1: levels.filter((l) => l === 1).length, skips };
    });
    // Keyboard walk (desktop only): Tab through the page, record each stop and its focus outline.
    let keyboard = null;
    if (vp.name === 'desktop') {
      const stops = [];
      for (let i = 0; i < 80; i++) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          const cs = getComputedStyle(el);
          const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none';
          const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || el.id || '').trim().replace(/\s+/g, ' ').slice(0, 30);
          return { sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''), label, ring };
        });
        if (!info) break;
        if (stops.length && stops[0].sel === info.sel && stops[0].label === info.label) break; // wrapped
        stops.push(info);
      }
      keyboard = { stops: stops.length, noRing: stops.filter((s) => !s.ring) };
    }
    violations += axe.violations.length;
    report.push({
      tag,
      violations: axe.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => `${n.target.join(' ')} :: ${n.failureSummary?.split('\n')[1]?.trim() || ''}`), count: v.nodes.length })),
      incomplete: axe.incomplete.map((v) => `${v.id} (${v.nodes.length})`),
      headings,
      keyboard,
    });
    await page.close();
  }
  await context.close();
}
await browser.close();

for (const r of report) {
  console.log(`\n== ${r.tag}  axe violations: ${r.violations.length}  h1: ${r.headings.h1}  heading skips: ${r.headings.skips.length}${r.keyboard ? `  tab stops: ${r.keyboard.stops}, without ring: ${r.keyboard.noRing.length}` : ''}`);
  for (const v of r.violations) {
    console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.count})`);
    v.nodes.forEach((n) => console.log(`      ${n}`));
  }
  r.headings.skips.forEach((s) => console.log(`  heading skip: ${s}`));
  r.keyboard?.noRing.forEach((s) => console.log(`  no focus ring: ${s.sel} "${s.label}"`));
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
console.log(`\na11y (${motion}): ${violations} axe violation group(s) across ${report.length} page views`);
process.exit(violations ? 1 : 0);
