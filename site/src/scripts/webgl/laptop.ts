// The laptop (page canvas, in page space): a procedural rounded laptop floating at a tilt over the
// CSS stand-in's box. Its screen is a canvas texture that steps through the screening funnel
// (model.screening.funnel, formatted by the shared precision table). As the section scrolls away,
// a glowing photon leaves the screen and falls toward the dark chapter.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { format } from '../../lib/format';

interface FunnelRow { stage: string; count: number }

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.4, 'rgba(120,200,255,0.35)');
  grad.addColorStop(1, 'rgba(26,47,251,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function setupLaptop(scene: THREE.Scene) {
  const box = document.querySelector<HTMLElement>('[data-laptop]');
  const section = document.querySelector<HTMLElement>('.lap');
  if (!box?.dataset.funnel || !section) return { enabled: false, update: () => '' };
  const funnel = JSON.parse(box.dataset.funnel) as FunnelRow[];
  document.documentElement.classList.add('gl-lap');

  // --- screen texture -------------------------------------------------------------------------
  const sc = document.createElement('canvas');
  sc.width = 1024;
  sc.height = 640;
  const ctx = sc.getContext('2d')!;
  const screenTex = new THREE.CanvasTexture(sc);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.anisotropy = 4;
  const rows = funnel.map((r, i) => ({ count: format(`model.screening.funnel[${i}].count`, r.count).n, stage: r.stage }));
  let shown = -1;
  function drawScreen(active: number) {
    if (active === shown) return;
    shown = active;
    const g = ctx.createRadialGradient(200, 0, 0, 200, 0, 1100);
    g.addColorStop(0, '#13206a');
    g.addColorStop(0.6, '#04050a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 640);
    ctx.font = '500 30px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#c1ff00';
    ctx.fillText('screen.run()', 70, 92);
    rows.forEach((r, i) => {
      const y = 170 + i * 92;
      const on = i <= active;
      ctx.globalAlpha = on ? (i === active ? 1 : 0.55) : 0.12;
      ctx.font = `500 ${i === active ? 52 : 44}px "IBM Plex Mono", monospace`;
      ctx.fillStyle = i === active ? '#ffffff' : '#e9ecff';
      ctx.textAlign = 'right';
      ctx.fillText(r.count, 330, y + 14);
      ctx.textAlign = 'left';
      ctx.font = '400 24px "IBM Plex Mono", monospace';
      ctx.fillStyle = 'rgba(233,236,255,0.8)';
      ctx.fillText(r.stage, 370, y + 8);
      if (i === active) {
        ctx.fillStyle = '#c1ff00';
        ctx.fillRect(70, y - 30, 8, 48);
      }
    });
    ctx.globalAlpha = 1;
    screenTex.needsUpdate = true;
  }
  drawScreen(0);
  document.fonts?.ready.then(() => {
    shown = -1;
    drawScreen(0);
  });

  // --- model (units: 1 = laptop width) ---------------------------------------------------------
  const group = new THREE.Group();
  const body = new THREE.MeshPhysicalMaterial({ color: '#eceef6', roughness: 0.32, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.12 });
  const dark = new THREE.MeshPhysicalMaterial({ color: '#0b0c12', roughness: 0.25, clearcoat: 1 });
  const base = new THREE.Mesh(new RoundedBoxGeometry(1, 0.035, 0.68, 4, 0.02), body);
  base.position.set(0, 0, 0.34);
  group.add(base);
  const deck = new THREE.Mesh(new RoundedBoxGeometry(0.86, 0.006, 0.34, 2, 0.003), new THREE.MeshStandardMaterial({ color: '#15161e', roughness: 0.7 }));
  deck.position.set(0, 0.019, 0.26);
  group.add(deck);
  const pad = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.004, 0.17, 2, 0.002), new THREE.MeshPhysicalMaterial({ color: '#d9dce8', roughness: 0.5 }));
  pad.position.set(0, 0.019, 0.55);
  group.add(pad);
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.02, 0.0);
  group.add(hinge);
  const lid = new THREE.Mesh(new RoundedBoxGeometry(1, 0.66, 0.026, 4, 0.02), body);
  lid.position.set(0, 0.33, 0);
  hinge.add(lid);
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(0.97, 0.63, 0.004, 2, 0.015), dark);
  bezel.position.set(0, 0.33, 0.014);
  hinge.add(bezel);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5625), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(0, 0.335, 0.0165);
  hinge.add(screen);
  hinge.rotation.x = -0.32; // lid opened past vertical
  scene.add(group);

  // --- photon -----------------------------------------------------------------------------------
  const glow = glowTexture();
  const TRAIL = 10;
  const sprites = Array.from({ length: TRAIL }, (_, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 1 - i / TRAIL }));
    s.renderOrder = 3;
    scene.add(s);
    return s;
  });
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
  scene.add(core);

  const screenWorld = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const ease = (t: number) => t * t * (3 - 2 * t);

  return {
    enabled: true,
    update(sy: number, vw: number, vh: number, time: number) {
      const r = box.getBoundingClientRect();
      const visible = r.bottom > -vh * 1.5 && r.top < vh * 2.5;
      group.visible = visible;
      if (!visible) {
        sprites.forEach((s) => (s.visible = false));
        core.visible = false;
        return 'off';
      }
      // Size and place: width of the CSS box, centred on it.
      const w = r.width * (vw < 761 ? 0.78 : 0.66);
      const cx = r.left + r.width * (vw < 761 ? 0.5 : 0.56);
      const cy = r.top + r.height * 0.58 + sy;
      // Scroll progress through the section (0 entering, 1 leaving) drives the tilt.
      const p = clamp((vh - r.top) / (vh + r.height));
      group.scale.setScalar(w);
      group.position.set(cx, -cy, 0);
      group.rotation.set(0.42 - p * 0.18, -0.55 + p * 0.25 + Math.sin(time * 0.6) * 0.03, 0.04);
      group.position.y += Math.sin(time * 0.9) * 6;

      // Funnel steps on the screen while the laptop is in view.
      const step = Math.floor(clamp((p - 0.25) / 0.45) * (rows.length - 1) + 1e-6);
      drawScreen(Math.min(rows.length - 1, step));

      // Photon: leaves the screen centre once the funnel reaches its end, and falls past the
      // bottom of the section toward the dark chapter.
      const sec = section.getBoundingClientRect();
      const q = clamp((p - 0.62) / 0.38);
      group.updateMatrixWorld();
      screen.getWorldPosition(screenWorld);
      const end = tmp.set(vw * 0.5, -(sec.bottom + sy + vh * 0.25), 320);
      const show = q > 0.001;
      core.visible = show;
      for (let i = 0; i < TRAIL; i++) {
        const qi = clamp(q - i * 0.025);
        const e = ease(qi);
        const s = sprites[i];
        s.visible = show && qi > 0;
        s.position.lerpVectors(screenWorld, end, e);
        s.position.x += Math.sin(e * Math.PI) * vw * 0.12;
        s.position.z += 40;
        s.scale.setScalar((90 - i * 6) * (0.6 + e * 0.6));
        if (i === 0) core.position.copy(s.position);
      }
      core.scale.setScalar(9 + ease(q) * 5);
      return `${p.toFixed(4)}|${q.toFixed(4)}|${Math.round(time * 30)}`;
    },
  };
}
