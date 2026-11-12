// Floating die-cut stickers around the predictor headline: one per web preset (the nine Part 2
// molecules and the three screening hits). Each sticker's drawing is the molecule's heavy-atom
// skeleton, projected from its B3LYP geometry onto its best-fit plane (principal axes), so the
// drawings come from the real structures (public/data/stickers.json, written by sync-data).
import * as THREE from 'three';
import { roomEnvironment } from './env';
import type { MoleculeData } from './molecules';

interface Deps {
  onTick: (fn: (time: number, delta: number) => void) => () => void;
  reducedMotion: boolean;
}

const STYLES = [
  { bg: '#1a2ffb', ink: '#ffffff' },
  { bg: '#0b0c12', ink: '#ffffff' },
  { bg: '#c1ff00', ink: '#0b0c12' },
  { bg: '#f2f3f8', ink: '#0b0c12' },
];

/** Two principal axes of a point set (power iteration on the covariance matrix). */
function principalAxes(pts: number[][]): [number[], number[]] {
  const n = pts.length;
  const c = [0, 0, 0];
  pts.forEach((p) => p.forEach((v, i) => (c[i] += v / n)));
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  pts.forEach((p) => {
    const d = p.map((v, i) => v - c[i]);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j];
  });
  const mul = (v: number[]) => C.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
  const norm = (v: number[]) => {
    const l = Math.hypot(...v) || 1;
    return v.map((x) => x / l);
  };
  let e1 = norm([1, 0.3, 0.1]);
  for (let k = 0; k < 60; k++) e1 = norm(mul(e1));
  let e2 = norm([0.2, 1, 0.3]);
  for (let k = 0; k < 60; k++) {
    e2 = mul(e2);
    const dot = e2[0] * e1[0] + e2[1] * e1[1] + e2[2] * e1[2];
    e2 = norm(e2.map((v, i) => v - dot * e1[i]));
  }
  return [e1, e2];
}

function drawSticker(m: MoleculeData, style: { bg: string; ink: string }): HTMLCanvasElement {
  const S = 512, border = 20, radius = 70;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const rr = (x: number, y: number, w: number, h: number, r: number) => {
    g.beginPath();
    g.roundRect(x, y, w, h, r);
  };
  rr(0, 0, S, S, radius);
  g.fillStyle = '#ffffff';
  g.fill();
  rr(border, border, S - 2 * border, S - 2 * border, radius - border);
  g.fillStyle = style.bg;
  g.fill();

  const heavy = m.atoms.map((a, i) => ({ el: a[0], p: [a[1], a[2], a[3]], i })).filter((a) => a.el !== 'H');
  const idx = new Map(heavy.map((a, k) => [a.i, k]));
  const [e1, e2] = principalAxes(heavy.map((a) => a.p));
  const xy = heavy.map((a) => [a.p[0] * e1[0] + a.p[1] * e1[1] + a.p[2] * e1[2], a.p[0] * e2[0] + a.p[1] * e2[1] + a.p[2] * e2[2]]);
  const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const box = S - 2 * border - 120;
  const scale = Math.min(box / Math.max(1e-6, maxX - minX), (box - 40) / Math.max(1e-6, maxY - minY), 70);
  const cx = S / 2 - ((minX + maxX) / 2) * scale, cy = S / 2 - 20 - ((minY + maxY) / 2) * scale;
  const P = (k: number) => [cx + xy[k][0] * scale, cy + xy[k][1] * scale];

  g.strokeStyle = style.ink;
  g.lineWidth = 11;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const [a, b] of m.bonds) {
    const ka = idx.get(a), kb = idx.get(b);
    if (ka === undefined || kb === undefined) continue;
    const [x1, y1] = P(ka), [x2, y2] = P(kb);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }
  g.font = '600 40px "IBM Plex Mono", monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  heavy.forEach((a, k) => {
    if (a.el === 'C') return;
    const [x, y] = P(k);
    g.fillStyle = style.bg;
    g.beginPath();
    g.arc(x, y, 25, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = a.el === 'S' && style.bg !== '#c1ff00' ? '#c1ff00' : style.ink;
    g.fillText(a.el, x, y + 2);
  });
  g.font = '500 30px "IBM Plex Mono", monospace';
  g.fillStyle = style.ink;
  g.globalAlpha = 0.85;
  g.fillText(m.name, S / 2, S - border - 44);
  g.globalAlpha = 1;
  return cv;
}

export async function initStickers(mount: HTMLElement, data: MoleculeData[], deps: Deps) {
  await document.fonts?.ready;
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const canvas = document.createElement('canvas');
  mount.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.75));
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  scene.environment = await roomEnvironment();
  scene.environmentIntensity = 0.6;
  const key = new THREE.DirectionalLight('#ffffff', 1.4);
  key.position.set(-3, 5, 6);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.z = 18;

  // A slightly curled card, like a sticker that is peeling.
  const geo = new THREE.PlaneGeometry(1, 1, 12, 12);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, -0.06 * x * x + 0.04 * Math.max(0, x + y) ** 2);
  }
  geo.computeVertexNormals();

  let seed = 3;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const group = new THREE.Group();
  scene.add(group);
  const count = mobile ? Math.min(8, data.length) : data.length;
  const items = data.slice(0, count).map((m, i) => {
    const tex = new THREE.CanvasTexture(drawSticker(m, STYLES[i % STYLES.length]));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, alphaTest: 0.5, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.12, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    // Spread on a ring around the headline, leaving its centre clearer.
    const a = (i / count) * Math.PI * 2 + rand() * 0.4;
    const base = new THREE.Vector3(Math.cos(a) * (mobile ? 3.3 : 7.5), Math.sin(a) * (mobile ? 5.2 : 3.6), -1 - rand() * 4);
    const s = (mobile ? 1.5 : 2.1) * (0.8 + rand() * 0.35);
    mesh.scale.setScalar(s);
    group.add(mesh);
    return { mesh, base, phase: rand() * 10, spin: new THREE.Vector3((rand() - 0.5) * 0.6, (rand() - 0.5) * 0.8, (rand() - 0.5) * 0.9) };
  });

  function resize() {
    const w = mount.clientWidth, h = mount.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  new ResizeObserver(resize).observe(mount);

  const mouse = new THREE.Vector2();
  window.addEventListener('pointermove', (e) => mouse.set(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5), { passive: true });

  const place = (t: number) => {
    for (const it of items) {
      it.mesh.position.set(it.base.x + Math.sin(t * 0.35 + it.phase) * 0.35, it.base.y + Math.cos(t * 0.3 + it.phase) * 0.45, it.base.z);
      it.mesh.rotation.set(it.spin.x + Math.sin(t * 0.4 + it.phase) * 0.25, it.spin.y + Math.cos(t * 0.33 + it.phase) * 0.3, it.spin.z + Math.sin(t * 0.21 + it.phase) * 0.15);
    }
    group.rotation.y += (mouse.x * 0.25 - group.rotation.y) * 0.05;
    group.rotation.x += (mouse.y * 0.18 - group.rotation.x) * 0.05;
  };
  place(0);
  renderer.render(scene, camera);
  canvas.classList.add('is-ready');
  if (deps.reducedMotion) return;

  let visible = false;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(mount);
  deps.onTick((time) => {
    if (!visible || document.hidden) return;
    place(time);
    renderer.render(scene, camera);
  });
}
