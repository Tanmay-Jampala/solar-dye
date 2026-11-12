// A small rotatable ball-and-stick viewer for one molecule at a time (Part 2 table, Part 3 torsion
// scan). Geometry is whatever the caller passes: the stored B3LYP coordinates (Å). Bonds are taken
// from the data when given, otherwise inferred from covalent radii.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface ViewerMolecule {
  atoms: [string, number, number, number][];
  bonds?: [number, number][];
}

const COLOUR: Record<string, string> = { C: '#1b1c26', H: '#f2f3f8', N: '#1a2ffb', O: '#ff4c41', S: '#c1ff00' };
const RADIUS: Record<string, number> = { H: 0.24, C: 0.4, N: 0.4, O: 0.4, S: 0.52 };
const COVALENT: Record<string, number> = { H: 0.31, C: 0.76, N: 0.71, O: 0.66, S: 1.05 };

function inferBonds(atoms: ViewerMolecule['atoms']): [number, number][] {
  const bonds: [number, number][] = [];
  for (let i = 0; i < atoms.length; i++)
    for (let j = i + 1; j < atoms.length; j++) {
      const d = Math.hypot(atoms[i][1] - atoms[j][1], atoms[i][2] - atoms[j][2], atoms[i][3] - atoms[j][3]);
      if (d < 1.15 * ((COVALENT[atoms[i][0]] ?? 0.75) + (COVALENT[atoms[j][0]] ?? 0.75))) bonds.push([i, j]);
    }
  return bonds;
}

function build(m: ViewerMolecule, centre: THREE.Vector3 | null) {
  const pos = m.atoms.map(([, x, y, z]) => new THREE.Vector3(x, y, z));
  const c = centre ?? pos.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pos.length);
  pos.forEach((p) => p.sub(c));
  const parts: THREE.BufferGeometry[] = [];
  const paint = (g: THREE.BufferGeometry, hex: string) => {
    const col = new THREE.Color(hex);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  };
  m.atoms.forEach(([el], i) => {
    const g = new THREE.SphereGeometry(RADIUS[el] ?? 0.4, 28, 18);
    g.translate(pos[i].x, pos[i].y, pos[i].z);
    parts.push(paint(g, COLOUR[el] ?? '#888899'));
  });
  const up = new THREE.Vector3(0, 1, 0);
  for (const [i, j] of m.bonds ?? inferBonds(m.atoms)) {
    const a = pos[i], b = pos[j];
    const dir = b.clone().sub(a);
    const len = dir.length();
    // two half-bonds, each in its atom's colour
    for (const [from, el, sign] of [[a, m.atoms[i][0], 1], [b, m.atoms[j][0], -1]] as const) {
      const g = new THREE.CylinderGeometry(0.12, 0.12, len / 2, 12, 1, true);
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
      // centred a quarter of the way along the bond from its own atom
      g.applyMatrix4(new THREE.Matrix4().compose(from.clone().addScaledVector(dir, 0.25 * sign), q, new THREE.Vector3(1, 1, 1)));
      parts.push(paint(g, COLOUR[el] ?? '#888899'));
    }
  }
  const geo = mergeGeometries(parts, false)!;
  parts.forEach((g) => g.dispose());
  geo.computeBoundingSphere();
  return { geo, centre: c };
}

/** env: the shared baked environment (webgl/env.ts), or null to light with the key light only. */
export function createViewer(mount: HTMLElement, reducedMotion: boolean, env: THREE.Texture | null) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  mount.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.environmentIntensity = 0.8;
  const key = new THREE.DirectionalLight('#ffffff', 1.6);
  key.position.set(-4, 6, 8);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const material = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });
  const group = new THREE.Group();
  scene.add(group);
  let mesh: THREE.Mesh | null = null;
  let radius = 5;
  let centre: THREE.Vector3 | null = null;

  const fit = () => {
    const w = mount.clientWidth, h = mount.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const dist = (radius * 1.15) / Math.sin(Math.min(fov, fov * camera.aspect) / 2);
    camera.position.set(0, 0, dist);
    camera.near = dist / 20;
    camera.far = dist * 4;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(() => {
    fit();
    render();
  }).observe(mount);

  // drag to rotate; a slow turn when idle
  let dragging = false, lx = 0, ly = 0, idle = true;
  mount.addEventListener('pointerdown', (e) => {
    dragging = true;
    idle = false;
    lx = e.clientX;
    ly = e.clientY;
    mount.setPointerCapture(e.pointerId);
  });
  mount.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    group.rotation.y += (e.clientX - lx) * 0.01;
    group.rotation.x += (e.clientY - ly) * 0.01;
    lx = e.clientX;
    ly = e.clientY;
    render();
  });
  const up = () => (dragging = false);
  mount.addEventListener('pointerup', up);
  mount.addEventListener('pointercancel', up);

  function render() {
    renderer.render(scene, camera);
  }
  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(mount);
  const loop = () => {
    if (visible && idle && !reducedMotion && !document.hidden) {
      group.rotation.y += 0.004;
      render();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  return {
    /** Show a molecule. keepFrame: reuse the previous centre and size (torsion frames stay put). */
    show(m: ViewerMolecule, keepFrame = false) {
      const built = build(m, keepFrame ? centre : null);
      centre = built.centre;
      if (mesh) {
        group.remove(mesh);
        mesh.geometry.dispose();
      }
      mesh = new THREE.Mesh(built.geo, material);
      group.add(mesh);
      if (!keepFrame) {
        radius = built.geo.boundingSphere!.radius;
        fit();
      }
      render();
    },
    setRotation(x: number, y: number) {
      group.rotation.set(x, y, 0);
      render();
    },
  };
}
