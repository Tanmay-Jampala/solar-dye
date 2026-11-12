// The predictor UI. All model numbers come from the JSON embedded at build time (results.json):
// model.ridge_for_web, web.predictor_presets, descriptors.summary_statistics, sq.curve and the
// target gap. Every number shown goes through format() with a predictor.* or results key.
import { format } from '../lib/format';
import { predictGap, rangeFlag, type RidgeModel, type FeatureStats } from '../lib/ridge';

interface Preset {
  name: string;
  reference_gap_eV: number;
  reference: string;
  descriptors: Record<string, number>;
  ridge_predicted_gap_eV: number;
}
interface AppData {
  order: string[];
  model: RidgeModel;
  presets: Preset[];
  stats: Record<string, FeatureStats>;
  curve: { gap_eV: number[]; efficiency: number[] };
  target: number;
  integer: string[];
  ruler: [number, number];
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Same markup as <Num>: <span class="num" data-key>n<span class="unit"> u</span></span>. */
function num(key: string, value: unknown, opts: { rule?: string; unit?: string; derived?: boolean } = {}) {
  const f = format(opts.rule ?? key, value);
  const u = f.u ?? opts.unit;
  const d = (opts.derived ? ' data-derived="computed"' : '') + (opts.rule ? ` data-rule="${esc(opts.rule)}"` : '');
  return `<span class="num" data-key="${esc(key)}"${d}>${esc(f.n)}${u ? `<span class="unit"> ${esc(u)}</span>` : ''}</span>`;
}

export function initPredictor() {
  const card = document.querySelector<HTMLElement>('[data-predictor]');
  if (!card?.dataset.json) return;
  const data = JSON.parse(card.dataset.json) as AppData;
  const { order, model, presets, stats, curve, target } = data;
  const last = curve.gap_eV.length - 1;
  const step = (curve.gap_eV[last] - curve.gap_eV[0]) / last;

  const fields = new Map(
    order.map((f) => {
      const el = card.querySelector<HTMLElement>(`[data-field="${f}"]`)!;
      return [f, { el, slider: el.querySelector<HTMLInputElement>('[data-slider]')!, input: el.querySelector<HTMLInputElement>('[data-input]')!, flag: el.querySelector<HTMLElement>('[data-flag]')! }];
    }),
  );
  const chips = Array.from(card.querySelectorAll<HTMLButtonElement>('[data-preset]'));
  const outGap = card.querySelector<HTMLElement>('[data-out-gap]')!;
  const outDot = card.querySelector<HTMLElement>('[data-out-dot]')!;
  const outDist = card.querySelector<HTMLElement>('[data-out-dist]')!;
  const outSq = card.querySelector<HTMLElement>('[data-out-sq]')!;
  const outRef = card.querySelector<HTMLElement>('[data-out-ref]')!;
  const outWarn = card.querySelector<HTMLElement>('[data-out-warn]')!;

  // Exact stored values while a preset is untouched; the user's numbers once edited.
  const values: Record<string, number> = { ...presets[0].descriptors };
  let preset: number | null = 0;

  const show = (f: string) => {
    const { input, slider } = fields.get(f)!;
    input.value = format(`predictor.input.${f}`, values[f]).n.replace(/,/g, '');
    slider.value = String(values[f]);
  };

  function update() {
    const gap = predictGap(model, order, values);

    // range flags
    let outside = 0, sigma = 0;
    for (const f of order) {
      const flag = rangeFlag(stats[f], values[f]);
      const field = fields.get(f)!;
      field.el.dataset.state = flag;
      field.flag.textContent = flag === 'range' ? 'OUTSIDE QM9' : flag === 'sigma' ? 'BEYOND 3σ' : '';
      if (flag === 'range') outside++;
      else if (flag === 'sigma') sigma++;
    }

    outGap.innerHTML = num('predictor.gap_eV', gap, { unit: 'eV', derived: true });
    const [r0, r1] = data.ruler;
    outDot.style.left = `${((Math.min(r1, Math.max(r0, gap)) - r0) / (r1 - r0)) * 100}%`;

    const side = gap >= target ? 'above' : 'below';
    outDist.innerHTML = `${num('predictor.distance_eV', Math.abs(gap - target), { unit: 'eV', derived: true })} ${side} the ${num('model.screening.target_gap_eV', target, { unit: 'eV' })} target.`;

    if (gap <= 0) {
      outSq.innerHTML = 'A band gap cannot be zero or negative: this prediction is the model extrapolating, not chemistry.';
    } else if (gap < curve.gap_eV[0] - step / 2 || gap > curve.gap_eV[last] + step / 2) {
      outSq.innerHTML = `Outside the stored efficiency curve (${num('sq.curve.gap_eV[0]', curve.gap_eV[0], { unit: 'eV' })} to ${num(`sq.curve.gap_eV[${last}]`, curve.gap_eV[last], { unit: 'eV' })}), so no Shockley–Queisser limit is read for it.`;
    } else {
      const i = Math.max(0, Math.min(last, Math.round((gap - curve.gap_eV[0]) / step)));
      outSq.innerHTML = `Shockley–Queisser limit at the nearest stored point, ${num(`sq.curve.gap_eV[${i}]`, curve.gap_eV[i], { unit: 'eV' })}: ${num(`sq.curve.efficiency[${i}]`, curve.efficiency[i])}.`;
    }

    if (preset !== null) {
      const p = presets[preset];
      const k = `web.predictor_presets[${preset}]`;
      outRef.innerHTML = `Reference for ${num(`${k}.name`, p.name)}: ${num(`${k}.reference_gap_eV`, p.reference_gap_eV, { rule: 'predictor.gap_eV', unit: 'eV' })}, ${num(`${k}.reference`, p.reference)}. The notebook's Ridge gave ${num(`${k}.ridge_predicted_gap_eV`, p.ridge_predicted_gap_eV, { rule: 'predictor.gap_eV', unit: 'eV' })}; this page reproduces it.`;
      outRef.hidden = false;
    } else {
      outRef.innerHTML = 'Your own descriptors: there is no reference value to compare with.';
    }

    if (outside || sigma) {
      const parts: string[] = [];
      const are = (n: number) => (n === 1 ? 'input is' : 'inputs are');
      if (outside) parts.push(`${num('predictor.count', outside)} ${are(outside)} outside the range seen in QM9`);
      if (sigma) parts.push(`${num('predictor.count', sigma)} ${are(sigma)} more than 3σ from the QM9 mean`);
      outWarn.innerHTML = `${parts.join('; ')}. The model has seen few or no molecules like this, so the prediction is an extrapolation.`;
      outWarn.hidden = false;
    } else {
      outWarn.hidden = true;
    }
  }

  function choose(i: number) {
    preset = i;
    Object.assign(values, presets[i].descriptors);
    order.forEach(show);
    chips.forEach((c, k) => c.setAttribute('aria-pressed', k === i ? 'true' : 'false'));
    update();
  }

  const edited = () => {
    preset = null;
    chips.forEach((c) => c.setAttribute('aria-pressed', 'false'));
  };

  chips.forEach((chip) => chip.addEventListener('click', () => choose(Number(chip.dataset.preset))));
  for (const f of order) {
    const { slider, input } = fields.get(f)!;
    slider.addEventListener('input', () => {
      values[f] = Number(slider.value);
      input.value = format(`predictor.input.${f}`, values[f]).n.replace(/,/g, '');
      edited();
      update();
    });
    input.addEventListener('input', () => {
      const v = Number(input.value.replace(/−/g, '-').replace(/,/g, '').trim());
      if (input.value.trim() === '' || !Number.isFinite(v)) {
        fields.get(f)!.flag.textContent = 'not a number';
        return;
      }
      values[f] = v;
      slider.value = String(v);
      edited();
      update();
    });
    input.addEventListener('blur', () => show(f));
  }
  card.querySelector('form')?.addEventListener('submit', (e) => e.preventDefault());
  update();
}
