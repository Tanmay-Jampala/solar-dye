// "THE SCREEN": the dark chapter as a scroll-scrubbed flythrough on its own canvas (sticky inside
// #screen, under the DOM beats). Everything drawn here is data from results.json and
// web_qm9_points.json:
//   portal     an iridescent ring the photon falls through (behind the justified statement)
//   tunnel     one point per QM9 molecule, coloured by its B3LYP gap; points fall away as the scroll
//              passes each funnel stage, leaving the verified survivors
//   honest     the survivors fly to the target ring and stop short, spaced by their predicted gaps,
//              with a red bar for the distance from the best prediction to the target
//   dots       quantum dots on a gap-vs-radius plane, coloured by the Brus curve's RGB per radius;
//              the target line, CdSe staying above it, PbS crossing it, Brus vs experimental radius
//   shatter    209 shards (the HOPV15 dyes) leave a pane, land on the SQ curve at their SQ limit,
//              then drop to their measured efficiency
// Camera position follows the DOM beats (keyframes measured from the page), so text and 3D agree.
import * as THREE from 'three';
import { frameGovernor } from './quality';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

interface Deps {
  onTick: (fn: (time: number, delta: number) => void) => () => void;
}
interface Points { gap_eV: number[]; stage: number[] }

const TUNNEL_START = -20, TUNNEL_END = -420, TUNNEL_R = 14;
const RING_Z = -480, DOTS_Z = -600, SHARDS_Z = -770;

// Neon ramp for the QM9 gap (art direction): low gap red ... high gap violet.
const RAMP = ['#ff4c41', '#ff9a3c', '#ffe14d', '#c1ff00', '#3ce0ff', '#4d63ff', '#8832f7'].map((c) => new THREE.Color(c));
function ramp(t: number, out: THREE.Color) {
  const x = Math.min(0.9999, Math.max(0, t)) * (RAMP.length - 1);
  const i = Math.floor(x);
  return out.copy(RAMP[i]).lerp(RAMP[i + 1], x - i);
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Pseudo-random in [0,1) from an integer (stable layout across reloads). */
function hash(i: number) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export async function initScreen(section: HTMLElement, mount: HTMLElement, base: string, deps: Deps) {
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const [points, results] = await Promise.all([
    fetch(`${base}data/web_qm9_points.json`).then((r) => r.json() as Promise<Points>),
    fetch(`${base}data/results.json`).then((r) => r.json()),
  ]);

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  mount.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  let dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.5);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#000000');
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1200);

  // --- portal ------------------------------------------------------------------------------------
  const iridescent = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec3 vN; varying vec3 vV;
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        vec3 col = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + f * 1.3 + uTime * 0.04));
        gl_FragColor = vec4(col * (0.12 + 0.75 * f), 1.0);
      }`,
  });
  const portal = new THREE.Mesh(new THREE.TorusGeometry(12, 0.32, 32, 160), iridescent);
  scene.add(portal);
  const portal2 = new THREE.Mesh(new THREE.TorusGeometry(15, 0.12, 12, 160), iridescent);
  portal2.position.z = -6;
  scene.add(portal2);

  // --- tunnel of QM9 points -------------------------------------------------------------------------
  const n = points.gap_eV.length;
  const keep: number[] = [];
  for (let i = 0; i < n; i++) if (!mobile || points.stage[i] > 0 || i % 4 === 0) keep.push(i);
  const sortedGaps = [...points.gap_eV].sort((a, b) => a - b);
  const gLo = sortedGaps[Math.floor(n * 0.02)], gHi = sortedGaps[Math.floor(n * 0.98)];
  const m = keep.length;
  const pos = new Float32Array(m * 3), col = new Float32Array(m * 3), stage = new Float32Array(m), seed = new Float32Array(m);
  const target = new Float32Array(m * 3);
  const c = new THREE.Color();
  const verified: number[] = [];
  keep.forEach((i, k) => {
    const a = hash(i) * Math.PI * 2;
    const r = TUNNEL_R * (0.92 + hash(i + 7) * 0.16);
    pos.set([Math.cos(a) * r, Math.sin(a) * r, lerp(TUNNEL_START, TUNNEL_END, hash(i + 3))], k * 3);
    ramp((points.gap_eV[i] - gLo) / (gHi - gLo), c);
    col.set([c.r, c.g, c.b], k * 3);
    stage[k] = points.stage[i];
    seed[k] = hash(i + 11);
    if (points.stage[i] === 4) verified.push(k);
  });

  // Honest beat: survivors' resting places, spaced by their predicted gaps from the target.
  const sTarget: number = results.model.screening.target_gap_eV;
  const tops: { predicted_gap_eV: number }[] = results.model.top_candidates.slice(0, verified.length);
  const closest: number = results.model.screening.closest_predicted_gap_eV;
  const UNIT = mobile ? 3.2 : 7; // world units per eV on the ruler
  const ringX = mobile ? -2.5 : -6;
  const preds = tops.map((t) => t.predicted_gap_eV).sort((a, b) => a - b);
  verified.forEach((k, j) => {
    const g = preds[Math.min(j, preds.length - 1)];
    target.set([ringX + (g - sTarget) * UNIT, (j - (verified.length - 1) / 2) * 1.6, RING_Z], k * 3);
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aStage', new THREE.BufferAttribute(stage, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aTarget', new THREE.BufferAttribute(target, 3));
  const pointUniforms = {
    uStage: { value: 0 },
    uFly: { value: 0 },
    uTime: { value: 0 },
    uSize: { value: (mobile ? 1.6 : 1.25) * dpr },
  };
  const pointsMat = new THREE.ShaderMaterial({
    uniforms: pointUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aStage; attribute float aSeed; attribute vec3 aTarget; attribute vec3 color;
      uniform float uStage; uniform float uFly; uniform float uTime; uniform float uSize;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vec3 p = position;
        float fade = clamp(uStage - aStage, 0.0, 1.0);
        // failing points fall away and drift outward
        p.y -= fade * fade * (26.0 + aSeed * 30.0);
        p.xy *= 1.0 + fade * 0.35;
        float survivor = step(3.5, aStage);
        float fly = survivor * uFly;
        p = mix(p, aTarget, fly * fly * (3.0 - 2.0 * fly));
        p.y += sin(uTime * 1.3 + aSeed * 20.0) * 0.15;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float grow = 1.0 + aStage * aStage * 0.22 * smoothstep(0.5, 4.0, uStage);
        gl_PointSize = min(uSize * grow * (220.0 / -mv.z), 28.0 * uSize);
        float depth = smoothstep(150.0, 20.0, -mv.z);
        // thin the crowd: early on most points are faint, the brightness goes to the survivors
        float base = mix(0.32, 1.0, smoothstep(0.5, 3.0, uStage));
        vAlpha = (1.0 - fade) * max(depth * base, survivor * 0.9);
        vColor = mix(color, vec3(1.0), survivor * smoothstep(3.0, 4.0, uStage) * 0.6);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.1, r) * vAlpha;
        gl_FragColor = vec4(vColor * a, a);
      }`,
  });
  const cloud = new THREE.Points(geo, pointsMat);
  cloud.frustumCulled = false;
  scene.add(cloud);

  // Neon wireframe rings along the tunnel.
  const ringGeo = new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: 97 }, (_, i) => new THREE.Vector3(Math.cos((i / 96) * Math.PI * 2), Math.sin((i / 96) * Math.PI * 2), 0)),
  );
  const neon = ['#3ce0ff', '#ff4c41', '#ff9a3c'];
  for (let z = TUNNEL_START, i = 0; z > TUNNEL_END; z -= 22, i++) {
    const line = new THREE.Line(ringGeo, new THREE.LineBasicMaterial({ color: neon[i % 3], transparent: true, opacity: 0.45 }));
    line.scale.setScalar(TUNNEL_R + 1.2 + (i % 2) * 0.8);
    line.position.z = z;
    line.rotation.z = i * 0.3;
    scene.add(line);
  }
  // Long lines along the tunnel walls.
  const rails: THREE.Vector3[] = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    rails.push(new THREE.Vector3(Math.cos(a) * (TUNNEL_R + 1.6), Math.sin(a) * (TUNNEL_R + 1.6), TUNNEL_START));
    rails.push(new THREE.Vector3(Math.cos(a) * (TUNNEL_R + 1.6), Math.sin(a) * (TUNNEL_R + 1.6), TUNNEL_END));
  }
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(rails), new THREE.LineBasicMaterial({ color: '#3ce0ff', transparent: true, opacity: 0.25 })));

  // --- honest beat: target ring and the gap bar -----------------------------------------------------
  const white = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const red = new THREE.MeshBasicMaterial({ color: '#ff4c41', toneMapped: false, transparent: true });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.12, 16, 96), white);
  ring.position.set(ringX, 0, RING_Z);
  scene.add(ring);
  const gapBar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.22, 0.22), red);
  gapBar.position.set(ringX, -3.6, RING_Z);
  scene.add(gapBar);
  const gapLen = (closest - sTarget) * UNIT;

  // --- quantum dots -------------------------------------------------------------------------------
  const brus = results.quantum_dots.brus_curve as Record<string, { radius_nm: number[]; gap_eV: number[]; rgb: (number[] | null)[] }>;
  const qdTarget: number = results.quantum_dots.target_gap_eV;
  const pbsRadii = results.quantum_dots.radius_at_optimum_nm.PbS;
  const rMin = brus.PbS.radius_nm[0], rMax = brus.PbS.radius_nm[brus.PbS.radius_nm.length - 1];
  const W = mobile ? 9 : 20, GAP_TOP = 3.6, H = mobile ? 14 : 12;
  const qx = (r: number) => lerp(-W, W, (r - rMin) / (rMax - rMin));
  const qy = (g: number) => ((Math.min(g, GAP_TOP) - qdTarget) / (GAP_TOP - qdTarget)) * H; // target at y = 0
  const dotsGroup = new THREE.Group();
  dotsGroup.position.z = DOTS_Z;
  scene.add(dotsGroup);
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  (['CdSe', 'PbS'] as const).forEach((mat, mi) => {
    const curve = brus[mat];
    const idx = curve.radius_nm.map((_, i) => i).filter((i) => i % 10 === 0);
    const mesh = new THREE.InstancedMesh(sphere, new THREE.MeshBasicMaterial({ toneMapped: false }), idx.length);
    const mtx = new THREE.Matrix4();
    idx.forEach((i, k) => {
      const r = curve.radius_nm[i];
      const s = 0.08 + r * (mobile ? 0.035 : 0.05);
      mtx.makeScale(s, s, s).setPosition(qx(r), qy(curve.gap_eV[i]), mi * -4);
      mesh.setMatrixAt(k, mtx);
      const rgb = curve.rgb[i];
      // No RGB means the emission is outside the visible range: draw it as a dim ghost.
      mesh.setColorAt(k, rgb ? new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace) : new THREE.Color('#2a2a3a'));
    });
    dotsGroup.add(mesh);
  });
  const targetLine = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 4, 0.08, 0.08), white);
  dotsGroup.add(targetLine);
  const markerGeo = new THREE.BoxGeometry(0.08, H + 2, 0.08);
  const brusMarker = new THREE.Mesh(markerGeo, white);
  brusMarker.position.set(qx(pbsRadii.brus_nm), H / 2 - 2, -4);
  const expMarker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: '#c1ff00', toneMapped: false }));
  expMarker.position.set(qx(pbsRadii.experimental_sizing_curve_nm), H / 2 - 2, -4);
  const factorBar = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(qx(pbsRadii.brus_nm) - qx(pbsRadii.experimental_sizing_curve_nm)), 0.25, 0.25), red);
  factorBar.position.set((qx(pbsRadii.brus_nm) + qx(pbsRadii.experimental_sizing_curve_nm)) / 2, -2.2, -4);
  dotsGroup.add(brusMarker, expMarker, factorBar);

  // --- shatter: HOPV15 dyes on the SQ curve -----------------------------------------------------------
  const hopv = results.quantum_dots.sq_placement.hopv_experimental.points as { gap_eV: number; sq_efficiency: number; measured_pce: number }[];
  const sqc = results.quantum_dots.sq_placement.curve as { gap_eV: number[]; efficiency: number[] };
  const G0 = 1.0, G1 = 3.0, E1 = 0.36;
  const SW = mobile ? 9 : 22, SH = mobile ? 13 : 11;
  const sx = (g: number) => lerp(-SW, SW, (g - G0) / (G1 - G0));
  const sy = (e: number) => lerp(-SH, SH, e / E1);
  const shardsGroup = new THREE.Group();
  const curvePts: THREE.Vector3[] = [];
  sqc.gap_eV.forEach((g, i) => g >= G0 && g <= G1 && curvePts.push(new THREE.Vector3(sx(g), sy(sqc.efficiency[i]), SHARDS_Z)));
  const sqLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curvePts), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 }));
  const axis = new THREE.Mesh(new THREE.BoxGeometry(SW * 2, 0.05, 0.05), white);
  axis.position.set(0, sy(0), SHARDS_Z);
  shardsGroup.add(sqLine, axis);

  const shardGeo = new THREE.TetrahedronGeometry(mobile ? 0.45 : 0.55);
  shardGeo.scale(1, 1, 0.25);
  const shardMat = new THREE.MeshPhysicalMaterial({ color: '#cfe0ff', roughness: 0.08, metalness: 0.2, iridescence: 1, emissive: '#1a2ffb', emissiveIntensity: 0.6 });
  const shards = new THREE.InstancedMesh(shardGeo, shardMat, hopv.length);
  shards.frustumCulled = false;
  shardsGroup.add(shards);
  scene.add(shardsGroup);
  scene.add(new THREE.AmbientLight('#ffffff', 0.6));
  const dl = new THREE.DirectionalLight('#ffffff', 2.2);
  dl.position.set(5, 10, 8);
  scene.add(dl);
  const cols = Math.ceil(Math.sqrt(hopv.length));
  const shardData = hopv.map((p, i) => {
    const pane = new THREE.Vector3(((i % cols) / (cols - 1) - 0.5) * SW * 0.9, (Math.floor(i / cols) / (cols - 1) - 0.5) * SH * 1.2, SHARDS_Z + 8);
    const dir = new THREE.Vector3(hash(i) - 0.5, hash(i + 1) - 0.5, hash(i + 2) * 0.6).normalize();
    return {
      pane,
      burst: pane.clone().addScaledVector(dir, 14 + hash(i + 5) * 12),
      onSq: new THREE.Vector3(sx(p.gap_eV), sy(p.sq_efficiency), SHARDS_Z + 0.2),
      onPce: new THREE.Vector3(sx(p.gap_eV), sy(p.measured_pce), SHARDS_Z + 0.2),
      spin: new THREE.Vector3(hash(i + 8) * 6, hash(i + 9) * 6, hash(i + 10) * 6),
    };
  });
  const shardColor = new THREE.Color();
  const shardRed = new THREE.Color('#ff4c41'), shardWhite = new THREE.Color('#ffffff');
  const tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpP = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const shardM = new THREE.Matrix4();
  function updateShards(t: number) {
    const a = smooth(clamp01(t / 0.25));
    const b = smooth(clamp01((t - 0.28) / 0.3));
    const d = smooth(clamp01((t - 0.62) / 0.25));
    shardData.forEach((s, i) => {
      tmpP.lerpVectors(s.pane, s.burst, a).lerp(s.onSq, b).lerp(s.onPce, d);
      const tumble = a * (1 - b);
      tmpE.set(s.spin.x * tumble, s.spin.y * tumble, s.spin.z * tumble + (1 - tumble) * 0.0);
      tmpQ.setFromEuler(tmpE);
      shardM.compose(tmpP, tmpQ, one);
      shards.setMatrixAt(i, shardM);
      shards.setColorAt(i, shardColor.copy(shardWhite).lerp(shardRed, d));
      shardMat.emissiveIntensity = 0.6 * (1 - d) + 0.1;
    });
    shards.instanceMatrix.needsUpdate = true;
    shards.instanceColor!.needsUpdate = true;
  }

  // --- photon ------------------------------------------------------------------------------------
  const glowC = document.createElement('canvas');
  glowC.width = glowC.height = 128;
  const gctx = glowC.getContext('2d')!;
  const grad = gctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(200,230,255,0.7)');
  grad.addColorStop(1, 'rgba(26,47,251,0)');
  gctx.fillStyle = grad;
  gctx.fillRect(0, 0, 128, 128);
  const glowTex = new THREE.CanvasTexture(glowC);
  const photon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  photon.scale.setScalar(5);
  scene.add(photon);

  // --- post ---------------------------------------------------------------------------------------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), mobile ? 0.5 : 0.6, 0.35, 0.3);
  composer.addPass(bloom);
  const chroma = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uAmount: { value: 0.004 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse; uniform float uAmount; varying vec2 vUv;
      void main() {
        vec2 d = vUv - 0.5;
        vec2 off = d * uAmount * (0.5 + dot(d, d) * 6.0);
        vec4 c = texture2D(tDiffuse, vUv);
        c.r = texture2D(tDiffuse, vUv + off).r;
        c.b = texture2D(tDiffuse, vUv - off).b;
        c.rgb *= 1.0 - 0.55 * dot(d, d) * 2.0; // vignette keeps the overlaid text readable
        gl_FragColor = c;
      }`,
  });
  composer.addPass(chroma);
  composer.addPass(new OutputPass());

  function resize() {
    const w = mount.clientWidth, h = mount.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    camera.aspect = w / h;
    camera.fov = w < h ? 72 : 60;
    camera.updateProjectionMatrix();
  }
  resize();
  new ResizeObserver(resize).observe(mount);

  // --- scroll keyframes from the DOM ------------------------------------------------------------------
  type Key = { s: number; x: number; y: number; z: number };
  const q = (sel: string) => section.querySelector<HTMLElement>(sel);
  const pageY = (el: HTMLElement | null, f: number) => {
    if (!el) return NaN;
    const r = el.getBoundingClientRect();
    return r.top + window.scrollY + r.height * f;
  };
  let keys: Key[] = [];
  let stageKeys: { s: number; v: number }[] = [];
  let flyFrom = 0, flyTo = 1, hopvFrom = 0, hopvTo = 1;
  function measure() {
    const vh = window.innerHeight;
    const at = (el: HTMLElement | null, f: number) => pageY(el, f) - vh / 2; // scroll where that point is mid-screen
    const statement = q('.scr__statement');
    const funnel = q('[data-beat="funnel"]');
    // Each beat has a spacer ([data-gl-gap]) where the camera parks while the 3D carries the beat.
    const honest = q('[data-beat="honest"] [data-gl-gap]');
    const dots = q('[data-beat="dots"] [data-gl-gap]');
    const hopvEl = q('[data-beat="hopv"] [data-gl-gap]');
    const ood = q('[data-beat="ood"]');
    const sectionTop = section.getBoundingClientRect().top + window.scrollY;
    keys = [
      { s: sectionTop - vh, x: 0, y: 4, z: 70 },
      { s: at(statement, 0.5), x: 0, y: 0, z: 26 },
      { s: at(funnel, 0), x: 0, y: 0, z: TUNNEL_START + 4 },
      { s: at(funnel, 1), x: 0, y: 0, z: TUNNEL_END + 30 },
      { s: at(honest, 0.3), x: mobile ? 1 : 3, y: 0, z: RING_Z + (mobile ? 30 : 22) },
      { s: at(honest, 0.8), x: mobile ? 1 : 3, y: 0, z: RING_Z + (mobile ? 28 : 20) },
      { s: at(dots, 0.2), x: 0, y: 2, z: DOTS_Z + (mobile ? 46 : 36) },
      { s: at(dots, 0.8), x: 0, y: 2, z: DOTS_Z + (mobile ? 44 : 34) },
      { s: at(hopvEl, 0.1), x: 0, y: 0, z: SHARDS_Z + (mobile ? 42 : 32) },
      { s: at(hopvEl, 0.9), x: 0, y: 0, z: SHARDS_Z + (mobile ? 40 : 30) },
      { s: at(ood, 0.5), x: 0, y: 0, z: SHARDS_Z - 120 },
    ].filter((k) => Number.isFinite(k.s));
    const rows = Array.from(section.querySelectorAll<HTMLElement>('.scr__funnel li'));
    stageKeys = rows.map((li, i) => ({ s: at(li, 0.5), v: i }));
    flyFrom = at(funnel, 1);
    flyTo = at(honest, 0.25);
    hopvFrom = at(hopvEl, 0) - vh * 0.2;
    hopvTo = at(hopvEl, 0.85);
  }
  measure();
  window.addEventListener('load', measure);
  document.fonts?.ready.then(measure);
  new ResizeObserver(measure).observe(section);

  const interp = (s: number) => {
    if (s <= keys[0].s) return keys[0];
    for (let i = 1; i < keys.length; i++) {
      if (s <= keys[i].s) {
        const a = keys[i - 1], b = keys[i];
        const t = (s - a.s) / Math.max(1, b.s - a.s);
        // linear inside the tunnel (constant speed), eased between the other beats
        const e = i === 3 ? t : smooth(t);
        return { s, x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), z: lerp(a.z, b.z, e) };
      }
    }
    return keys[keys.length - 1];
  };
  const stageAt = (s: number) => {
    if (!stageKeys.length) return 0;
    if (s <= stageKeys[0].s) return 0;
    for (let i = 1; i < stageKeys.length; i++) {
      if (s <= stageKeys[i].s) return lerp(stageKeys[i - 1].v, stageKeys[i].v, (s - stageKeys[i - 1].s) / Math.max(1, stageKeys[i].s - stageKeys[i - 1].s));
    }
    return stageKeys[stageKeys.length - 1].v;
  };

  let visible = false;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting), { rootMargin: '100px' }).observe(section);
  const look = new THREE.Vector3();
  // Slow GPU: drop the bloom and render at pixel ratio 1.
  const govern = frameGovernor('screen', () => {
    bloom.enabled = false;
    dpr = 1;
    renderer.setPixelRatio(1);
    resize();
  });
  deps.onTick((time, delta) => {
    if (!visible || document.hidden) return;
    govern(delta);
    const s = window.scrollY;
    const k = interp(s);
    camera.position.set(k.x, k.y, k.z);
    look.set(k.x * 0.6, k.y * 0.5, k.z - 40);
    camera.lookAt(look);

    const st = stageAt(s);
    pointUniforms.uStage.value = st;
    pointUniforms.uFly.value = clamp01((s - flyFrom) / Math.max(1, flyTo - flyFrom));
    pointUniforms.uTime.value = time;
    iridescent.uniforms.uTime.value = time;
    portal.rotation.z = time * 0.05;
    portal2.rotation.z = -time * 0.03;

    // gap bar grows once the survivors have landed
    const fly = pointUniforms.uFly.value;
    const g = smooth(clamp01((fly - 0.75) / 0.25));
    gapBar.scale.x = Math.max(0.001, gapLen * g);
    gapBar.position.x = ringX + (gapLen * g) / 2;
    red.opacity = 1;

    updateShards(clamp01((s - hopvFrom) / Math.max(1, hopvTo - hopvFrom)));

    // Each later scene grows into place as the camera nears it, so it does not clutter the beat before.
    const appear = (z: number, range: number) => Math.max(0.001, smooth(clamp01((z - k.z) / range)));
    ring.visible = gapBar.visible = k.z > RING_Z - 6;
    ring.scale.setScalar(appear(RING_Z + 120, 60));
    dotsGroup.scale.setScalar(appear(RING_Z + 4, 50));
    dotsGroup.visible = k.z > DOTS_Z - 6;
    shardsGroup.visible = k.z < DOTS_Z + 10;

    // photon: falls through the portal, then leads the camera down the tunnel and fades at the ring
    const ahead = 22;
    const fall = clamp01((k.z - 26) / 44);
    photon.position.set(Math.sin(time * 0.8) * 0.6, lerp(0, 12, fall) + Math.sin(time * 1.1) * 0.3, k.z - ahead);
    (photon.material as THREE.SpriteMaterial).opacity = 1 - clamp01((st - 3.2) / 0.8);

    // chromatic aberration strongest in the tunnel and the shatter
    const inTunnel = k.z < TUNNEL_START && k.z > TUNNEL_END ? 1 : 0;
    chroma.uniforms.uAmount.value = 0.004 + inTunnel * 0.012;
    composer.render();
  });
}
