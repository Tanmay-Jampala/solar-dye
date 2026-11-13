// Record the demo video: a scripted, real-time walk through the built site, captured with Chrome's
// screencast, resampled to constant 30 fps and encoded to H.264 MP4 by ffmpeg.
//
// - Real time: frames are timestamped by Chrome and resampled on the fly, so the WebGL scenes play at
//   their true speed. Frames are piped straight into ffmpeg (nothing large is written to disk).
// - An overlay injected into every page draws a visible cursor, click ripples, captions and fades.
// - Caption numbers are read from results.json and formatted by the site's own format(), so the
//   video follows the same rule as the site: no typed numbers.
//
// Usage (from site/, with the site served, e.g. the GitHub Pages build under /solar-dye/):
//   ./node.sh node scripts/record-demo.mjs [--base http://127.0.0.1:4321/solar-dye/] [--out ../demo/solar-dye-demo.mp4]
// Needs ffmpeg with libx264: $FFMPEG, the conda-forge build in this Node environment, or ffmpeg on PATH.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://127.0.0.1:4321/solar-dye/').replace(/\/?$/, '/');
const OUT = path.resolve(site, arg('out', '../demo/solar-dye-demo.mp4'));
const FPS = 30;
const W = 1920, H = 1080;

// --- caption text, with numbers from results.json via the site's format() ------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-'));
let fmt, data, words;
try {
  for (const f of ['format.ts', 'constants.ts', 'data.ts', 'words.ts']) {
    fs.writeFileSync(path.join(tmp, f), fs.readFileSync(path.join(site, 'src', 'lib', f), 'utf-8').replace(/from '\.\/(\w+)'/g, "from './$1.ts'"));
  }
  fmt = await import(pathToFileURL(path.join(tmp, 'format.ts')).href);
  data = await import(pathToFileURL(path.join(tmp, 'data.ts')).href);
  words = await import(pathToFileURL(path.join(tmp, 'words.ts')).href);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
const n = (key, unit, derived) => fmt.formatText(key, data.get(key), unit, derived);
const funnel = data.get('model.screening.funnel');
const funnelText = funnel.map((_, i) => n(`model.screening.funnel[${i}].count`)).join(' → ');
const checks = data.get('checks');
const passed = checks.filter((c) => c.passed).length;
const C = {
  title: ['Designing a Solar Dye on a Laptop', 'Tanmay Jampala · Computational Chemistry 25BSCH01 · Jain University (FET)'],
  hero: [`The ${words.countWord('quantum.molecules')} Part 2 molecules, built from their B3LYP geometries`, 'Move to push them · click one to see its name'],
  target: [`The target: a band gap of ${n('sq.optimum_gap_eV', 'eV')}`, 'Shockley–Queisser detailed balance on the AM1.5G solar spectrum'],
  ceiling: [`At most ${n('sq.optimum_efficiency_percent')} of sunlight becomes electricity, at ${n('sq.optimum_gap_eV', 'eV')}`, 'Drag the cursor: every value is read from the stored curve'],
  // "Eight": the eight parts of the study (the site's structure, as on the home page), not a result.
  experiments: ['Eight experiments, one page each', 'From the data to the cost of the computation'],
  laptop: ['Everything ran on one laptop', String(data.get('quantum.hardware'))],
  funnel: [`Screening QM9: ${funnelText}`, 'Machine-learning predictions first, then B3LYP checks of the top three'],
  honest: ['Honest negative: QM9 cannot reach the target', `Closest prediction ${n('model.screening.closest_predicted_gap_eV', 'eV')}, ${n('model.screening.closest_distance_from_target_eV', 'eV')} short · ${n('model.screening.top_candidates_in_training_set')} of the top ${n(`model.screening.funnel[${funnel.length - 2}].count`)} hits were training molecules`],
  dots: ['Quantum dots: CdSe cannot reach the target; PbS can', `But the Brus model misplaces the PbS size by a factor of ${n('quantum_dots.radius_at_optimum_nm.PbS.brus_over_experimental_radius')}`],
  hopv: [`${n('quantum_dots.sq_placement.hopv_experimental.count')} real dyes, measured in real labs`, 'Their efficiencies sit far below the thermodynamic ceiling'],
  ood: ['Honest negative: the models fail on real dyes', `Mean error on HOPV15: Ridge ${n('model.out_of_domain_hopv.metrics.ridge.MAE_eV', 'eV')}, gradient boosting ${n('model.out_of_domain_hopv.metrics.gradient_boosting.MAE_eV', 'eV')}`],
  predictor: ['Try it: the Ridge model, running in your browser', `The weakest of the ${words.countWord('model.metrics')} models (test MAE ${n('model.metrics.ridge.test.MAE_eV', 'eV')}), and labelled so beside every prediction`],
  outOfRange: ['Out-of-range inputs raise a warning', 'The model has seen few or no molecules like that'],
  rayEnd: [`The light ray ends at ${n('sq.optimum_gap_eV', undefined, 'wavelengthFromEv')}`, `λ = hc / E for the ${n('sq.optimum_gap_eV', 'eV')} target (derived)`],
  part2: ['Part 2 · Hartree–Fock vs B3LYP', 'Click a molecule to view its optimised B3LYP geometry'],
  part3: ['Part 3 · The twist', `Every frame is a stored, relaxed B3LYP geometry · minimum at ${n('torsion.minimum_angle_deg', '°')} · ${n('torsion.barrier_to_planarity_eV')} (${n('torsion.barrier_to_planarity_over_kT')} kT) to flatten`],
  part6: ['Part 6 · Quantum dots', 'Drag the radius: gap, wavelength and emission colour from the Brus curves'],
  checks: [`${passed}/${checks.length} self-checks passed`, 'Every number on the site is read from results.json'],
};

// --- the overlay injected into every page ------------------------------------------------------------------
const OVERLAY = () => {
  const ready = (fn) => (document.documentElement ? fn() : document.addEventListener('readystatechange', fn, { once: true }));
  ready(() => {
    if (window.__demo) return;
    const root = document.createElement('div');
    root.id = 'demo-overlay';
    root.innerHTML = `
      <style>
        #demo-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; font-family: 'General Sans', ui-sans-serif, system-ui, sans-serif; }
        #demo-fade { position: absolute; inset: 0; background: #05060c; opacity: 0; transition: opacity 0.45s ease; }
        #demo-cursor { position: absolute; left: 0; top: 0; width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%;
          background: rgba(255,255,255,0.92); box-shadow: 0 0 0 2px rgba(26,47,251,0.95), 0 4px 14px rgba(0,0,0,0.35); opacity: 0; transition: opacity 0.3s; }
        #demo-cursor.is-down { transform: scale(0.8); }
        .demo-ripple { position: absolute; width: 64px; height: 64px; margin: -32px 0 0 -32px; border-radius: 50%; border: 3px solid rgba(26,47,251,0.9);
          animation: demo-ripple 0.6s ease-out forwards; }
        @keyframes demo-ripple { from { transform: scale(0.3); opacity: 1; } to { transform: scale(1.4); opacity: 0; } }
        #demo-cap { position: absolute; left: 56px; bottom: 56px; max-width: 1180px; padding: 22px 30px 24px; border-radius: 18px;
          background: rgba(6,7,14,0.82); color: #fff; backdrop-filter: blur(8px); opacity: 0; transform: translateY(18px);
          transition: opacity 0.5s ease, transform 0.6s cubic-bezier(0.16,1,0.3,1); }
        #demo-cap.is-on { opacity: 1; transform: none; }
        #demo-cap h3 { margin: 0; font-size: 34px; line-height: 1.15; font-weight: 500; letter-spacing: -0.01em; }
        #demo-cap p { margin: 10px 0 0; font: 18px/1.4 'IBM Plex Mono', ui-monospace, monospace; color: rgba(255,255,255,0.78); }
        #demo-cap .bar { position: absolute; left: 0; top: 18px; bottom: 18px; width: 4px; border-radius: 2px; background: #c1ff00; }
        #demo-card { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; background: #05060c; color: #fff; opacity: 0; transition: opacity 0.6s ease; }
        #demo-card.is-on { opacity: 1; }
        #demo-card h1 { margin: 0 0 22px; font-size: 76px; font-weight: 400; letter-spacing: -0.03em; }
        #demo-card p { margin: 8px 0; font: 26px/1.4 'IBM Plex Mono', ui-monospace, monospace; color: rgba(255,255,255,0.8); }
        #demo-card .k { font: 500 20px/1 'General Sans', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: #c1ff00; margin-bottom: 26px; }
      </style>
      <div id="demo-fade"></div>
      <div id="demo-card"></div>
      <div id="demo-cap"><span class="bar"></span><h3></h3><p></p></div>
      <div id="demo-cursor"></div>`;
    document.documentElement.appendChild(root);
    const fade = root.querySelector('#demo-fade');
    const cursor = root.querySelector('#demo-cursor');
    const cap = root.querySelector('#demo-cap');
    const card = root.querySelector('#demo-card');
    try {
      if (sessionStorage.getItem('demoFade') === '1') {
        fade.style.transition = 'none';
        fade.style.opacity = '1';
      }
    } catch {}
    window.addEventListener('pointermove', (e) => {
      cursor.style.opacity = '1';
      cursor.style.left = `${e.clientX}px`;
      cursor.style.top = `${e.clientY}px`;
    }, true);
    window.addEventListener('pointerdown', (e) => {
      cursor.classList.add('is-down');
      const r = document.createElement('div');
      r.className = 'demo-ripple';
      r.style.left = `${e.clientX}px`;
      r.style.top = `${e.clientY}px`;
      root.appendChild(r);
      setTimeout(() => r.remove(), 700);
    }, true);
    window.addEventListener('pointerup', () => cursor.classList.remove('is-down'), true);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__demo = {
      async caption(title, sub) {
        if (cap.classList.contains('is-on')) {
          cap.classList.remove('is-on');
          await wait(450);
        }
        cap.querySelector('h3').textContent = title;
        cap.querySelector('p').textContent = sub || '';
        cap.querySelector('p').style.display = sub ? '' : 'none';
        cap.classList.add('is-on');
      },
      async hideCaption() {
        cap.classList.remove('is-on');
        await wait(450);
      },
      async fadeOut() {
        fade.style.transition = 'opacity 0.45s ease';
        fade.style.opacity = '1';
        try { sessionStorage.setItem('demoFade', '1'); } catch {}
        await wait(500);
      },
      async fadeIn() {
        fade.style.transition = 'opacity 0.6s ease';
        fade.style.opacity = '0';
        try { sessionStorage.removeItem('demoFade'); } catch {}
        await wait(650);
      },
      async card(html) {
        card.innerHTML = html;
        card.classList.add('is-on');
        await wait(700);
      },
      hideCursor() { cursor.style.opacity = '0'; },
      scrollTo(y, ms) {
        const from = window.scrollY, to = Math.max(0, Math.min(y, document.documentElement.scrollHeight - innerHeight));
        const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
        return new Promise((resolve) => {
          const t0 = performance.now();
          const step = (now) => {
            const t = Math.min(1, (now - t0) / ms);
            window.scrollTo(0, from + (to - from) * ease(t));
            if (t < 1) requestAnimationFrame(step);
            else resolve();
          };
          requestAnimationFrame(step);
        });
      },
      top(sel, offset = 0) {
        const el = document.querySelector(sel);
        return el ? el.getBoundingClientRect().top + window.scrollY + offset : null;
      },
    };
  });
};

// --- capture: screencast -> constant-frame-rate JPEG pipe -> ffmpeg ---------------------------------------
fs.mkdirSync(path.dirname(OUT), { recursive: true });
// ffmpeg: $FFMPEG, else the conda-forge build next to this Node (Library/bin on Windows), else PATH.
const bundled = path.join(path.dirname(process.execPath), 'Library', 'bin', 'ffmpeg.exe');
const FFMPEG = process.env.FFMPEG || (fs.existsSync(bundled) ? bundled : 'ffmpeg');
const ffmpeg = spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  // Chrome's JPEG frames are full-range BT.601; convert to standard limited-range BT.709 and tag it, so
  // players and PowerPoint show the same colours as the browser.
  '-vf', `scale=${W}:${H}:flags=lanczos:in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p`,
  '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709:fullrange=off',
  '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
const ffmpegDone = new Promise((resolve, reject) => ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)))));
let last = null, nextSlot = null, written = 0, received = 0;
const writeFrame = (buf) => {
  written++;
  return ffmpeg.stdin.write(buf) ? null : new Promise((r) => ffmpeg.stdin.once('drain', r));
};
async function onFrame(buf, ts) {
  received++;
  if (nextSlot === null) nextSlot = ts;
  while (last && nextSlot <= ts) {
    const p = writeFrame(last);
    if (p) await p;
    nextSlot += 1 / FPS;
  }
  last = buf;
}

const gpuArgs = process.platform === 'win32' ? ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] : ['--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: gpuArgs });
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await context.addInitScript(OVERLAY);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const cdp = await context.newCDPSession(page);
let queue = Promise.resolve();
cdp.on('Page.screencastFrame', ({ data: b64, metadata, sessionId }) => {
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  const buf = Buffer.from(b64, 'base64');
  queue = queue.then(() => onFrame(buf, metadata.timestamp));
});

// --- director helpers ---------------------------------------------------------------------------------------
const wait = (ms) => page.waitForTimeout(ms);
const demo = (fn, ...a) => page.evaluate(([f, args]) => window.__demo[f](...args), [fn, a]);
const caption = (c) => demo('caption', c[0], c[1]);
let mx = W / 2, my = H / 2;
async function moveTo(x, y, ms = 700) {
  const x0 = mx, y0 = my, steps = Math.max(1, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    mx = x0 + (x - x0) * e;
    my = y0 + (y - y0) * e;
    await page.mouse.move(mx, my);
    await wait(16);
  }
}
async function click(x, y) {
  await moveTo(x, y);
  await wait(150);
  await page.mouse.down();
  await wait(90);
  await page.mouse.up();
}
const box = async (sel) => (await page.locator(sel).first().boundingBox());
const scrollToSel = async (sel, ms, offset = 0) => {
  const y = await demo('top', sel, offset);
  if (y !== null) await demo('scrollTo', y, ms);
};
async function goto(url) {
  await demo('fadeOut');
  await page.goto(url, { waitUntil: 'load' });
  await wait(1500);
  await demo('fadeIn');
}
// Range slider: press on the thumb for `from`, drag to each value in `pathVals`.
async function dragSlider(sel, from, pathVals, msPer = 1400) {
  const b = await box(sel);
  const { min, max } = await page.$eval(sel, (s) => ({ min: Number(s.min), max: Number(s.max) }));
  const thumb = 16;
  const xOf = (v) => b.x + thumb / 2 + ((v - min) / (max - min)) * (b.width - thumb);
  const y = b.y + b.height / 2;
  await moveTo(xOf(from), y);
  await page.mouse.down();
  for (const v of pathVals) await moveTo(xOf(v), y, msPer);
  await page.mouse.up();
}
async function clickPreset(name) {
  const chips = page.locator('[data-preset]');
  const count = await chips.count();
  for (let i = 0; i < count; i++) {
    if ((await chips.nth(i).innerText()).trim() === name) {
      const cb = await chips.nth(i).boundingBox();
      if (cb) await click(cb.x + cb.width / 2, cb.y + cb.height / 2);
      return;
    }
  }
}

// --- the film -------------------------------------------------------------------------------------------------
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
const t0 = Date.now();
const mark = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} s  ${s}`);
try {
  // 1. Home: preloader, then the hero.
  mark('home');
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('preload'), null, { timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.classList.contains('gl-hero'), null, { timeout: 30000 }).catch(() => {});
  await wait(800);
  await caption(C.title);
  await wait(3000);
  const hb = await box('[data-hero-card]');
  await caption(C.hero);
  await moveTo(hb.x + hb.width * 0.15, hb.y + hb.height * 0.5, 800);
  await moveTo(hb.x + hb.width * 0.45, hb.y + hb.height * 0.42, 1000);
  await moveTo(hb.x + hb.width * 0.72, hb.y + hb.height * 0.6, 1000);
  // The cursor pushes molecules away from where it rests, so park it outside the pile, then dart in
  // and click before the push clears the spot, until a molecule is hit and its name tag shows.
  let named = false;
  for (const [fx, fy] of [[0.3, 0.48], [0.62, 0.45], [0.45, 0.6], [0.7, 0.4]]) {
    await moveTo(hb.x + hb.width * 0.05, hb.y + hb.height * 0.9, 350);
    await wait(500);
    await moveTo(hb.x + hb.width * fx, hb.y + hb.height * fy, 180);
    await page.mouse.down();
    await wait(60);
    await page.mouse.up();
    await wait(200);
    named = await page.$eval('[data-hero-tag]', (t) => t.classList.contains('is-on')).catch(() => false);
    if (named) break;
  }
  mark(`hero click ${named ? 'named a molecule' : 'missed'}`);
  await wait(1400);
  await moveTo(W - 120, H - 140, 700);
  await demo('hideCaption');

  // 2. Intro and the light ray.
  mark('intro');
  await scrollToSel('.intro', 2800, -40);
  await caption(C.target);
  await wait(2000);

  // 3. The ceiling grows into the full-screen chart; drag along the curve.
  mark('ceiling');
  const trackTop = await demo('top', '[data-ceiling-track]');
  await demo('scrollTo', trackTop + H * 1.02, 3800);
  await wait(600);
  await caption(C.ceiling);
  const pb = await box('[data-plot]');
  if (pb) {
    const grip = await box('[data-cursor-grip]');
    const startX = grip ? grip.x + grip.width / 2 : pb.x + pb.width * 0.3;
    const y = pb.y + pb.height * 0.6;
    await moveTo(startX, y, 700);
    await page.mouse.down();
    await moveTo(pb.x + pb.width * 0.08, y, 1200);
    await moveTo(pb.x + pb.width * 0.62, y, 1600);
    await moveTo(startX, y, 1200);
    await page.mouse.up();
  }
  await wait(1000);
  await demo('hideCaption');

  // 4. The experiments grid.
  mark('experiments');
  await scrollToSel('#experiments', 2200, -20);
  await caption(C.experiments);
  await wait(800);
  await demo('scrollTo', await demo('top', '.lap', -H * 0.9), 3000);
  await demo('hideCaption');

  // 5. The laptop.
  mark('laptop');
  await scrollToSel('.lap', 2000, -60);
  await caption(C.laptop);
  await wait(800);
  await demo('scrollTo', await demo('top', '.lap', H * 0.55), 2400);
  await wait(600);

  // 6. The dark chapter: tunnel and funnel, honest beat, quantum dots, real dyes, out of domain.
  mark('screen');
  await caption(C.funnel);
  await scrollToSel('[data-beat="funnel"]', 4200, -H * 0.15);
  await wait(1200);
  await scrollToSel('[data-beat="honest"]', 5000, -H * 0.1);
  await caption(C.honest);
  await wait(3400);
  await scrollToSel('[data-beat="dots"]', 5000, -H * 0.1);
  await caption(C.dots);
  await wait(3400);
  await scrollToSel('[data-beat="hopv"]', 5000, -H * 0.1);
  await caption(C.hopv);
  await wait(2600);
  await scrollToSel('[data-beat="ood"]', 5500, -H * 0.1);
  await caption(C.ood);
  await wait(3600);
  await demo('hideCaption');

  // 7. The predictor.
  mark('predictor');
  await scrollToSel('#predictor', 3000, 0);
  await wait(400);
  await scrollToSel('[data-predictor]', 1400, -H * 0.12);
  await caption(C.predictor);
  for (const name of ['terthiophene', 'azobenzene']) {
    await clickPreset(name);
    await wait(1600);
  }
  const field = await box('[data-field] [data-input]');
  if (field) {
    await click(field.x + field.width / 2, field.y + field.height / 2);
    await page.keyboard.press('Control+A');
    await wait(300);
    await caption(C.outOfRange);
    await page.keyboard.type('999', { delay: 200 });
    await wait(3000);
    const first = await box('[data-preset]');
    if (first) await click(first.x + first.width / 2, first.y + first.height / 2);
    await wait(800);
  }
  await demo('hideCaption');

  // 8. Where the light ray ends.
  mark('ray end');
  await scrollToSel('[data-ray-end]', 3000, -H * 0.45);
  await caption(C.rayEnd);
  await wait(3000);
  await demo('hideCaption');

  // 9. Part 2: the nine molecules and the 3D viewer.
  mark('part 2');
  await goto(`${BASE}parts/hf-vs-b3lyp/`);
  await caption(C.part2);
  // Frame the viewer and table below the floating header, with no body text tucked under it.
  await scrollToSel('.p2-grid', 2200, -170);
  await wait(400);
  for (const name of ['terthiophene', '4-nitroaniline']) {
    const rb = await box(`tr[data-mol="${name}"]`);
    if (rb) {
      await click(rb.x + rb.width * 0.3, rb.y + rb.height / 2);
      await wait(1400);
    }
  }
  const vb = await box('[data-viewer]');
  if (vb) {
    await moveTo(vb.x + vb.width * 0.35, vb.y + vb.height * 0.5, 800);
    await page.mouse.down();
    await moveTo(vb.x + vb.width * 0.7, vb.y + vb.height * 0.42, 1300);
    await page.mouse.up();
    await wait(800);
  }

  // 10. Part 3: the twist slider.
  mark('part 3');
  await goto(`${BASE}parts/twist/`);
  await caption(C.part3);
  await scrollToSel('[data-torsion]', 2200, -H * 0.08);
  await wait(300);
  const start3 = Number(await page.$eval('[data-torsion-slider]', (s) => s.value));
  await dragSlider('[data-torsion-slider]', start3, [9, 0, start3], 1600);
  await wait(1200);

  // 11. Part 6: the radius slider.
  mark('part 6');
  await goto(`${BASE}parts/quantum-dots/`);
  await caption(C.part6);
  // Frame the radius card mid-screen, so the parameter table (and its secondary-source tags) stays below
  // the fold rather than half under the caption.
  await scrollToSel('[data-radius]', 2200, -H * 0.28);
  await wait(300);
  const r = await page.$eval('[data-radius-slider]', (s) => ({ v: Number(s.value), max: Number(s.max) }));
  await dragSlider('[data-radius-slider]', r.v, [0, r.max, r.v], 1700);
  await wait(1200);

  // 12. The checks page.
  mark('checks');
  await goto(`${BASE}checks/`);
  await caption(C.checks);
  await wait(2000);
  await demo('scrollTo', H * 0.9, 3600);
  await wait(1200);
  await demo('hideCaption');

  // 13. End card.
  mark('end card');
  await demo('hideCursor');
  await demo('card', `<div class="k">Solar Dye</div><h1>Designing a Solar Dye on a Laptop</h1>
    <p>tanmay-jampala.github.io/solar-dye</p><p>github.com/Tanmay-Jampala/solar-dye</p>
    <p style="margin-top:28px;font-size:20px;color:rgba(255,255,255,0.6)">Tanmay Jampala · Computational Chemistry 25BSCH01 · Jain University (FET)</p>`);
  await wait(4500);
  mark('done');
} finally {
  await cdp.send('Page.stopScreencast').catch(() => {});
  await queue;
  // Hold the last frame for a moment so the end card does not cut off abruptly.
  if (last) for (let i = 0; i < FPS / 2; i++) await writeFrame(last);
  const quality = await page.evaluate(() => document.documentElement.dataset.glQuality || 'full').catch(() => '?');
  await browser.close();
  ffmpeg.stdin.end();
  await ffmpegDone;
  console.log(`record-demo: ${received} screencast frames -> ${written} video frames (${(written / FPS).toFixed(1)} s at ${FPS} fps), WebGL quality at the end: ${quality}`);
  console.log(`record-demo: wrote ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);
  if (errors.length) console.warn(`record-demo: page errors:\n  ${errors.slice(0, 5).join('\n  ')}`);
}
