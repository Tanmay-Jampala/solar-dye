// Parity test: the browser Ridge (src/lib/ridge.ts) must reproduce the notebook's stored Ridge
// predictions for every web preset (web.predictor_presets[*].ridge_predicted_gap_eV).
// Run: ./node.sh node scripts/test-ridge.mjs   (Node >= 22.18 strips the TypeScript types)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { predictGap, rangeFlag } from '../src/lib/ridge.ts';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = JSON.parse(fs.readFileSync(path.resolve(site, '..', 'results', 'results.json'), 'utf8'));
const model = results.model.ridge_for_web;
const order = results.web.feature_order;
const presets = results.web.predictor_presets;
const TOL = 1e-9;

let worst = 0;
const failures = [];
for (const p of presets) {
  const js = predictGap(model, order, p.descriptors);
  const diff = Math.abs(js - p.ridge_predicted_gap_eV);
  worst = Math.max(worst, diff);
  if (!(diff <= TOL)) failures.push(`${p.name}: js ${js} vs python ${p.ridge_predicted_gap_eV} (diff ${diff})`);
}
if (order.length !== Object.keys(model.coefficients_eV_per_std).length) failures.push('feature_order does not match the coefficients');

// Range flags behave as documented.
const stats = { mean: 0, std: 1, min: -2, max: 10 };
const flags = [rangeFlag(stats, 0), rangeFlag(stats, 3.5), rangeFlag(stats, -3)];
if (flags.join() !== 'ok,sigma,range') failures.push(`rangeFlag gave ${flags.join()}`);

if (failures.length) {
  console.error('test-ridge FAILED:\n' + failures.join('\n'));
  process.exit(1);
}
console.log(`test-ridge: ${presets.length} presets match the notebook's Ridge (worst |diff| ${worst.toExponential(2)} eV, tolerance ${TOL})`);
