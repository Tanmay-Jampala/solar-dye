// Number audit: loads every built page in headless Chromium (after its scripts have run), lists every
// bound value it shows ([data-key], i.e. <Num> and the runtime equivalents) with the results.json
// key it came from, and re-derives what it should say by running the site's own format() on the
// value in results.json. It also scans the rendered text and the number-bearing attributes for any
// digit that is not bound (the runtime counterpart of lint-numbers). Writes site/NUMBER_AUDIT.md.
// Exits 1 on any mismatch or unbound number.
// Usage: ./node.sh node scripts/audit-numbers.mjs [baseUrl]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] || 'http://127.0.0.1:4321/';
const PAGES = ['', 'parts/data/', 'parts/ceiling/', 'parts/hf-vs-b3lyp/', 'parts/twist/', 'parts/descriptors/', 'parts/surrogate/', 'parts/quantum-dots/', 'parts/cost/', 'checks/'];

// --- the site's own format() and get(), loaded straight from src/lib (types stripped by Node) ---
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'solar-dye-audit-'));
for (const f of ['format.ts', 'constants.ts', 'data.ts', 'words.ts']) {
  const src = fs.readFileSync(path.join(site, 'src', 'lib', f), 'utf-8').replace(/from '\.\/(\w+)'/g, "from './$1.ts'");
  fs.writeFileSync(path.join(tmp, f), src);
}
const { format, DERIVED } = await import(pathToFileURL(path.join(tmp, 'format.ts')).href);
const { get, has } = await import(pathToFileURL(path.join(tmp, 'data.ts')).href);
const { countOf, word } = await import(pathToFileURL(path.join(tmp, 'words.ts')).href);
fs.rmSync(tmp, { recursive: true, force: true });

// Same allow-list as lint-numbers: names and codes that contain digits but are not results.
const ALLOW = [
  /\b25BSCH01\b/g, /\bAM1\.5G?\b/g, /6-31G\*?(\(2df,p\))?/g, /\bB3LYP\b/g, /\bMMFF94\b/g, /\bQM9\b/g, /\bHOPV15\b/g,
  /\bSHA-?256\b/gi, /\b3D\b/g, /\bfig\d{2}(_\w+)?\b/gi, /\bPART [0-7]\b/gi, /\b0[0-7]\s*\/\s*0[0-7]\b/g,
  /\b4-(nitroaniline|aminobenzonitrile)\b/gi, /\bln\s?2\b/g, /\b(19|20)\d{2}\b/g, /\bWOFF2\b/g, /\bH2O\b/g, /\bsrc\.\w+/g, /\b404\b/g,
  /CO₂/g, /\bsp[23]\b/g,
  /\b3σ/g, // the predictor's out-of-distribution warning threshold (src/lib/ridge.ts), not a result
];
const strayDigits = (text) => {
  let t = text;
  for (const p of ALLOW) t = t.replace(p, ' ');
  return /\d/.test(t) ? t.replace(/\s+/g, ' ').trim() : null;
};

const browser = await chromium.launch({ args: process.platform === 'win32' ? ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] : [] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const report = [];
for (const p of PAGES) {
  await page.goto(base + p, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('preload'), null, { timeout: 20000 }).catch(() => {});
  // Scroll to just above the next-page panel (it auto-advances), so lazy content renders.
  const stop = await page.evaluate(() => {
    const n = document.querySelector('[data-next]');
    return Math.max(0, (n ? n.getBoundingClientRect().top + scrollY : document.documentElement.scrollHeight) - innerHeight * 0.6);
  });
  for (let y = 0; y <= stop; y += 700) {
    await page.evaluate((yy) => scrollTo({ top: yy, behavior: 'instant' }), y);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(800);
  const data = await page.evaluate(() => {
    const where = (el) => {
      if (el.closest('[data-preloader]')) return 'preloader';
      const sec = el.closest('section, header, footer, nav');
      if (!sec) return 'page';
      const h = sec.querySelector('h1, h2, h3');
      // innerText keeps the spaces between a heading's split lines; fall back to the aria-label.
      const label = sec.getAttribute('aria-label') || (h ? (h.getAttribute('aria-label') || h.innerText).trim().replace(/\s+/g, ' ') : '') || sec.id || sec.className.split(' ')[0];
      return label.slice(0, 48);
    };
    const shown = (el) => {
      const c = el.cloneNode(true);
      c.querySelectorAll('.unit, [aria-hidden="true"]').forEach((n) => n.remove());
      return c.textContent.trim();
    };
    const raw = Array.from(document.querySelectorAll('[data-key]'))
      .filter((el) => !el.parentElement.closest('[data-key]'))
      .map((el) => ({
        el,
        block: el.closest('[data-reveal]'),
        key: el.dataset.key,
        derived: el.dataset.derived || '',
        rule: el.dataset.rule || '',
        filter: el.dataset.where || '',
        shown: el.querySelector('.katex') ? '' : shown(el),
        tex: el.querySelector('.katex')?.textContent || '',
        unit: el.querySelector(':scope > .unit')?.textContent.trim() || '',
        sr: !!el.closest('.sr-only'),
        where: where(el),
      }));
    // The line-reveal animation splits a long bound string into one span per word, each keeping the
    // key: join consecutive pieces of the same key in the same block back into the original string.
    const nums = [];
    for (const n of raw) {
      const prev = nums[nums.length - 1];
      if (prev && n.block && prev.block === n.block && prev.key === n.key && prev.filter === n.filter && prev.derived !== 'count' && prev.el.closest('.w') && n.el.closest('.w')) {
        prev.shown += ' ' + n.shown;
        prev.el = n.el;
        continue;
      }
      nums.push(n);
    }
    nums.forEach((n) => {
      delete n.el;
      delete n.block;
    });
    // Rendered text outside bound values (decorative aria-hidden copies excluded).
    const c = document.body.cloneNode(true);
    c.querySelectorAll('[data-key], [aria-hidden="true"], script, style, svg, noscript, template').forEach((n) => n.remove());
    // One entry per text node, so neighbouring blocks are not glued together.
    const textLines = [];
    const tw = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
    for (let t = tw.nextNode(); t; t = tw.nextNode()) {
      if (!t.textContent.trim()) continue;
      // The surrounding block's text gives the sentence back to words split by the line reveal.
      const block = t.parentElement.closest('p, h1, h2, h3, h4, li, td, th, dd, dt, figcaption, caption, label, button, a, blockquote') || t.parentElement;
      textLines.push({ t: t.textContent.trim(), ctx: block.textContent.replace(/\s+/g, ' ').trim() });
    }
    const attrs = [];
    document.querySelectorAll('[data-bound]').forEach((el) => {
      for (const a of el.dataset.bound.split(/\s+/)) {
        const v = el.getAttribute(a);
        if (v) attrs.push({ attr: a, tag: el.tagName.toLowerCase(), value: v, where: where(el) });
      }
    });
    return { nums, textLines, attrs };
  });
  report.push({ page: '/' + p, ...data });
}
await browser.close();

// --- check every bound value against results.json --------------------------------------------
const hasDigit = (s) => /\d/.test(s);
const issues = [];
const allShown = new Set();
let totals = { bound: 0, numeric: 0, exact: 0, computed: 0, browser: 0 };
for (const r of report) {
  for (const n of r.nums) {
    totals.bound++;
    if (hasDigit(n.shown) || n.derived === 'count') totals.numeric++;
    allShown.add(n.shown);
    if (!has(n.key)) {
      // Values computed in the browser (the predictor's output): checked by the Ridge parity test.
      n.kind = 'browser';
      n.expected = '(computed in the browser)';
      totals.browser++;
      continue;
    }
    const raw = get(n.key);
    if (n.tex) {
      // Typeset (KaTeX) form of a stored equation: its constants must be the stored string's.
      const consts = (t) => (t.match(/\d+(\.\d+)?/g) || []).sort().join(' ');
      n.kind = 'typeset';
      n.shown = `typeset; constants ${consts(n.tex)}`;
      n.expected = `stored string's constants ${consts(String(raw))}`;
      if (consts(n.tex) !== consts(String(raw))) issues.push(`${r.page} ${n.key}: typeset constants [${consts(n.tex)}] differ from the stored equation [${consts(String(raw))}]`);
      else totals.exact++;
      continue;
    }
    if (n.derived === 'count') {
      // A count written as a word: recount the array at the key.
      const c = countOf(n.key, n.filter || undefined);
      n.kind = `count${n.filter ? ` (${n.filter})` : ''}`;
      n.expected = `${word(c)} (${c} items)`;
      if (word(c) !== n.shown.toLowerCase()) issues.push(`${r.page} ${n.key}: shows "${n.shown}", the count is ${c}`);
      else totals.exact++;
      continue;
    }
    if (n.derived === 'computed') {
      n.kind = 'computed';
      n.expected = `(computed from this key${n.rule ? `, precision of ${n.rule}` : ''})`;
      totals.computed++;
      continue;
    }
    let f;
    try {
      f = n.derived && DERIVED[n.derived] ? format(n.key, raw, n.derived) : format(n.rule || n.key, raw);
    } catch (e) {
      n.kind = 'error';
      n.expected = String(e.message);
      issues.push(`${r.page} ${n.key}: ${e.message}`);
      continue;
    }
    n.kind = n.derived && DERIVED[n.derived] ? `derived: ${n.derived}` : 'exact';
    n.expected = f.n;
    if (f.n !== n.shown) issues.push(`${r.page} ${n.key}: shows "${n.shown}", results.json formats to "${f.n}"`);
    else totals.exact++;
    if (f.u && n.unit && f.u !== n.unit) issues.push(`${r.page} ${n.key}: unit "${n.unit}", rule says "${f.u}"`);
  }
}
// Unbound digits in rendered text, and numbers in bound attributes that match no bound value.
const unbound = [];
for (const r of report) {
  for (const { t: line } of r.textLines) {
    const s = strayDigits(line);
    if (s) unbound.push(`${r.page} text: ${s.slice(0, 100)}`);
  }
  for (const a of r.attrs) {
    let t = a.value;
    for (const p of ALLOW) t = t.replace(p, ' ');
    for (const tok of t.match(/[−-]?\d[\d,]*(\.\d+)?/g) || []) {
      if (![...allShown].some((v) => v === tok || v.includes(tok))) unbound.push(`${r.page} <${a.tag} ${a.attr}>: "${tok}" in "${a.value.slice(0, 80)}"`);
    }
  }
}

// Numbers written as words in unbound text. Bound counts use <Count>; what remains must be one of
// these, each a name, a structural fact of the method or the page, or an ordinal, not a result.
const WORD = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twice|half|double|dozen|hundreds?|thousands?|millions?)\b/gi;
const WORD_OK = [
  [/\btwo-ring\b|\bthree-ring\b/i, 'chemical structure (bithiophene has two rings, terthiophene three)'],
  [/rule of five/i, "the name of Lipinski's rule"],
  [/\btwo filters\b/i, 'the two filters are named in the same sentence (Lipinski and the dye filter)'],
  [/optimised twice|two quantum methods/i, 'the two methods are named: Hartree–Fock and B3LYP'],
  [/\btwo of them\b/i, 'heading of the two honest-negative blocks that follow it'],
  [/\bTunnel two\b/i, 'section label (second scene of the dark chapter)'],
  [/\bEight steps\b/i, 'the eight parts of the study (site structure: one page per part)'],
  [/between the two\b/i, 'refers to the two curves just named (ceiling and measured dyes)'],
  [/factor of ten\b/i, 'axis design of the log ruler (one tick per decade)'],
  [/Two public datasets/i, 'the two datasets are named in the next sentences: QM9 and HOPV15'],
  [/\bhalf the heavy atoms\b/i, 'the wording of a dye-filter rule, stored in results.json'],
];
const words = [];
for (const r of report) {
  for (const { t: line, ctx: block } of r.textLines) {
    for (const m of line.matchAll(WORD)) {
      const at = Math.max(0, block.toLowerCase().indexOf(m[0].toLowerCase()));
      const ctx = block.slice(Math.max(0, at - 40), at + 40);
      // The allow-listed phrase must contain this very word, not merely sit near it.
      const ok = WORD_OK.find(([re]) => {
        const hit = ctx.match(re);
        return hit && hit[0].toLowerCase().includes(m[0].toLowerCase());
      });
      words.push({ page: r.page, word: m[0], ctx, reason: ok?.[1] || '' });
      if (!ok) unbound.push(`${r.page} number word "${m[0]}" not bound: …${ctx}…`);
    }
  }
}

// --- NUMBER_AUDIT.md -------------------------------------------------------------------------------
const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const cut = (s, n = 60) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const now = new Date().toISOString().slice(0, 10);
let md = `# Number audit\n\n`;
md += `Generated by \`scripts/audit-numbers.mjs\` on ${now} from the built site (\`npm run build\`), with every page loaded in headless Chromium after its scripts ran (desktop, 1440×900, scrolled through so lazy sections render).\n\n`;
md += `For each value shown, the script reads the key from the element's \`data-key\`, looks it up in \`results/results.json\`, and runs the site's own \`format()\` (\`src/lib/format.ts\`) on it. "Matches" means the text on the page is exactly what that produces.\n\n`;
md += `## Summary\n\n`;
md += `| | Count |\n|---|---|\n`;
md += `| Bound values on all pages (text and numbers) | ${totals.bound} |\n`;
md += `| …of which contain digits (listed below) | ${totals.numeric} |\n`;
md += `| Match \`format(results.json value)\` exactly (including derived) | ${totals.exact} |\n`;
md += `| Computed at build from a results.json value (e.g. counts of rows) | ${totals.computed} |\n`;
md += `| Computed in the browser (predictor output; checked by the Ridge parity test) | ${totals.browser} |\n`;
md += `| **Mismatches** | **${issues.length}** |\n`;
md += `| **Digits in page text or attributes that are not bound to a key** | **${unbound.length}** |\n\n`;
md += `Derived values: \`hoursFromSeconds\`, \`minutesFromSeconds\`, \`gigahertz\` are unit conversions; \`wavelengthFromEv\` is λ = hc / E with hc = 1239.841984 eV·nm (\`src/lib/constants.ts\`). Each is labelled as derived on the page where it appears.\n\n`;
md += `Unit changes inside precision rules (listed as "exact", since \`format()\` itself applies them): fractions shown as % (×100); torsion energies, the planarity barrier and kT stored in eV but shown in meV (×1000); CO₂ under 1 kg shown in g (×1000). No rule changes the value beyond its stated decimal places.\n\n`;
md += `Not covered by this DOM audit: text drawn inside WebGL canvases. That text is the laptop screen's funnel counts, drawn from \`model.screening.funnel\` through the same \`format()\`, and the molecule and element names on the predictor stickers, which contain no numbers.\n\n`;
md += `Counts written as words ("eleven descriptors", "nine molecules") are bound too, with \`<Count>\`: the word is generated from the length of the array at the key and re-counted here (kind "count"). The remaining number words in unbound text are listed at the end with the reason each is not a result.\n\n`;
if (issues.length) md += `### Mismatches\n\n${issues.map((i) => `- ${esc(i)}`).join('\n')}\n\n`;
if (unbound.length) md += `### Unbound digits\n\n${unbound.map((i) => `- ${esc(i)}`).join('\n')}\n\n`;
for (const r of report) {
  const rows = r.nums.filter((n) => hasDigit(n.shown) || n.derived === 'count');
  md += `## \`${r.page}\` — ${rows.length} numbers\n\n`;
  md += `| # | Shown | Unit | results.json key | Kind | Expected | Section |\n|---|---|---|---|---|---|---|\n`;
  rows.forEach((n, i) => {
    const ok = n.kind === 'exact' || n.kind?.startsWith('derived') ? (n.expected === n.shown ? '✓ ' : '✗ ') : '';
    md += `| ${i + 1} | ${esc(cut(n.shown))}${n.sr ? ' *(screen-reader text)*' : ''} | ${esc(n.unit)} | \`${esc(n.key)}\` | ${esc(n.kind)} | ${ok}${esc(cut(n.expected))} | ${esc(n.where)} |\n`;
  });
  const a = r.attrs.filter((x) => hasDigit(x.value));
  if (a.length) {
    md += `\nNumbers in attributes (built with the same \`format()\`; each number also appears as a bound value on the site):\n\n`;
    a.forEach((x) => (md += `- \`<${x.tag} ${x.attr}>\`: ${esc(cut(x.value, 160))}\n`));
  }
  md += '\n';
}
const okWords = words.filter((w) => w.reason);
if (okWords.length) {
  md += `## Number words in unbound text\n\nEach is a name, a structural fact of the method or the page, or an ordinal; none states a result.\n\n| Page | Word | Context | Why it is not a result |\n|---|---|---|---|\n`;
  okWords.forEach((w) => (md += `| \`${w.page}\` | ${w.word} | …${esc(w.ctx)}… | ${esc(w.reason)} |\n`));
  md += '\n';
}
fs.writeFileSync(path.join(site, 'NUMBER_AUDIT.md'), md);
console.log(`audit-numbers: ${totals.bound} bound values (${totals.numeric} with digits), ${totals.exact} exact matches, ${totals.computed} build-computed, ${totals.browser} browser-computed, ${issues.length} mismatches, ${unbound.length} unbound -> NUMBER_AUDIT.md`);
if (issues.length || unbound.length) {
  console.error([...issues, ...unbound].slice(0, 40).join('\n'));
  process.exit(1);
}
