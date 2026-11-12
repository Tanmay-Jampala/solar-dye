// The web predictor's model: the notebook's Ridge regression (model.ridge_for_web in results.json),
// applied exactly as in Python: standardise each descriptor with the training mean and the
// population standard deviation (ddof = 0), then intercept + sum(coefficient * z).
// Self-contained (no imports) so scripts/test-ridge.mjs can run it under Node directly.

export interface RidgeModel {
  coefficients_eV_per_std: Record<string, number>;
  intercept_eV: number;
  feature_mean: Record<string, number>;
  feature_std_ddof0: Record<string, number>;
}

/** Predicted HOMO-LUMO gap in eV for one molecule's descriptors, summed in feature order. */
export function predictGap(model: RidgeModel, order: string[], x: Record<string, number>): number {
  let gap = model.intercept_eV;
  for (const name of order) {
    const value = x[name];
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`ridge: descriptor ${name} is missing`);
    gap += model.coefficients_eV_per_std[name] * ((value - model.feature_mean[name]) / model.feature_std_ddof0[name]);
  }
  return gap;
}

export interface FeatureStats { mean: number; std: number; min: number; max: number }
export type RangeFlag = 'ok' | 'sigma' | 'range';

/** How far a value sits from QM9: outside the observed min..max, or more than 3 sigma from the mean. */
export function rangeFlag(stats: FeatureStats, value: number): RangeFlag {
  if (value < stats.min || value > stats.max) return 'range';
  if (Math.abs(value - stats.mean) > 3 * stats.std) return 'sigma';
  return 'ok';
}
