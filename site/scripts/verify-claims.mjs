// Verifies the hard rules that are about claims rather than single numbers, on the built site, at
// 1440x900 and 390x844:
//   rule 3  every honest negative is rendered and visible in the home scroll and on its part page;
//   rule 4  every value with a secondary-source status has a "Secondary source" tag in the same row,
//           list item, paragraph or card, wherever it appears;
//   rule 5  the predictor's caveat is beside the output for every preset, and the out-of-range
//           warning appears for an out-of-range input and clears again.
// Writes a JSON summary (for VERIFICATION.md) and exits 1 on any failure.
// Usage: ./node.sh node scripts/verify-claims.mjs [baseUrl] [--json=out.json]
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--')) || 'http://127.0.0.1:4321/';
const jsonOut = args.find((a) => a.startsWith('--json='))?.slice(7);

// Rule 3. Each claim must be found on the home page and on its part page: the smallest element whose
// text matches every pattern and which contains every listed bound key.
const CLAIMS = [
  { id: 'qm9-cannot-reach', text: 'QM9 molecules cannot reach 1.34 eV; the closest prediction is 3.10 eV', part: 'parts/surrogate/',
    home: { re: [/cannot reach the target/i], keys: ['model.screening.closest_predicted_gap_eV'], scope: '#screen' },
    page: { re: [/cannot reach the target/i], keys: ['model.screening.closest_predicted_gap_eV'] } },
  { id: 'top-hits-in-training', text: 'All 10 top hits are training-set molecules', part: 'parts/surrogate/',
    home: { re: [/training set/i], keys: ['model.screening.top_candidates_in_training_set'] },
    page: { re: [/training set/i], keys: ['model.screening.top_candidates_in_training_set'] } },
  { id: 'ml-fails-real-dyes', text: 'The ML models fail badly on real dyes (HOPV15 out-of-domain test)', part: 'parts/surrogate/',
    home: { re: [/out of domain/i], keys: ['model.out_of_domain_hopv.metrics.ridge.MAE_eV', 'model.out_of_domain_hopv.metrics.gradient_boosting.MAE_eV'] },
    page: { re: [/out of domain/i], keys: ['model.out_of_domain_hopv.metrics.ridge.MAE_eV', 'model.out_of_domain_hopv.metrics.gradient_boosting.MAE_eV'] } },
  { id: 'b3lyp-overestimates', text: 'B3LYP overestimates the optical gap; my prediction was wrong', part: 'parts/hf-vs-b3lyp/',
    home: { re: [/prediction was wrong/i, /overshot|overestimat/i], keys: ['quantum.findings.b3lyp_error_vs_experiment_eV.thiophene'] },
    page: { re: [/prediction was wrong/i, /overestimat/i], keys: ['quantum.findings.b3lyp_error_vs_experiment_eV.thiophene'] } },
  { id: 'cdse-cannot-reach', text: 'CdSe cannot reach the target', part: 'parts/quantum-dots/',
    home: { re: [/CdSe/i, /cannot (reach|get there)/i], keys: [], scope: '#screen' },
    page: { re: [/CdSe cannot reach the target/i], keys: [] } },
  { id: 'brus-off-by-2', text: 'Brus is off by 2× for PbS', part: 'parts/quantum-dots/',
    home: { re: [/off by/i], keys: ['quantum_dots.radius_at_optimum_nm.PbS.brus_over_experimental_radius'] },
    page: { re: [/off by/i], keys: ['quantum_dots.radius_at_optimum_nm.PbS.brus_over_experimental_radius'] } },
];

// Rule 4. Keys that are the flagged values themselves.
const FLAGGED = [
  { flag: 'Becker 1996 optical gaps', status: 'quantum.literature_optical_gaps.*.status',
    keys: [/^quantum\.literature_optical_gaps\.\w+\.(gap_eV|source)$/, /^quantum\.molecules\[\d+\]\.reference\.experimental_optical_gap\.(?!status)/, /^quantum\.findings\.(b3lyp|hf)_error_vs_experiment_eV\./] },
  { flag: 'QD parameter page numbers', status: 'quantum_dots.parameters_used.*.status',
    keys: [/^quantum_dots\.parameters_used\.\w+\.(?!status)/] },
  { flag: 'BESCOM tariff', status: 'energy.assumptions.electricity_tariff_INR_per_kWh.status',
    keys: [/^energy\.assumptions\.electricity_tariff_INR_per_kWh(\.(?!status)\w+)?$/] },
];
const PAGES = ['', 'parts/data/', 'parts/ceiling/', 'parts/hf-vs-b3lyp/', 'parts/twist/', 'parts/descriptors/', 'parts/surrogate/', 'parts/quantum-dots/', 'parts/cost/', 'checks/'];

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true },
];
const browser = await chromium.launch({ args: process.platform === 'win32' ? ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] : [] });
const failures = [];
const out = { claims: [], flags: [], predictor: [] };

async function open(page, p) {
  await page.goto(base + p, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('preload'), null, { timeout: 20000 }).catch(() => {});
  const stop = await page.evaluate(() => {
    const n = document.querySelector('[data-next]');
    return Math.max(0, (n ? n.getBoundingClientRect().top + scrollY : document.documentElement.scrollHeight) - innerHeight * 0.6);
  });
  for (let y = 0; y <= stop; y += 600) {
    await page.evaluate((yy) => scrollTo({ top: yy, behavior: 'instant' }), y);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(900);
}

// In the page: locate a claim and report where it is and whether it can be seen.
const locate = ({ re, keys, scope }) => {
  const res = re.map((r) => new RegExp(r.source, r.flags));
  const root = (scope && document.querySelector(scope)) || document.querySelector('main');
  const match = (el) => {
    const t = (el.innerText || '').replace(/\s+/g, ' ');
    return res.every((r) => r.test(t)) && keys.every((k) => el.querySelector(`[data-key="${CSS.escape(k)}"]`));
  };
  const all = Array.from(root.querySelectorAll('*')).filter(match);
  const deepest = all.filter((el) => !Array.from(el.children).some(match));
  const visible = (el) => {
    if (!el.getClientRects().length) return false;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
    }
    return true;
  };
  const label = (el) => {
    const sec = el.closest('section');
    const h = sec?.querySelector('h1, h2, h3, .t-label');
    return `${sec?.id ? '#' + sec.id + ' ' : ''}${(h?.getAttribute('aria-label') || h?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 50)}`;
  };
  return deepest.map((el) => ({ where: label(el), text: el.innerText.trim().replace(/\s+/g, ' ').slice(0, 110), visible: visible(el) }));
};

for (const vp of viewports) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  // --- rule 3 ---------------------------------------------------------------------------------
  await open(page, '');
  const home = {};
  for (const c of CLAIMS) home[c.id] = await page.evaluate(locate, { re: c.home.re.map((r) => ({ source: r.source, flags: r.flags })), keys: c.home.keys, scope: c.home.scope }).catch((e) => [{ error: e.message }]);
  // --- rule 5 (home page) -------------------------------------------------------------------------
  const pred = await page.evaluate(async () => {
    const card = document.querySelector('[data-predictor]');
    card.scrollIntoView();
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const caveat = card.querySelector('.pred__caveat');
    const gap = card.querySelector('[data-out-gap]');
    const warn = card.querySelector('[data-out-warn]');
    const rows = [];
    const seen = (el) => el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.hidden;
    const chips = Array.from(card.querySelectorAll('[data-preset]'));
    for (const chip of chips) {
      chip.click();
      await wait(60);
      const g = gap.getBoundingClientRect(), cv = caveat.getBoundingClientRect();
      // "Beside": the caveat is the output's neighbour (right of it on desktop, directly below on
      // phones), within one screen height.
      const near = Math.abs(cv.top - g.bottom) < window.innerHeight && (cv.left >= g.left - 2 || cv.top >= g.top);
      rows.push({
        preset: chip.innerText.trim(),
        gap: gap.innerText.trim(),
        caveatVisible: !!seen(caveat),
        caveatNear: near,
        caveatSaysToy: /toy/i.test(caveat.innerText) && !!caveat.querySelector('[data-key="model.metrics.ridge.test.MAE_eV"]'),
        warning: seen(warn) ? warn.innerText.trim() : '',
      });
    }
    // Out-of-range input: type a value far above the largest seen in QM9 into the first field.
    chips[0].click();
    await wait(60);
    const before = seen(warn) ? warn.innerText.trim() : '';
    const field = card.querySelector('[data-field]');
    const input = field.querySelector('[data-input]');
    const max = Number(field.querySelector('[data-slider]').max);
    input.value = String(max * 3 + 10);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(80);
    const outOfRange = { input: input.value, warning: seen(warn) ? warn.innerText.trim() : '', fieldState: field.dataset.state || '', caveatVisible: !!seen(caveat) };
    chips[0].click();
    await wait(80);
    // The out-of-range part must go; the preset's own warning (if any) must come back unchanged.
    const after = seen(warn) ? warn.innerText.trim() : '';
    const cleared = !/outside the range/.test(after) && after === before;
    return { rows, outOfRange, cleared };
  });
  out.predictor.push({ viewport: vp.name, ...pred });
  for (const r of pred.rows) {
    if (!r.caveatVisible || !r.caveatNear || !r.caveatSaysToy) failures.push(`${vp.name} predictor preset "${r.preset}": caveat ${!r.caveatVisible ? 'not visible' : !r.caveatNear ? 'not beside the output' : 'missing its MAE or "toy"'}`);
  }
  if (!/outside the range seen in QM9/.test(pred.outOfRange.warning)) failures.push(`${vp.name} predictor: no out-of-range warning for input ${pred.outOfRange.input}`);
  if (!pred.cleared) failures.push(`${vp.name} predictor: after re-choosing the preset the warning did not return to the preset's own state`);

  for (const c of CLAIMS) {
    await open(page, c.part);
    const onPage = await page.evaluate(locate, { re: c.page.re.map((r) => ({ source: r.source, flags: r.flags })), keys: c.page.keys });
    const entry = { viewport: vp.name, id: c.id, text: c.text, home: home[c.id], part: c.part, page: onPage };
    out.claims.push(entry);
    for (const [where, locs] of [['home', home[c.id]], [c.part, onPage]]) {
      if (!locs.length) failures.push(`${vp.name} ${c.id}: not found on ${where || 'home'}`);
      else if (!locs.some((l) => l.visible)) failures.push(`${vp.name} ${c.id}: present but not visible on ${where}`);
    }
  }

  // --- rule 4 ---------------------------------------------------------------------------------
  for (const p of PAGES) {
    await open(page, p);
    const found = await page.evaluate((patterns) => {
      const res = patterns.map((g) => ({ flag: g.flag, keys: g.keys.map((s) => new RegExp(s)) }));
      const rows = [];
      document.querySelectorAll('[data-key]').forEach((el) => {
        if (el.closest('.sr-only')) return; // the tag's own screen-reader status text
        const key = el.dataset.key;
        const g = res.find((x) => x.keys.some((r) => r.test(key)));
        if (!g) return;
        const box = el.closest('tr, li, p, [class*="__item"], dl, .card, figure, aside, [class*="__card"], [class*="-card"]') || el.parentElement;
        const sec = el.closest('section');
        rows.push({ flag: g.flag, key, shown: el.innerText.trim().slice(0, 40), tagged: !!box.querySelector('.tag-secondary'), where: `${sec?.id ? '#' + sec.id + ' ' : ''}${(sec?.querySelector('h1, h2, .t-label')?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40)}` });
      });
      return rows;
    }, FLAGGED.map((g) => ({ flag: g.flag, keys: g.keys.map((r) => r.source) })));
    for (const f of found) {
      out.flags.push({ viewport: vp.name, page: '/' + p, ...f });
      if (!f.tagged) failures.push(`${vp.name} /${p} ${f.key} ("${f.shown}") has no Secondary-source tag beside it (${f.where})`);
    }
  }
  if (errors.length) failures.push(`${vp.name}: console errors: ${errors.slice(0, 3).join(' | ')}`);
  await context.close();
}
await browser.close();

// --- console summary -------------------------------------------------------------------------------
for (const c of out.claims.filter((x) => x.viewport === 'desktop')) {
  console.log(`\n[${c.id}] ${c.text}`);
  c.home.forEach((l) => console.log(`  home        ${l.visible ? 'visible' : 'HIDDEN '}  ${l.where} :: ${l.text}`));
  c.page.forEach((l) => console.log(`  /${c.part.padEnd(18)} ${l.visible ? 'visible' : 'HIDDEN '}  ${l.where} :: ${l.text}`));
}
const flagCount = out.flags.filter((f) => f.viewport === 'desktop');
console.log(`\nsecondary-source values shown (desktop): ${flagCount.length}, tagged beside: ${flagCount.filter((f) => f.tagged).length}`);
for (const p of out.predictor) console.log(`predictor ${p.viewport}: ${p.rows.length} presets, caveat beside output on all: ${p.rows.every((r) => r.caveatVisible && r.caveatNear && r.caveatSaysToy)}; out-of-range warning: "${p.outOfRange.warning.slice(0, 70)}…"; cleared: ${p.cleared}`);
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(out, null, 2));
if (failures.length) {
  console.error(`\nverify-claims: ${failures.length} failure(s):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('\nverify-claims: all claims, flags and predictor checks passed');
