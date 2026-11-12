// Hero scene: a pile of glossy molecules (the nine Part 2 molecules, built from their B3LYP
// geometries), instanced and driven by a small custom physics loop. The cursor pushes them away;
// clicking one flashes its name. Palette is art direction only: electric blue, white, glossy black,
// and acid green for sulphur atoms.
//
// It touches no DOM (hero.ts owns the canvas and the events). Moving it into a Web Worker on an
// OffscreenCanvas was tried and measured worse: the shader compile still occupies the GPU process,
// and the page's own frame commits queue behind it.
import * as THREE from 'three';
import { yieldToMain } from './yield';
import { roomEnvironment } from './env';
import { frameGovernor } from './quality';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildMolecule, type MoleculeData, type MoleculeMesh } from './molecules';

export interface HeroOptions {
  mobile: boolean;
  /** Card taller than wide: the pile is laid out vertically. */
  portrait: boolean;
  dpr: number;
  width: number;
  height: number;
}

export interface HeroScene {
  resize(width: number, height: number): void;
  /** Cursor in normalised device coordinates, or null when it leaves the card. */
  pointer(ndc: [number, number] | null): void;
  /** Nudges the molecule under the click and returns its name (null if none was hit). */
  click(ndc: [number, number]): string | null;
  /** Advances the physics by the elapsed time and renders a frame. */
  frame(deltaMs: number): void;
}

interface Body {
  type: number;
  slot: number;
  p: THREE.Vector3;
  v: THREE.Vector3;
  q: THREE.Quaternion;
  w: THREE.Vector3;
  m: number;
  invI: number;
  reach: number; // furthest collider centre + collider radius
  phase: number;
  world: THREE.Vector3[];
}

const PALETTE = ['#1a2ffb', '#1a2ffb', '#f2f3f8', '#f2f3f8', '#0b0c12'];
const COLLIDER_R = 1.15; // Å, heavy-atom collider radius
const DT = 1 / 120;

/** Builds the scene, settles the pile and renders the first frame. */
export async function createHeroScene(canvas: HTMLCanvasElement | OffscreenCanvas, data: MoleculeData[], opts: HeroOptions): Promise<HeroScene> {
  const { mobile, portrait } = opts;
  let dpr = opts.dpr;
  const copies = mobile ? 2 : 3;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#05060c');
  scene.environment = await roomEnvironment();
  scene.environmentIntensity = 0.75;
  const key = new THREE.DirectionalLight('#ffffff', 1.6);
  key.position.set(-6, 10, 12);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#8fa0ff', 1.4);
  rim.position.set(10, -4, -8);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(26, 2, 1, 200);
  const CAM_Z = 44;
  camera.position.set(0, 0, CAM_Z);

  // --- meshes -----------------------------------------------------------------------------------
  const acid = new THREE.Color('#c1ff00');
  const material = new THREE.MeshPhysicalMaterial({
    roughness: 0.22,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAccent = { value: acid };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAccent;\nvarying float vAccent;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAccent = aAccent;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uAccent;\nvarying float vAccent;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uAccent, vAccent);');
  };

  const mols: MoleculeMesh[] = data.map((m) => buildMolecule(m, mobile ? 'low' : 'high'));
  const meshes = mols.map((mol) => {
    const mesh = new THREE.InstancedMesh(mol.geometry, material, copies);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.userData.name = mol.name;
    scene.add(mesh);
    return mesh;
  });

  // --- bodies -----------------------------------------------------------------------------------
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const bodies: Body[] = [];
  mols.forEach((mol, type) => {
    for (let slot = 0; slot < copies; slot++) {
      const m = 0.6 + mol.colliders.length * 0.12;
      const reach = Math.max(...mol.colliders.map((c) => c.length())) + COLLIDER_R;
      bodies.push({
        type,
        slot,
        p: new THREE.Vector3(portrait ? (rand() - 0.5) * 14 : (rand() - 0.5) * 56, portrait ? (rand() - 0.5) * 40 : (rand() - 0.5) * 16, (rand() - 0.5) * 10),
        v: new THREE.Vector3(),
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 6.3, rand() * 6.3, rand() * 6.3)),
        w: new THREE.Vector3((rand() - 0.5) * 0.6, (rand() - 0.5) * 0.6, (rand() - 0.5) * 0.6),
        m,
        invI: 1 / (0.4 * m * reach * reach),
        reach,
        phase: rand() * 100,
        world: mol.colliders.map(() => new THREE.Vector3()),
      });
      meshes[type].setColorAt(slot, new THREE.Color(PALETTE[Math.floor(rand() * PALETTE.length)]));
    }
  });
  meshes.forEach((mesh) => (mesh.instanceColor!.needsUpdate = true));

  // Pile shape: a soft anisotropic spring toward the centre, stretched along the card's long side.
  const spring = portrait ? new THREE.Vector3(2.2, 0.42, 2.2) : new THREE.Vector3(0.38, 1.9, 2.2);
  const cursor = new THREE.Vector3();
  let cursorOn = false;
  const F: THREE.Vector3[] = bodies.map(() => new THREE.Vector3());
  const T: THREE.Vector3[] = bodies.map(() => new THREE.Vector3());
  const tmp = new THREE.Vector3(), lever = new THREE.Vector3(), n = new THREE.Vector3(), rv = new THREE.Vector3();
  const at = new THREE.Vector3(), fv = new THREE.Vector3();
  const dq = new THREE.Quaternion();
  let simTime = 0;

  const refreshWorld = (b: Body) => {
    const cols = mols[b.type].colliders;
    for (let k = 0; k < cols.length; k++) b.world[k].copy(cols[k]).applyQuaternion(b.q).add(b.p);
  };

  const addForceAt = (i: number, f: THREE.Vector3, at: THREE.Vector3) => {
    F[i].add(f);
    lever.copy(at).sub(bodies[i].p);
    T[i].add(tmp.copy(lever).cross(f));
  };

  function step() {
    simTime += DT;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      refreshWorld(b);
      F[i].set(-spring.x * b.p.x, -spring.y * b.p.y, -spring.z * b.p.z).multiplyScalar(b.m);
      F[i].addScaledVector(b.v, -1.6 * b.m);
      const t = simTime + b.phase;
      F[i].x += Math.sin(t * 0.5) * 0.8 * b.m;
      F[i].y += Math.cos(t * 0.37) * 1.1 * b.m;
      F[i].z += Math.sin(t * 0.29) * 0.6 * b.m;
      T[i].copy(b.w).multiplyScalar(-1.2 / b.invI);
      T[i].x += Math.sin(t * 0.21) * 0.25 / b.invI;
      T[i].y += Math.cos(t * 0.17) * 0.25 / b.invI;
    }

    // Contacts between heavy-atom colliders (penalty springs with normal damping).
    const KC = 90, CD = 4;
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        const reach = a.reach + b.reach;
        if (a.p.distanceToSquared(b.p) > reach * reach) continue;
        for (const pa of a.world) {
          for (const pb of b.world) {
            n.copy(pa).sub(pb);
            const d2 = n.lengthSq();
            if (d2 >= 4 * COLLIDER_R * COLLIDER_R || d2 < 1e-8) continue;
            const d = Math.sqrt(d2);
            n.divideScalar(d);
            rv.copy(a.v).sub(b.v);
            const f = KC * (2 * COLLIDER_R - d) - CD * Math.min(0, rv.dot(n));
            at.copy(pa).add(pb).multiplyScalar(0.5);
            fv.copy(n).multiplyScalar(f);
            addForceAt(i, fv, at);
            addForceAt(j, fv.negate(), at);
          }
        }
      }
    }

    // Cursor: pushes colliders out of a soft radius in the plane of the screen.
    if (cursorOn) {
      const RC = 7.5, K = 260;
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        if (b.p.distanceTo(cursor) > RC + b.reach) continue;
        for (const pa of b.world) {
          n.set(pa.x - cursor.x, pa.y - cursor.y, (pa.z - cursor.z) * 0.35);
          const d = n.length();
          if (d >= RC || d < 1e-6) continue;
          const s = 1 - d / RC;
          addForceAt(i, n.normalize().multiplyScalar((K * s * s) / b.world.length), pa);
        }
      }
    }

    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      b.v.addScaledVector(F[i], DT / b.m);
      b.p.addScaledVector(b.v, DT);
      b.w.addScaledVector(T[i], DT * b.invI);
      const wl = b.w.length();
      if (wl > 3) b.w.multiplyScalar(3 / wl);
      dq.set(b.w.x * DT * 0.5, b.w.y * DT * 0.5, b.w.z * DT * 0.5, 0).multiply(b.q);
      b.q.set(b.q.x + dq.x, b.q.y + dq.y, b.q.z + dq.z, b.q.w + dq.w).normalize();
    }
  }

  const mtx = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1);
  function sync() {
    for (const b of bodies) meshes[b.type].setMatrixAt(b.slot, mtx.compose(b.p, b.q, one));
    meshes.forEach((m) => (m.instanceMatrix.needsUpdate = true));
  }

  // Settle the pile before the first frame, in slices so the thread stays responsive.
  const settle = mobile ? 360 : 480;
  for (let k = 0; k < settle; k++) {
    step();
    if (k % 40 === 39) await yieldToMain();
  }
  sync();

  // --- rendering ----------------------------------------------------------------------------------
  const composer = new EffectComposer(
    renderer,
    new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: mobile ? 0 : 4 }),
  );
  composer.addPass(new RenderPass(scene, camera));
  const bokeh = mobile ? null : new BokehPass(scene, camera, { focus: CAM_Z - 2, aperture: 0.0035, maxblur: 0.007 });
  if (bokeh) composer.addPass(bokeh);
  composer.addPass(new OutputPass());

  let lastW = opts.width, lastH = opts.height;
  function resize(w: number, h: number) {
    if (!w || !h) return;
    lastW = w;
    lastH = h;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    // Keep the pile's width in frame on narrow cards.
    camera.fov = portrait ? 34 : camera.aspect < 1.2 ? 26 * Math.min(1.9, 1.2 / camera.aspect) : 26;
    camera.updateProjectionMatrix();
  }
  resize(opts.width, opts.height);

  const render = () => composer.render();
  // Compile the shaders without stalling the thread (parallel compile where supported).
  await yieldToMain();
  await renderer.compileAsync(scene, camera);
  render();

  // --- interaction --------------------------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const ndcV = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -3);
  let acc = 0;
  // Slow GPU: drop the depth of field and render at pixel ratio 1.
  const govern = frameGovernor('hero', () => {
    if (bokeh) bokeh.enabled = false;
    dpr = 1;
    resize(lastW, lastH);
  });

  return {
    resize(w, h) {
      resize(w, h);
      render();
    },
    pointer(ndc) {
      if (!ndc) {
        cursorOn = false;
        return;
      }
      raycaster.setFromCamera(ndcV.set(ndc[0], ndc[1]), camera);
      cursorOn = !!raycaster.ray.intersectPlane(plane, cursor);
    },
    click(ndc) {
      raycaster.setFromCamera(ndcV.set(ndc[0], ndc[1]), camera);
      meshes.forEach((m) => m.computeBoundingSphere());
      const hit = raycaster.intersectObjects(meshes, false)[0];
      if (!hit || hit.instanceId === undefined) return null;
      const body = bodies.find((b) => meshes[b.type] === hit.object && b.slot === hit.instanceId);
      if (body) body.v.add(raycaster.ray.direction.clone().multiplyScalar(14));
      return (hit.object as THREE.InstancedMesh).userData.name as string;
    },
    frame(deltaMs) {
      govern(deltaMs);
      acc += Math.min(deltaMs / 1000, 1 / 20);
      let k = 0;
      while (acc >= DT && k < 4) {
        step();
        acc -= DT;
        k++;
      }
      sync();
      render();
    },
  };
}
