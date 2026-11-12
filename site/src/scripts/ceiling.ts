// Draggable gap cursor on the Shockley-Queisser chart. It snaps to the stored points of sq.curve
// and shows their values exactly as stored (formatted by the shared precision table): no
// interpolation, so every number it shows is a results.json value.
import { format } from '../lib/format';

interface Geom { W: number; H: number; L: number; R: number; T: number; B: number; xMin: number; xMax: number; yMax: number }

export function initCeilingCursor() {
  const chart = document.querySelector<HTMLElement>('[data-ceiling-chart]');
  if (!chart?.dataset.curve || !chart.dataset.geom) return;
  const curve = JSON.parse(chart.dataset.curve) as { gap_eV: number[]; efficiency: number[] };
  const g = JSON.parse(chart.dataset.geom) as Geom;
  const plot = chart.querySelector<HTMLElement>('[data-plot]')!;
  const cursor = chart.querySelector<HTMLElement>('[data-cursor]')!;
  const grip = chart.querySelector<HTMLElement>('[data-cursor-grip]')!;
  const read = chart.querySelector<HTMLElement>('[data-cursor-read]')!;
  const gapNum = read.querySelector<HTMLElement>('[data-read-gap] .num')!;
  const effNum = read.querySelector<HTMLElement>('[data-read-eff] .num')!;
  const last = curve.gap_eV.length - 1;

  const xPct = (x: number) => ((g.L + ((x - g.xMin) / (g.xMax - g.xMin)) * (g.W - g.L - g.R)) / g.W) * 100;
  const yPct = (y: number) => ((g.H - g.B - (y / g.yMax) * (g.H - g.T - g.B)) / g.H) * 100;
  cursor.style.setProperty('--plot-top', `${(g.T / g.H) * 100}%`);
  cursor.style.setProperty('--plot-bottom', `${(g.B / g.H) * 100}%`);

  const setNum = (el: HTMLElement, key: string, value: number) => {
    const f = format(key, value);
    el.dataset.key = key;
    const text = el.firstChild;
    if (text && text.nodeType === Node.TEXT_NODE) text.textContent = f.n;
    else el.prepend(document.createTextNode(f.n));
    return f.u ? `${f.n} ${f.u}` : f.n;
  };

  let index = Number(chart.dataset.start) || 0;
  function show(i: number) {
    index = Math.max(0, Math.min(last, i));
    const gap = curve.gap_eV[index];
    const eff = curve.efficiency[index];
    cursor.style.left = `${xPct(gap)}%`;
    cursor.style.setProperty('--y', `${yPct(eff)}%`);
    const gapText = setNum(gapNum, `sq.curve.gap_eV[${index}]`, gap);
    const effText = setNum(effNum, `sq.curve.efficiency[${index}]`, eff);
    // The unit spans already follow the number inside each .num (eV, %).
    grip.setAttribute('aria-valuemin', String(curve.gap_eV[0]));
    grip.setAttribute('aria-valuemax', String(curve.gap_eV[last]));
    grip.setAttribute('aria-valuenow', String(gap));
    grip.setAttribute('aria-valuetext', `${gapText} eV, efficiency limit ${effText}`);
  }

  const fromClientX = (clientX: number) => {
    const r = plot.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * g.W;
    const gap = g.xMin + ((x - g.L) / (g.W - g.L - g.R)) * (g.xMax - g.xMin);
    const step = (curve.gap_eV[last] - curve.gap_eV[0]) / last;
    return Math.round((gap - curve.gap_eV[0]) / step);
  };

  let dragging = false;
  plot.addEventListener('pointerdown', (e) => {
    dragging = true;
    plot.setPointerCapture(e.pointerId);
    show(fromClientX(e.clientX));
  });
  plot.addEventListener('pointermove', (e) => {
    if (dragging) show(fromClientX(e.clientX));
  });
  const stop = () => (dragging = false);
  plot.addEventListener('pointerup', stop);
  plot.addEventListener('pointercancel', stop);

  grip.addEventListener('keydown', (e) => {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 };
    if (e.key in moves) show(index + moves[e.key]);
    else if (e.key === 'Home') show(0);
    else if (e.key === 'End') show(last);
    else return;
    e.preventDefault();
  });

  cursor.hidden = false;
  read.hidden = false;
  plot.classList.add('is-live');
  show(index);
}
