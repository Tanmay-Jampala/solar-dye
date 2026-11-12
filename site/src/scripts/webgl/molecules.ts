// Ball-and-stick meshes built from the real B3LYP/6-31G* geometries (public/data/molecules.json,
// written by scripts/sync-data.mjs from cache/quantum/*__B3LYP.xyz). Units: Å.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface MoleculeData {
  name: string;
  atoms: [string, number, number, number][];
  bonds: [number, number][];
}

export interface MoleculeMesh {
  name: string;
  geometry: THREE.BufferGeometry;
  /** Heavy-atom centres relative to the centroid: the compound collider of the physics. */
  colliders: THREE.Vector3[];
  radius: number;
}

// Stylised radii (art direction, not van der Waals radii).
const ATOM_RADIUS: Record<string, number> = { H: 0.26, C: 0.44, N: 0.44, O: 0.44, S: 0.56 };
const BOND_RADIUS = 0.15;

export async function loadMolecules(url: string): Promise<MoleculeData[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`molecules: ${res.status}`);
  return res.json();
}

export function buildMolecule(m: MoleculeData, detail: 'high' | 'low' = 'high'): MoleculeMesh {
  const centroid = new THREE.Vector3();
  const pos = m.atoms.map(([, x, y, z]) => new THREE.Vector3(x, y, z));
  pos.forEach((p) => centroid.add(p));
  centroid.divideScalar(pos.length);
  pos.forEach((p) => p.sub(centroid));

  const [ws, hs, rs] = detail === 'high' ? [18, 12, 8] : [12, 8, 6];
  const parts: THREE.BufferGeometry[] = [];
  const tag = (g: THREE.BufferGeometry, accent: number) => {
    const n = g.attributes.position.count;
    g.setAttribute('aAccent', new THREE.BufferAttribute(new Float32Array(n).fill(accent), 1));
    return g;
  };

  m.atoms.forEach(([el], i) => {
    // Hydrogens are small: fewer segments.
    const g = el === 'H'
      ? new THREE.SphereGeometry(ATOM_RADIUS.H, Math.max(8, ws - 6), Math.max(6, hs - 4))
      : new THREE.SphereGeometry(ATOM_RADIUS[el] ?? 0.44, ws, hs);
    g.translate(pos[i].x, pos[i].y, pos[i].z);
    parts.push(tag(g, el === 'S' ? 1 : 0));
  });

  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const mtx = new THREE.Matrix4();
  m.bonds.forEach(([i, j]) => {
    const a = pos[i], b = pos[j];
    const dir = b.clone().sub(a);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(BOND_RADIUS, BOND_RADIUS, len, rs, 1, true);
    q.setFromUnitVectors(up, dir.normalize());
    mtx.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(mtx);
    parts.push(tag(g, 0));
  });

  const geometry = mergeGeometries(parts, false)!;
  parts.forEach((g) => g.dispose());
  geometry.computeBoundingSphere();

  const colliders = m.atoms.map(([el], i) => (el === 'H' ? null : pos[i])).filter(Boolean) as THREE.Vector3[];
  return { name: m.name, geometry, colliders, radius: geometry.boundingSphere!.radius };
}
