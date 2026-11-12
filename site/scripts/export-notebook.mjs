// Export the executed project notebook to static HTML for the "Read the notebook" link.
// Uses the project's Python environment (same one ../py.sh uses). Reads ../notebook only.
// External scripts and stylesheets that nbconvert's template pulls from CDNs are removed, so the
// page makes no third-party requests (maths in markdown then shows as plain TeX).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const notebook = path.resolve(site, '..', 'notebook', 'solar_dye.ipynb');
const outDir = path.join(site, 'public', 'notebook');
const envDir = process.env.SOLAR_DYE_ENV || path.join(os.homedir(), 'micromamba', 'envs', 'solar-dye');
const python = [path.join(envDir, 'python.exe'), path.join(envDir, 'bin', 'python')].find((p) => fs.existsSync(p));
if (!python) throw new Error(`export-notebook: no Python found in ${envDir}; set SOLAR_DYE_ENV`);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const run = spawnSync(
  python,
  ['-m', 'nbconvert', '--to', 'html', '--template', 'lab', '--output-dir', outDir, '--output', 'index', notebook],
  { encoding: 'utf-8' },
);
if (run.status !== 0) throw new Error(`export-notebook: nbconvert failed\n${run.stderr}`);

const file = path.join(outDir, 'index.html');
let html = fs.readFileSync(file, 'utf-8');
const before = html.length;
html = html
  .replace(/<script[^>]+src="https?:\/\/[^"]+"[^>]*>\s*<\/script>/gi, '')
  .replace(/<link[^>]+href="https?:\/\/[^"]+"[^>]*>/gi, '')
  .replace(/<script type="text\/x-mathjax-config">[\s\S]*?<\/script>/gi, '');
html = html.replace('<title>solar_dye</title>', '<title>Notebook — Solar Dye</title>');
fs.writeFileSync(file, html);
const leftovers = html.match(/(src|href)="https?:\/\/[^"]+"/g) || [];
console.log(`export-notebook: ${path.relative(site, file)} (${Math.round(html.length / 1024)} KB, removed ${before - html.length} bytes of CDN tags; ${leftovers.length} external links left as plain links)`);
