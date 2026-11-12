// Interactives on the part pages. Each reads JSON embedded at build time from results.json and
// formats every number with the shared precision table.
//   [data-moltable]  Part 2: click a row to show that molecule's B3LYP geometry in the 3D viewer
//   [data-torsion]   Part 3: a slider over the stored torsion scan frames (10 degree steps)
//   [data-radius]    Part 6: a slider over the stored Brus curve radii, coloured by the stored RGB
import { format, formatText } from '../lib/format';

const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
function num(key: string, value: unknown, unit?: string) {
  const f = format(key, value);
  const u = f.u ?? unit;
  return `<span class="num" data-key="${esc(key)}">${esc(f.n)}${u ? `<span class="unit"> ${esc(u)}</span>` : ''}</span>`;
}

function webgl() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

type Viewer = ReturnType<typeof import('./webgl/viewer').createViewer>;
async function viewerIn(mount: HTMLElement, reducedMotion: boolean): Promise<Viewer | null> {
  if (!webgl()) return null;
  // A failed import or context still leaves the table, slider and readouts working.
  try {
    const [{ createViewer }, { roomEnvironment }] = await Promise.all([import('./webgl/viewer'), import('./webgl/env')]);
    const env = await roomEnvironment().catch(() => null);
    const viewer = createViewer(mount, reducedMotion, env);
    mount.classList.add('is-live');
    return viewer;
  } catch (err) {
    console.warn('3D viewer disabled:', err);
    return null;
  }
}

// --- Part 2 -----------------------------------------------------------------------------------------
async function initMolTable(reducedMotion: boolean) {
  const table = document.querySelector<HTMLElement>('[data-moltable]');
  const mount = document.querySelector<HTMLElement>('[data-viewer]');
  const label = document.querySelector<HTMLElement>('[data-viewer-name]');
  if (!table || !mount) return;
  const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tr[data-row]'));
  const viewer = await viewerIn(mount, reducedMotion);
  if (!viewer) return;
  const molecules: { name: string; atoms: [string, number, number, number][]; bonds: [number, number][] }[] = await fetch(`${base}data/molecules.json`).then((r) => r.json());
  const select = (row: HTMLTableRowElement) => {
    const m = molecules.find((x) => x.name === row.dataset.mol);
    if (!m) return;
    rows.forEach((r) => r.setAttribute('aria-selected', r === row ? 'true' : 'false'));
    viewer.show(m);
    if (label) label.textContent = m.name;
  };
  rows.forEach((row) => {
    row.tabIndex = 0;
    row.addEventListener('click', () => select(row));
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select(row);
      }
    });
  });
  const start = rows.find((r) => r.dataset.mol === 'terthiophene') ?? rows[0];
  select(start);
}

// --- Part 3 -----------------------------------------------------------------------------------------
interface Frame { angle_deg: number; energy_eV: number; gap_eV: number; coordinates_A: number[][] }
async function initTorsion(reducedMotion: boolean) {
  const root = document.querySelector<HTMLElement>('[data-torsion]');
  if (!root?.dataset.json) return;
  const { symbols, frames } = JSON.parse(root.dataset.json) as { symbols: string[]; frames: Frame[] };
  const slider = root.querySelector<HTMLInputElement>('[data-torsion-slider]')!;
  const outAngle = root.querySelector<HTMLElement>('[data-t-angle]')!;
  const outE = root.querySelector<HTMLElement>('[data-t-energy]')!;
  const outGap = root.querySelector<HTMLElement>('[data-t-gap]')!;
  const cursors = Array.from(root.querySelectorAll<HTMLElement>('[data-t-cursor]'));
  const mount = root.querySelector<HTMLElement>('[data-viewer]');
  const viewer = mount ? await viewerIn(mount, reducedMotion) : null;
  const atoms = (f: Frame) => f.coordinates_A.map((p, i) => [symbols[i], p[0], p[1], p[2]] as [string, number, number, number]);

  let first = true;
  const show = (i: number) => {
    const f = frames[i];
    outAngle.innerHTML = num(`torsion.scan[${i}].angle_deg`, f.angle_deg, '°');
    outE.innerHTML = num(`torsion.scan[${i}].energy_eV`, f.energy_eV);
    outGap.innerHTML = num(`torsion.scan[${i}].gap_eV`, f.gap_eV, 'eV');
    const x = `${(i / (frames.length - 1)) * 100}%`;
    cursors.forEach((c) => (c.style.left = x));
    // Spoken value: angle plus the two readouts, so a screen reader hears what the slider changed.
    slider.setAttribute('aria-valuetext', `${format(`torsion.scan[${i}].angle_deg`, f.angle_deg).n} degrees, energy ${formatText(`torsion.scan[${i}].energy_eV`, f.energy_eV)} above the lowest frame, gap ${formatText(`torsion.scan[${i}].gap_eV`, f.gap_eV, 'eV')}`);
    if (viewer) {
      viewer.show({ atoms: atoms(f) }, !first);
      if (first) viewer.setRotation(0.3, 0.6);
      first = false;
    }
  };
  slider.addEventListener('input', () => show(Number(slider.value)));
  show(Number(slider.value));
}

// --- Part 6 -----------------------------------------------------------------------------------------
interface Curve { radius_nm: number[]; gap_eV: number[]; wavelength_nm: number[]; rgb: (number[] | null)[] }
function initRadius() {
  const root = document.querySelector<HTMLElement>('[data-radius]');
  if (!root?.dataset.json) return;
  const curves = JSON.parse(root.dataset.json) as Record<string, Curve>;
  const slider = root.querySelector<HTMLInputElement>('[data-radius-slider]')!;
  const outR = root.querySelector<HTMLElement>('[data-r-radius]')!;
  const show = (i: number) => {
    const r = curves.CdSe.radius_nm[i];
    outR.innerHTML = num(`quantum_dots.brus_curve.CdSe.radius_nm[${i}]`, r, 'nm');
    slider.setAttribute('aria-valuetext', `${format(`quantum_dots.brus_curve.CdSe.radius_nm[${i}]`, r).n} nanometres`);
    for (const [mat, c] of Object.entries(curves)) {
      const card = root.querySelector<HTMLElement>(`[data-r-mat="${mat}"]`);
      if (!card) continue;
      const k = `quantum_dots.brus_curve.${mat}`;
      card.querySelector<HTMLElement>('[data-r-gap]')!.innerHTML = num(`${k}.gap_eV[${i}]`, c.gap_eV[i], 'eV');
      card.querySelector<HTMLElement>('[data-r-wl]')!.innerHTML = num(`${k}.wavelength_nm[${i}]`, c.wavelength_nm[i], 'nm');
      const rgb = c.rgb[i];
      const dot = card.querySelector<HTMLElement>('[data-r-dot]')!;
      const size = 28 + (i / (c.radius_nm.length - 1)) * 92;
      dot.style.width = dot.style.height = `${size}px`;
      dot.style.background = rgb ? `rgb(${rgb.map((v) => Math.round(v * 255)).join(',')})` : 'transparent';
      dot.classList.toggle('is-invisible', !rgb);
      card.querySelector<HTMLElement>('[data-r-vis]')!.textContent = rgb ? 'visible emission colour' : c.wavelength_nm[i] < 380 ? 'ultraviolet: no visible colour' : 'infrared: no visible colour';
    }
  };
  slider.addEventListener('input', () => show(Number(slider.value)));
  show(Number(slider.value));
}

export function initParts(reducedMotion: boolean) {
  initRadius();
  initMolTable(reducedMotion).catch((e) => console.warn('molecule viewer disabled:', e));
  initTorsion(reducedMotion).catch((e) => console.warn('torsion viewer disabled:', e));
}
