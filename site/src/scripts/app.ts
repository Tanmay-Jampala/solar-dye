// Global behaviour: one ticker (GSAP) drives smooth scrolling (Lenis), ScrollTrigger and, later,
// every WebGL scene, so DOM and canvas never drift apart.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { initCeilingCursor } from './ceiling';
import { initPredictor } from './predictor';
import { initParts } from './parts';
import { wavelengthNm } from '../lib/constants';

gsap.registerPlugin(ScrollTrigger);

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export let lenis: Lenis | null = null;

type TickFn = (time: number, delta: number) => void;
const tickers = new Set<TickFn>();
/** Register a per-frame callback on the shared ticker. Returns an unsubscribe function. */
export function onTick(fn: TickFn): () => void {
  tickers.add(fn);
  return () => tickers.delete(fn);
}

// ---------------------------------------------------------------------------------------------
// Loading registry: anything heavy (fonts, WebGL assets) registers a promise; the preloader
// shows real progress over these tasks.
// ---------------------------------------------------------------------------------------------
const tasks: Promise<unknown>[] = [];
let finished = 0;
export function track<T>(promise: Promise<T>): Promise<T> {
  tasks.push(promise);
  promise.finally(() => finished++);
  return promise;
}
const progress = () => (tasks.length ? finished / tasks.length : 1);

// ---------------------------------------------------------------------------------------------
function initScroll() {
  if (reducedMotion) {
    gsap.ticker.add((time, delta) => tickers.forEach((fn) => fn(time, delta)));
    return;
  }
  lenis = new Lenis({ duration: 1.2, easing: (t) => 1 - Math.pow(1 - t, 4), smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time, delta) => {
    lenis!.raf(time * 1000);
    tickers.forEach((fn) => fn(time, delta));
  });
  gsap.ticker.lagSmoothing(0);
}

export function scrollToTarget(target: string | HTMLElement) {
  const el = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  if (!el) return false;
  if (lenis) lenis.scrollTo(el, { duration: 1.6 });
  else el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
  return true;
}

// ---------------------------------------------------------------------------------------------
// Line reveals: split [data-reveal] blocks into masked lines that slide up when visible.
// Explicit .line children (offset headings) are used as they are.
// ---------------------------------------------------------------------------------------------
const originals = new WeakMap<HTMLElement, string>();

function splitLines(block: HTMLElement) {
  if (!originals.has(block)) originals.set(block, block.innerHTML);
  block.innerHTML = originals.get(block)!;
  const explicit = Array.from(block.children).filter((c) => c.classList.contains('line')) as HTMLElement[];
  if (explicit.length) {
    explicit.forEach((line, i) => {
      line.classList.add('reveal-line');
      line.style.setProperty('--line', String(i));
      line.innerHTML = `<span>${line.innerHTML}</span>`;
    });
    return;
  }
  // Tokenise: words of text nodes, and whole child elements (bound numbers stay intact).
  const tokens: HTMLElement[] = [];
  Array.from(block.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      (node.textContent || '').split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          tokens.push(Object.assign(document.createElement('span'), { className: 'ws', textContent: ' ' }));
        } else {
          tokens.push(Object.assign(document.createElement('span'), { className: 'w', textContent: part }));
        }
      });
    } else if (node.nodeType === Node.ELEMENT_NODE && (node as Element).children.length === 0 && / /.test(node.textContent || '')) {
      // A long bound string (e.g. hardware text): split into words, each keeping the binding.
      (node.textContent || '').split(/( +)/).forEach((part) => {
        if (!part) return;
        if (/^ +$/.test(part)) {
          tokens.push(Object.assign(document.createElement('span'), { className: 'ws', textContent: ' ' }));
          return;
        }
        const clone = node.cloneNode(false) as HTMLElement;
        clone.textContent = part;
        const wrap = document.createElement('span');
        wrap.className = 'w';
        wrap.appendChild(clone);
        tokens.push(wrap);
      });
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const wrap = document.createElement('span');
      wrap.className = 'w';
      wrap.appendChild(node.cloneNode(true));
      tokens.push(wrap);
    }
  });
  block.innerHTML = '';
  tokens.forEach((t) => {
    if (t.className === 'w') t.style.display = 'inline-block';
    block.appendChild(t);
  });
  const lines: HTMLElement[][] = [];
  let top = -Infinity;
  tokens.forEach((t) => {
    if (t.className === 'ws') {
      if (lines.length) lines[lines.length - 1].push(t);
      return;
    }
    if (Math.abs(t.offsetTop - top) > 2) {
      lines.push([]);
      top = t.offsetTop;
    }
    lines[lines.length - 1].push(t);
  });
  block.innerHTML = '';
  lines.forEach((words, i) => {
    const line = document.createElement('span');
    line.className = 'reveal-line';
    line.style.setProperty('--line', String(i));
    const inner = document.createElement('span');
    words.forEach((w) => {
      if (w.className === 'w') w.style.display = '';
      inner.appendChild(w);
    });
    line.appendChild(inner);
    block.appendChild(line);
  });
}

function initReveals(ready: Promise<void>) {
  const blocks = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        // Also reveal blocks already above the viewport (a reload restores the scroll position
        // mid-page), so nothing the reader has passed stays hidden.
        if (entry.isIntersecting || entry.boundingClientRect.bottom < 0) {
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '0px 0px -10% 0px' },
  );
  const split = () => blocks.forEach(splitLines);
  if (!reducedMotion) {
    split();
    let timer = 0;
    let width = window.innerWidth;
    window.addEventListener('resize', () => {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        split();
        blocks.forEach((b) => b.classList.add('is-in'));
      }, 200);
    });
  }
  // Observe only once the preloader has started to wipe, so the first reveals are seen.
  ready.then(() => {
    blocks.forEach((b) => observer.observe(b));
    document.querySelectorAll('[data-fade]').forEach((el) => observer.observe(el));
  });
}

// ---------------------------------------------------------------------------------------------
function initMenu() {
  const header = document.querySelector<HTMLElement>('[data-header]');
  const button = document.querySelector<HTMLButtonElement>('[data-menu-btn]');
  const menu = document.querySelector<HTMLElement>('[data-menu]');
  if (!header || !button || !menu) return;
  let closeTimer = 0;
  const set = (open: boolean) => {
    clearTimeout(closeTimer);
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => header.setAttribute('data-open', '')));
    } else {
      header.removeAttribute('data-open');
      closeTimer = window.setTimeout(() => (menu.hidden = true), 600);
    }
  };
  button.addEventListener('click', () => set(button.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      set(false);
      button.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (button.getAttribute('aria-expanded') === 'true' && !header.contains(e.target as Node)) set(false);
  });
}

function initCopy() {
  document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy || '');
        const label = btn.getAttribute('aria-label');
        btn.textContent = '✓';
        setTimeout(() => {
          btn.textContent = '→';
          if (label) btn.setAttribute('aria-label', label);
        }, 1400);
      } catch {
        /* clipboard unavailable: the command stays selectable */
      }
    });
  });
}

// Tables that scroll sideways (on phones) become focusable named regions, so keyboard users can
// scroll them with the arrow keys. Re-checked on resize; wide screens get no extra tab stop.
function initScrollRegions() {
  const wraps = Array.from(document.querySelectorAll<HTMLElement>('.dtable-wrap, .scr__table-wrap'));
  const update = () =>
    wraps.forEach((w) => {
      if (w.scrollWidth > w.clientWidth + 1) {
        w.tabIndex = 0;
        w.setAttribute('role', 'region');
        const cap = w.querySelector('caption')?.textContent?.trim();
        w.setAttribute('aria-label', cap ? `${cap} (scrolls sideways)` : 'Table (scrolls sideways)');
      } else {
        w.removeAttribute('tabindex');
        w.removeAttribute('role');
        w.removeAttribute('aria-label');
      }
    });
  update();
  // A wrapper can change size without a window resize (fonts, a section switching layout mode).
  let t = 0;
  const ro = new ResizeObserver(() => {
    clearTimeout(t);
    t = window.setTimeout(update, 150);
  });
  wraps.forEach((w) => {
    ro.observe(w);
    const table = w.querySelector('table');
    if (table) ro.observe(table);
  });
}

function initScrollLinks() {
  document.querySelectorAll<HTMLAnchorElement>('a[data-scrollto], a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const hash = a.getAttribute('href') || '';
      if (!hash.startsWith('#') || hash.length < 2) return;
      if (scrollToTarget(hash)) e.preventDefault();
    });
  });
}

// Ambient hum: muted by default, created only when the visitor turns it on.
function initSound() {
  const btn = document.querySelector<HTMLButtonElement>('[data-sound]');
  if (!btn) return;
  let ctx: AudioContext | null = null;
  let gain: GainNode | null = null;
  btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Ambient sound (on)' : 'Ambient sound (off)');
    if (on && !ctx) {
      ctx = new AudioContext();
      gain = ctx.createGain();
      gain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      [55, 82.4, 110.3].forEach((freq, i) => {
        const osc = ctx!.createOscillator();
        osc.type = i === 2 ? 'triangle' : 'sine';
        osc.frequency.value = freq;
        osc.detune.value = i * 4;
        osc.connect(filter);
        osc.start();
      });
      filter.connect(gain).connect(ctx.destination);
    }
    if (ctx && gain) {
      if (on) ctx.resume();
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setTargetAtTime(on ? 0.035 : 0, ctx.currentTime, 0.4);
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Preloader: odometer 000 -> 100, then roll into the target gap, hold, wipe.
// ---------------------------------------------------------------------------------------------
function column(digit: number): HTMLElement {
  const col = document.createElement('span');
  col.className = 'odo-col';
  const strip = document.createElement('span');
  strip.className = 'odo-strip';
  for (let d = 0; d <= 9; d++) strip.appendChild(Object.assign(document.createElement('span'), { textContent: String(d) }));
  strip.style.transform = `translateY(${-digit}em)`;
  col.appendChild(strip);
  return col;
}

function setDigits(cols: HTMLElement[], text: string) {
  text.split('').forEach((ch, i) => {
    const strip = cols[i]?.firstElementChild as HTMLElement | null;
    if (strip) strip.style.transform = `translateY(${-Number(ch)}em)`;
  });
}

/** Resolves when the wipe starts (or at once when there is no preloader). */
function initPreloader(): Promise<void> {
  const root = document.querySelector<HTMLElement>('[data-preloader]');
  if (!root || !document.documentElement.classList.contains('preload')) return Promise.resolve();
  const fill = root.querySelector<HTMLElement>('[data-pl-fill]')!;
  const count = root.querySelector<HTMLElement>('[data-pl-count]')!;
  const target = root.querySelector<HTMLElement>('[data-pl-target] .num')?.firstChild?.textContent?.trim() || '';
  const cols = [column(0), column(0), column(0)];
  cols.forEach((c) => count.appendChild(c));
  lenis?.stop();
  const start = performance.now();
  const MIN_MS = 1600;
  let shown = 0;

  return new Promise((resolve) => {
    const step = () => {
      const timeShare = Math.min(1, (performance.now() - start) / MIN_MS);
      const goal = Math.min(progress(), timeShare);
      shown += (goal - shown) * 0.12;
      if (goal === 1 && 1 - shown < 0.004) shown = 1;
      fill.style.transform = `scaleX(${shown})`;
      setDigits(cols, String(Math.round(shown * 100)).padStart(3, '0'));
      if (shown < 1) {
        requestAnimationFrame(step);
        return;
      }
      setTimeout(() => morph(), 350);
    };
    const morph = () => {
      root.classList.add('is-morph');
      count.innerHTML = '';
      const newCols: HTMLElement[] = [];
      for (const ch of target) {
        if (/\d/.test(ch)) {
          const col = column(0);
          newCols.push(col);
          count.appendChild(col);
        } else {
          count.appendChild(Object.assign(document.createElement('span'), { className: 'odo-static', textContent: ch }));
        }
      }
      count.appendChild(Object.assign(document.createElement('span'), { className: 'odo-unit', textContent: 'eV' }));
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setDigits(newCols, target.replace(/\D/g, ''))),
      );
      setTimeout(() => {
        root.classList.add('is-done');
        lenis?.start();
        setTimeout(resolve, 250);
        setTimeout(() => document.documentElement.classList.remove('preload'), 1150);
      }, 900 + 500);
    };
    requestAnimationFrame(step);
  });
}

// ---------------------------------------------------------------------------------------------
// Next-page panel: scrolling through it fills the line; reaching the end navigates.
// With reduced motion there is no auto-advance (the link remains).
// ---------------------------------------------------------------------------------------------
function initNextPanel() {
  const panel = document.querySelector<HTMLElement>('[data-next]');
  const fill = panel?.querySelector<HTMLElement>('[data-next-fill]');
  if (!panel || !fill || reducedMotion) return;
  let gone = false;
  onTick(() => {
    const rect = panel.getBoundingClientRect();
    const travel = rect.height - window.innerHeight;
    if (travel <= 0) return;
    const p = Math.min(1, Math.max(0, -rect.top / travel));
    fill.style.transform = `scaleX(${p})`;
    if (p >= 0.995 && !gone) {
      gone = true;
      document.body.style.transition = 'opacity 0.6s cubic-bezier(0.4, 0, 0.1, 1)';
      document.body.style.opacity = '0';
      setTimeout(() => (window.location.href = panel.dataset.href || '/'), 600);
    }
  });
  // Coming back with the browser's back button restores the page from cache: make it visible.
  window.addEventListener('pageshow', () => {
    document.body.style.opacity = '1';
    gone = false;
  });
}

// Header tone: white wordmark while a dark section ([data-tone="dark"]) is under the header row.
function initHeaderTone() {
  const header = document.querySelector<HTMLElement>('[data-header]');
  // Tones can change at runtime (the ceiling panel is light until it has opened), so read them live.
  const toned = Array.from(document.querySelectorAll<HTMLElement>('[data-tone]'));
  if (!header || !toned.length) return;
  let last = '';
  const update = () => {
    const y = header.querySelector('.hdr__mark')?.getBoundingClientRect();
    const mid = y ? y.top + y.height / 2 : 60;
    const onDark = toned.some((el) => {
      if (el.dataset.tone !== 'dark') return false;
      const r = el.getBoundingClientRect();
      return r.top <= mid && r.bottom >= mid;
    });
    const tone = onDark ? 'dark' : 'light';
    if (tone !== last) {
      header.dataset.tone = tone;
      last = tone;
    }
  };
  onTick(update);
  window.addEventListener('scroll', update, { passive: true });
  update();
}

// ---------------------------------------------------------------------------------------------
export function boot() {
  track(document.fonts.ready);
  track(new Promise((r) => (document.readyState === 'complete' ? r(null) : window.addEventListener('load', () => r(null)))));
  initScroll();
  const revealed = initPreloader();
  document.fonts.ready.then(() => initReveals(revealed));
  initMenu();
  initCopy();
  initScrollRegions();
  initScrollLinks();
  initSound();
  initNextPanel();
  initHeaderTone();
  // Independent enhancements: one failing must not stop the others.
  for (const init of [initCeilingCursor, initPredictor, () => initParts(reducedMotion), initOdometers, initWebGL]) {
    try {
      init();
    } catch (err) {
      console.error(err);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// WebGL: loaded after first paint (dynamic import), tracked by the preloader. Without WebGL every
// section keeps its static form; with reduced motion the hero renders one still frame and the
// page canvas (light ray, ceiling warp) is skipped.
// ---------------------------------------------------------------------------------------------
// Odometer counters ([data-odo] .num): digits roll into place when they scroll into view, like the
// preloader. The number stays in the DOM for screen readers; only the rolling copy is visual.
function initOdometers() {
  if (reducedMotion) return;
  const nums = Array.from(document.querySelectorAll<HTMLElement>('[data-odo] .num'));
  const roll = new Map<Element, () => void>();
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        roll.get(e.target)?.();
      }),
    { rootMargin: '0px 0px -15% 0px' },
  );
  nums.forEach((num) => {
    const first = num.firstChild;
    if (!first || first.nodeType !== Node.TEXT_NODE || !first.textContent) return;
    const text = first.textContent;
    const sr = Object.assign(document.createElement('span'), { className: 'sr-only', textContent: text });
    const vis = document.createElement('span');
    vis.className = 'odo';
    vis.setAttribute('aria-hidden', 'true');
    // Each strip holds 0-9 twice. It starts on the true digit in the first set and rolls a full
    // turn to the same digit in the second set, so at rest it always shows the stored number
    // (even if the roll never runs, e.g. in a full-page capture or when printed).
    const strips: [HTMLElement, number][] = [];
    for (const ch of text) {
      if (/\d/.test(ch)) {
        const d = Number(ch);
        const col = document.createElement('span');
        col.className = 'odo-col';
        const strip = document.createElement('span');
        strip.className = 'odo-strip';
        for (let k = 0; k < 20; k++) strip.appendChild(Object.assign(document.createElement('span'), { textContent: String(k % 10) }));
        strip.style.transition = 'none';
        strip.style.transform = `translateY(${-d}em)`;
        col.appendChild(strip);
        vis.appendChild(col);
        strips.push([strip, d]);
      } else {
        vis.appendChild(Object.assign(document.createElement('span'), { className: 'odo-static', textContent: ch }));
      }
    }
    first.replaceWith(sr, vis);
    roll.set(num, () =>
      strips.forEach(([strip, d]) => {
        strip.style.transition = '';
        strip.style.transform = `translateY(${-(d + 10)}em)`;
      }),
    );
    io.observe(num);
  });
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function initWebGL() {
  if (!webglAvailable()) return;
  const root = document.documentElement;
  const heroCard = document.querySelector<HTMLElement>('[data-hero-card]');
  const deps = { onTick, reducedMotion };

  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  if (heroCard) {
    track(
      Promise.all([import('./webgl/hero'), import('./webgl/molecules')])
        .then(async ([hero, mol]) => {
          const data = await mol.loadMolecules(`${base}data/molecules.json`);
          await hero.initHero(heroCard, data, deps);
          root.classList.add('gl-hero');
        })
        .catch((err) => console.warn('hero WebGL disabled:', err)),
    );
  }

  // The dark chapter: its layout switches to WebGL mode now (so the page does not jump later), and
  // the scene (130k points, 1.5 MB of data) loads once the section is within a few screens.
  const scr = document.querySelector<HTMLElement>('#screen');
  const scrMount = scr?.querySelector<HTMLElement>('[data-scr-gl]');
  if (scr && scrMount && !reducedMotion) {
    root.classList.add('gl-scr');
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        import('./webgl/screen')
          .then((m) => m.initScreen(scr, scrMount, base, deps))
          .catch((err) => {
            root.classList.remove('gl-scr');
            console.warn('screen WebGL disabled:', err);
          });
      },
      { rootMargin: '250% 0px' },
    );
    io.observe(scr);
  }

  // Predictor stickers: loaded when the predictor is within a couple of screens.
  const stickerMount = document.querySelector<HTMLElement>('[data-stickers]');
  if (stickerMount) {
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        Promise.all([import('./webgl/stickers'), fetch(`${base}data/stickers.json`).then((r) => r.json())])
          .then(([m, data]) => m.initStickers(stickerMount, data, deps))
          .catch((err) => console.warn('stickers disabled:', err));
      },
      { rootMargin: '200% 0px' },
    );
    io.observe(stickerMount);
  }

  const rayEnd = document.querySelector<HTMLElement>('[data-ray-end]');
  const gap = Number(rayEnd?.dataset.gap);
  if (rayEnd && Number.isFinite(gap) && gap > 0 && !reducedMotion) {
    // Everything this canvas draws starts below the fold, so it is built once the browser is idle
    // (after the hero), keeping the first seconds free for input. The layout mode is set now, so
    // nothing moves when the canvas arrives.
    const wide = window.matchMedia('(min-width: 761px)');
    const setMode = () => root.classList.toggle('gl-ceil', wide.matches);
    setMode();
    const onChange = () => {
      setMode();
      ScrollTrigger.refresh();
    };
    wide.addEventListener('change', onChange);
    const idle = () =>
      new Promise<void>((resolve) => ('requestIdleCallback' in window ? requestIdleCallback(() => resolve(), { timeout: 2500 }) : setTimeout(resolve, 300)));
    Promise.all(tasks)
      .then(idle)
      .then(() => import('./webgl/page'))
      .then((page) => page.initPage({ ...deps, endWavelengthNm: wavelengthNm(gap) }))
      .catch((err) => {
        wide.removeEventListener('change', onChange);
        root.classList.remove('gl-ceil');
        ScrollTrigger.refresh();
        console.warn('page WebGL disabled:', err);
      });
  }
}
