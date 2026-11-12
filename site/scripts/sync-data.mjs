// Copy the project's generated results into site/public so the browser can fetch them.
// Read-only with respect to ../results and ../cache: files are read or copied, never edited.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = path.resolve(site, '..', 'results');

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

const dataFiles = ['results.json', 'web_qm9_points.json'];
for (const name of dataFiles) {
  const from = path.join(results, name);
  if (!fs.existsSync(from)) throw new Error(`missing ${name}: run ./py.sh -m src.reproduce in the repo root`);
  copy(from, path.join(site, 'public', 'data', name));
}

const figureDir = path.join(results, 'figures');
const figures = fs.readdirSync(figureDir).filter((name) => /^fig\d{2}_.*\.(svg|png)$/.test(name));
fs.rmSync(path.join(site, 'public', 'figures'), { recursive: true, force: true });
for (const name of figures) copy(path.join(figureDir, name), path.join(site, 'public', 'figures', name));

// Molecule geometries for the 3D scenes: the B3LYP/6-31G* optimised .xyz files of the Part 2
// molecules (names from results.json), with bonds inferred from covalent radii. Coordinates in Å.
const COVALENT_RADIUS_A = { H: 0.31, C: 0.76, N: 0.71, O: 0.66, S: 1.05 };
const BOND_TOLERANCE = 1.15;
const resultsJson = JSON.parse(fs.readFileSync(path.join(results, 'results.json'), 'utf8'));
const quantumDir = path.resolve(site, '..', 'cache', 'quantum');
function readGeometry(name, file) {
  if (!fs.existsSync(file)) throw new Error(`missing geometry for ${name}: ${path.relative(site, file)}`);
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const count = Number(lines[0]);
  const atoms = lines.slice(2, 2 + count).map((line) => {
    const [el, x, y, z] = line.trim().split(/\s+/);
    if (!(el in COVALENT_RADIUS_A)) throw new Error(`${name}: no covalent radius for ${el}`);
    return [el, Number(x), Number(y), Number(z)];
  });
  if (atoms.length !== count) throw new Error(`${name}: expected ${count} atoms, read ${atoms.length}`);
  const bonds = [];
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      const d = Math.hypot(atoms[i][1] - atoms[j][1], atoms[i][2] - atoms[j][2], atoms[i][3] - atoms[j][3]);
      if (d < BOND_TOLERANCE * (COVALENT_RADIUS_A[atoms[i][0]] + COVALENT_RADIUS_A[atoms[j][0]])) bonds.push([i, j]);
    }
  }
  return { name, atoms, bonds };
}
const molecules = resultsJson.quantum.molecules.map(({ name }) => readGeometry(name, path.join(quantumDir, `${name}__B3LYP.xyz`)));
fs.writeFileSync(path.join(site, 'public', 'data', 'molecules.json'), JSON.stringify(molecules));

// Stickers by the predictor: every web preset (the Part 2 molecules and the screening hits). Hits
// are found by SMILES in the cached candidate records (cache/quantum/candidate_*__B3LYP.json).
const candidates = fs
  .readdirSync(quantumDir)
  .filter((f) => /^candidate_.*__B3LYP\.json$/.test(f))
  .map((f) => JSON.parse(fs.readFileSync(path.join(quantumDir, f), 'utf8')));
const stickers = resultsJson.web.predictor_presets.map((p) => {
  const part2 = path.join(quantumDir, `${p.name}__B3LYP.xyz`);
  if (fs.existsSync(part2)) return readGeometry(p.name, part2);
  const hit = candidates.find((c) => c.smiles === p.smiles);
  if (!hit) throw new Error(`no cached geometry for preset ${p.name} (${p.smiles})`);
  return { ...readGeometry(p.name, path.join(quantumDir, `${hit.name}__B3LYP.xyz`)), name: p.name };
});
fs.writeFileSync(path.join(site, 'public', 'data', 'stickers.json'), JSON.stringify(stickers));

console.log(`sync-data: ${dataFiles.length} data files, ${figures.length} figure files, ${molecules.length} molecule geometries, ${stickers.length} sticker geometries`);
