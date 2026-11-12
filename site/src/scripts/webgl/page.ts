// The page-level canvas, fixed behind the content (the content sits above it at z-index 1).
// It draws two things in page space (1 world unit = 1 CSS pixel at z = 0, y = -pageY):
//   1. The light ray: one swept tube through the page whose drawn length follows the scroll and
//      whose colour runs through the spectrum (violet in the intro, cyan-green at the laptop, red
//      then near-infrared at the end, where it stops at the wavelength of the target gap).
//   2. The ceiling plane: the small blue card that grows into the full-screen panel and bends like
//      rubber on the way, then hands over to the DOM panel when fully open.
import * as THREE from 'three';
import { roomEnvironment } from './env';
import { setupLaptop } from './laptop';
import { yieldToMain } from './yield';

interface Deps {
  onTick: (fn: (time: number, delta: number) => void) => () => void;
  reducedMotion: boolean;
  /** Wavelength (nm) where the ray ends: derived from sq.optimum_gap_eV as hc / E. */
  endWavelengthNm: number;
}

// Control points: x as a fraction of the viewport width, y as a fraction of the anchor's height,
// z in px (depth), l = wavelength in nm at that point (the last point uses the derived end).
type P = { a: string; x: number; y: number; z: number; l: number };
const RAY: P[] = [
  // intro: enters right, crosses behind the heading, loops, leaves right
  { a: '.intro', x: 1.12, y: -0.12, z: 0, l: 400 },
  { a: '.intro', x: 0.82, y: 0.02, z: 160, l: 405 },
  { a: '.intro', x: 0.52, y: 0.12, z: -120, l: 415 },
  { a: '.intro', x: 0.24, y: 0.08, z: 120, l: 425 },
  { a: '.intro', x: 0.08, y: 0.26, z: 0, l: 432 },
  { a: '.intro', x: 0.2, y: 0.46, z: 220, l: 440 },
  { a: '.intro', x: 0.4, y: 0.36, z: 60, l: 448 },
  { a: '.intro', x: 0.3, y: 0.2, z: -80, l: 455 },
  { a: '.intro', x: 0.48, y: 0.58, z: 100, l: 462 },
  { a: '.intro', x: 0.72, y: 0.98, z: 0, l: 470 },
  { a: '.intro', x: 1.18, y: 1.2, z: 0, l: 475 },
  // off-screen down the right side, past the ceiling and the experiments
  { a: '#ceiling', x: 1.35, y: 0.5, z: 0, l: 480 },
  { a: '#experiments', x: 1.35, y: 0.5, z: 0, l: 485 },
  // laptop: enters right, snakes behind the heading, exits left into the dark chapter
  { a: '.lap', x: 1.14, y: -0.06, z: 0, l: 490 },
  { a: '.lap', x: 0.86, y: 0.02, z: 140, l: 495 },
  { a: '.lap', x: 0.6, y: 0.14, z: -100, l: 505 },
  { a: '.lap', x: 0.36, y: 0.06, z: 120, l: 515 },
  { a: '.lap', x: 0.16, y: 0.2, z: 0, l: 525 },
  { a: '.lap', x: 0.3, y: 0.34, z: 180, l: 535 },
  { a: '.lap', x: 0.12, y: 0.62, z: 0, l: 548 },
  { a: '.lap', x: -0.2, y: 0.95, z: 0, l: 560 },
  // hidden behind the dark chapter and the predictor
  { a: '#screen', x: -0.35, y: 0.5, z: 0, l: 580 },
  { a: '#predictor', x: -0.35, y: 0.5, z: 0, l: 600 },
  // the end: red into near-infrared, stopping at the label
  { a: '[data-ray-end]', x: -0.18, y: -3, z: 0, l: 620 },
  { a: '[data-ray-end]', x: 0.1, y: -1.6, z: 120, l: 655 },
  { a: '[data-ray-end]', x: 0.27, y: 0.6, z: -60, l: 700 },
  { a: '[data-ray-end]', x: 0.45, y: 0.4, z: 40, l: 790 },
  { a: '[data-ray-end]', x: 0.665, y: 0.5, z: 0, l: -1 },
];

/** sRGB colour for a wavelength. Visible range after Bruton's approximation; beyond 700 nm it
 *  fades to a deep near-infrared red (art direction: the eye cannot see it). */
function spectral(nm: number): THREE.Color {
  let r = 0, g = 0, b = 0;
  if (nm < 440) [r, g, b] = [-(nm - 440) / 60, 0, 1];
  else if (nm < 490) [r, g, b] = [0, (nm - 440) / 50, 1];
  else if (nm < 510) [r, g, b] = [0, 1, -(nm - 510) / 20];
  else if (nm < 580) [r, g, b] = [(nm - 510) / 70, 1, 0];
  else if (nm < 645) [r, g, b] = [1, -(nm - 645) / 65, 0];
  else [r, g, b] = [1, 0, 0];
  let k = 1;
  if (nm < 420) k = 0.45 + (0.55 * (nm - 380)) / 40;
  if (nm > 700) k = Math.max(0.12, 1 - (nm - 700) / 160);
  const c = new THREE.Color().setRGB(Math.pow(r * k, 0.8), Math.pow(g * k, 0.8), Math.pow(b * k, 0.8), THREE.SRGBColorSpace);
  return c;
}

export async function initPage(deps: Deps) {
  const mobile = () => window.innerWidth <= 760;
  const canvas = document.createElement('canvas');
  canvas.className = 'gl-page';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile() ? 1.25 : 1.5));
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  scene.environment = await roomEnvironment();
  const key = new THREE.DirectionalLight('#ffffff', 1.6);
  key.position.set(-0.4, 1, 0.8);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(30, 1, 10, 20000);

  // --- the ray ----------------------------------------------------------------------------------
  const rayMaterial = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 });
  const uDraw = { value: 0 };
  const uGlow = { value: 0.55 };
  rayMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uDraw = uDraw;
    shader.uniforms.uGlow = uGlow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vAlong;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlong = uv.x;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uDraw;\nuniform float uGlow;\nvarying float vAlong;')
      .replace('#include <clipping_planes_fragment>', 'if (vAlong > uDraw) discard;\n#include <clipping_planes_fragment>')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uGlow;');
  };
  rayMaterial.side = THREE.DoubleSide;
  let ray: THREE.Mesh | null = null;
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshPhysicalMaterial({ roughness: 0.18, clearcoat: 1 }));
  scene.add(head);
  let curve: THREE.CatmullRomCurve3 | null = null;
  let monoY: Float32Array = new Float32Array(0); // running max of page y along the ray
  let samples = 0;
  let headColors: THREE.Color[] = [];
  let drawn = 0;

  let builtFor = '';
  function buildRay() {
    const vw = document.documentElement.clientWidth;
    const pts: THREE.Vector3[] = [];
    const ls: number[] = [];
    // On phones the text spans the whole width, so the ray snakes down the right-hand gutter instead
    // (on-screen points map into 94–99 % of the width, off-screen ones to the right), and its tip
    // stops just above the closing label rather than running through it.
    const phone = mobile();
    const gutter = (x: number) => (x < 0 ? 1.2 : x > 1 ? x : 0.94 + x * 0.05);
    for (const p of RAY) {
      const el = document.querySelector<HTMLElement>(p.a);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const top = r.top + window.scrollY;
      const x = phone ? gutter(p.x) : p.x;
      const y = phone && p.a === '[data-ray-end]' ? Math.min(p.y, -1) : p.y;
      pts.push(new THREE.Vector3(x * vw, -(top + y * r.height), p.z * (phone ? 0.5 : 1)));
      ls.push(p.l < 0 ? deps.endWavelengthNm : p.l);
    }
    if (pts.length < 4) return;
    // Skip the rebuild (the costliest step here) when no anchor has moved.
    const sig = pts.map((v) => `${Math.round(v.x)},${Math.round(v.y)},${Math.round(v.z)}`).join(';');
    if (sig === builtFor) return;
    builtFor = sig;
    curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const length = curve.getLength();
    const radius = phone ? 6 : Math.max(8, Math.min(26, vw * 0.016));
    const segments = Math.min(4000, Math.ceil(length / 6));
    const geometry = new THREE.TubeGeometry(curve, segments, radius, mobile() ? 10 : 16, false);
    // Wavelength per ring: arc length u -> curve parameter t -> control-point index -> lerp.
    const wl = (u: number) => {
      const t = curve!.getUtoTmapping(u, 0) * (ls.length - 1);
      const i = Math.min(ls.length - 2, Math.floor(t));
      return ls[i] + (ls[i + 1] - ls[i]) * (t - i);
    };
    const uv = geometry.attributes.uv;
    const colors = new Float32Array(uv.count * 3);
    const cache = new Map<number, THREE.Color>();
    for (let k = 0; k < uv.count; k++) {
      const u = uv.getX(k);
      let c = cache.get(u);
      if (!c) cache.set(u, (c = spectral(wl(u))));
      colors.set([c.r, c.g, c.b], k * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (ray) {
      scene.remove(ray);
      ray.geometry.dispose();
    }
    ray = new THREE.Mesh(geometry, rayMaterial);
    ray.frustumCulled = false;
    scene.add(ray);
    head.scale.setScalar(radius);

    samples = 1000;
    monoY = new Float32Array(samples + 1);
    headColors = [];
    let max = -Infinity;
    for (let k = 0; k <= samples; k++) {
      const y = -curve.getPointAt(k / samples).y;
      max = Math.max(max, y);
      monoY[k] = max;
      headColors.push(spectral(wl(k / samples)));
    }
  }

  /** Arc-length fraction drawn so far: up to the furthest point whose page y the scroll has passed. */
  function targetDraw() {
    const lead = window.scrollY + window.innerHeight * 0.82;
    let lo = 0, hi = samples;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (monoY[mid] <= lead) lo = mid;
      else hi = mid - 1;
    }
    return lo / samples;
  }

  // --- the ceiling plane ------------------------------------------------------------------------
  await yieldToMain();
  const ceil = setupCeiling(scene);
  await yieldToMain();
  const laptop = setupLaptop(scene);
  await yieldToMain();

  // --- frame ------------------------------------------------------------------------------------
  let vw = 0, vh = 0;
  function resize() {
    // clientWidth excludes the scrollbar, so 1 unit = 1 CSS px of the layout.
    vw = document.documentElement.clientWidth;
    vh = window.innerHeight;
    renderer.setSize(vw, vh, true);
    camera.aspect = vw / vh;
    camera.position.z = vh / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.updateProjectionMatrix();
    buildRay();
  }
  resize();
  let timer = 0;
  let lastW = vw;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      // Mobile browsers resize the viewport height while scrolling: rebuild only on width changes.
      if (window.innerWidth !== lastW || Math.abs(window.innerHeight - vh) > 120) {
        lastW = window.innerWidth;
        resize();
      }
    }, 200);
  });
  // Layout shifts (fonts, images) move the anchors: rebuild once everything has loaded.
  window.addEventListener('load', () => buildRay());
  document.fonts?.ready.then(() => buildRay());

  if (deps.reducedMotion) {
    canvas.remove();
    return { ceiling: false };
  }

  let lastKey = '';
  deps.onTick((time) => {
    const sy = window.scrollY;
    camera.position.x = vw / 2;
    camera.position.y = -(sy + vh / 2);

    if (curve) {
      const target = targetDraw();
      drawn += (target - drawn) * 0.09;
      if (Math.abs(target - drawn) < 1e-4) drawn = target;
      uDraw.value = drawn;
      // A sphere caps the drawn end (the tube itself is open-ended), including the very end.
      const visible = drawn > 0.0005;
      head.visible = visible;
      if (visible) {
        const u = Math.min(1, drawn);
        const c = headColors[Math.round(u * samples)];
        head.position.copy(curve.getPointAt(u));
        (head.material as THREE.MeshPhysicalMaterial).color.copy(c);
        (head.material as THREE.MeshPhysicalMaterial).emissive.copy(c).multiplyScalar(uGlow.value);
      }
    }
    const ceilKey = ceil.update(sy, vw, vh);
    const lapKey = laptop.update(sy, vw, vh, time);
    const key = `${sy}|${drawn.toFixed(5)}|${ceilKey}|${lapKey}|${vw}x${vh}`;
    if (key === lastKey) return;
    lastKey = key;
    renderer.render(scene, camera);
  });
  return { ceiling: ceil.enabled };
}

// ------------------------------------------------------------------------------------------------
// Ceiling: interpolate a rounded, bending plane from the intro card to the full-screen panel.
function setupCeiling(scene: THREE.Scene) {
  const reel = document.querySelector<HTMLElement>('[data-reel-card]');
  const track = document.querySelector<HTMLElement>('[data-ceiling-track]');
  const panel = document.querySelector<HTMLElement>('[data-ceiling-panel]');
  const root = document.documentElement;
  const wide = window.matchMedia('(min-width: 761px)');
  const enabled = !!(reel && track && panel);
  if (!enabled) return { enabled, update: () => '' };

  const uniforms = {
    uSize: { value: new THREE.Vector2(1, 1) },
    uRadius: { value: 20 },
    uBend: { value: 0 },
    uColor: { value: new THREE.Color('#1a2ffb').convertLinearToSRGB() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthTest: false,
    vertexShader: /* glsl */ `
      uniform float uBend;
      varying vec2 vUv;
      varying float vLift;
      void main() {
        vUv = uv;
        vec3 p = position;
        vec2 c = p.xy * 2.0;               // -1..1 across the plane
        float corner = c.x * c.x * c.y * c.y;
        float edge = 0.55 * c.y * c.y + 0.25 * c.x * c.x;
        p.z += uBend * (edge + 0.9 * corner);      // corners curl toward the viewer
        p.y += uBend * 0.0012 * sin(c.x * 3.14159) * (1.0 - c.y * c.y); // sag like a sheet
        p.x += uBend * 0.0008 * c.x * c.y * c.y;
        vLift = (edge + corner) * uBend;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec2 uSize;
      uniform float uRadius;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vLift;
      void main() {
        vec2 p = (vUv - 0.5) * uSize;
        vec2 q = abs(p) - uSize * 0.5 + uRadius;
        float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
        float a = clamp(0.5 - d, 0.0, 1.0);
        if (a <= 0.0) discard;
        vec3 col = uColor + vec3(0.06, 0.07, 0.12) * clamp(vLift / 260.0, 0.0, 1.0);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 48, 48), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  scene.add(mesh);

  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  let state = '';

  const set = (s: string) => {
    if (s === state) return;
    state = s;
    root.dataset.ceil = s; // 'before' | 'grow' | 'open'
    panel!.dataset.tone = s === 'open' ? 'dark' : 'light';
  };

  return {
    enabled,
    update(sy: number, vw: number, vh: number) {
      if (!wide.matches || !root.classList.contains('gl-ceil')) {
        mesh.visible = false;
        return 'off';
      }
      const tr = track!.getBoundingClientRect();
      const raw = Math.min(1, Math.max(0, (vh - tr.top) / vh));
      const p = ease(raw);
      root.style.setProperty('--ceil-p', raw.toFixed(4));
      if (raw <= 0) {
        set('before');
        mesh.visible = false;
        return 'b';
      }
      if (raw >= 1) {
        set('open');
        mesh.visible = false;
        return 'o';
      }
      set('grow');
      const a = reel!.getBoundingClientRect();
      const b = panel!.getBoundingClientRect();
      const x = lerp(a.left, b.left, p), y = lerp(a.top, b.top, p);
      const w = lerp(a.width, b.width, p), h = lerp(a.height, b.height, p);
      mesh.visible = true;
      mesh.position.set(x + w / 2, -(sy + y + h / 2), 0);
      mesh.scale.set(w, h, 1);
      uniforms.uSize.value.set(w, h);
      // Bend scales with the plane's own size, so the small card only wobbles and the big sheet curls.
      uniforms.uBend.value = Math.sin(Math.PI * Math.min(1, raw * 1.05)) * Math.min(w, h) * 0.11;
      return `${raw.toFixed(4)}`;
    },
  };
}
