// Hero card: the molecule pile (hero-scene.ts, which holds the scene and physics and touches no
// DOM). This module owns the canvas and forwards size, pointer, clicks and visibility.
import type { MoleculeData } from './molecules';
import { createHeroScene, type HeroOptions } from './hero-scene';

interface Deps {
  onTick: (fn: (time: number, delta: number) => void) => () => void;
  reducedMotion: boolean;
}

export async function initHero(card: HTMLElement, data: MoleculeData[], deps: Deps) {
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const opts: HeroOptions = {
    mobile,
    portrait: card.clientWidth < card.clientHeight,
    dpr: Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75),
    width: card.clientWidth,
    height: card.clientHeight,
  };

  const canvas = document.createElement('canvas');
  canvas.className = 'hero__gl';
  canvas.setAttribute('aria-hidden', 'true');
  card.appendChild(canvas);
  const scene = await createHeroScene(canvas, data, opts);
  canvas.classList.add('is-ready');

  let w = card.clientWidth, h = card.clientHeight;
  new ResizeObserver(() => {
    if (card.clientWidth === w && card.clientHeight === h) return;
    w = card.clientWidth;
    h = card.clientHeight;
    scene.resize(w, h);
  }).observe(card);
  if (deps.reducedMotion) return;

  const ndcOf = (e: PointerEvent): [[number, number], DOMRect] => {
    const r = card.getBoundingClientRect();
    return [[((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1], r];
  };
  card.addEventListener('pointermove', (e) => scene.pointer(ndcOf(e)[0]));
  card.addEventListener('pointerleave', () => scene.pointer(null));

  const tag = card.querySelector<HTMLElement>('[data-hero-tag]');
  let tagTimer = 0;
  card.addEventListener('pointerdown', (e) => {
    const [ndc, r] = ndcOf(e);
    const name = scene.click(ndc);
    if (!name || !tag) return;
    tag.textContent = name;
    tag.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px)`;
    tag.classList.add('is-on');
    clearTimeout(tagTimer);
    tagTimer = window.setTimeout(() => tag.classList.remove('is-on'), 1400);
  });

  // The render loop pauses when the card is off-screen or the tab is hidden.
  let visible = true;
  new IntersectionObserver(([entry]) => (visible = entry.isIntersecting), { rootMargin: '50px' }).observe(card);
  deps.onTick((_time, delta) => {
    if (visible && !document.hidden) scene.frame(delta);
  });
}
