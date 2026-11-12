// The one place numbers are turned into text. Shared by build-time components and browser code.
//
// format(key, value) looks the key path up in PRECISION (first matching rule wins) and returns the
// number text plus an optional unit the rule itself fixes (e.g. CO2 switches between g and kg).
// A key with no rule throws, so a new number cannot reach the page without a stated precision.
// Precision follows PROJECT_STATE_FOR_COWORK.md; headline prose for the closest prediction and the
// out-of-domain MAE uses 2 decimals, tables use 3 (agreed in site/PLAN.md).

import { wavelengthNm } from './constants';

export interface Formatted {
  n: string;
  u?: string;
}

const MINUS = '−';
const SUPERSCRIPT: Record<string, string> = {
  '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

function sign(text: string): string {
  return text.startsWith('-') ? MINUS + text.slice(1) : text;
}

/** Fixed decimals, with thousands separators for the integer part. */
export function fixed(value: number, decimals: number): string {
  const text = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  // Avoid "-0.00" when a tiny negative rounds to zero.
  const isZero = Number(text.replace(/,/g, '')) === 0;
  return (value < 0 && !isZero ? MINUS : '') + text;
}

/** a × 10^b with `significant` significant figures, exponent in superscript. */
export function scientific(value: number, significant: number): string {
  const [mantissa, exponent] = value.toExponential(significant - 1).split('e');
  const power = String(Number(exponent)).split('').map((c) => SUPERSCRIPT[c]).join('');
  return `${sign(mantissa)} × 10${power}`;
}

const int = (v: number): Formatted => ({ n: fixed(v, 0) });
const dp = (d: number) => (v: number): Formatted => ({ n: fixed(v, d) });
const pct = (d: number) => (v: number): Formatted => ({ n: fixed(v * 100, d), u: '%' });
const sci = (s: number) => (v: number): Formatted => ({ n: scientific(v, s) });
const raw = (v: unknown): Formatted => ({ n: typeof v === 'string' ? v : JSON.stringify(v) });

type Rule = [RegExp, (value: any) => Formatted];

export const PRECISION: Rule[] = [
  // --- strings and records shown as they are ---------------------------------------------
  [/^environment\./, raw],
  [/^checks\[\d+\]\.(expected|actual)$/, raw],
  // numeric assumptions must match before the generic .value rule below
  [/cpu_tdp_W\.value$/, dp(0)],
  [/electricity_tariff_INR_per_kWh\.value$/, (v) => ({ n: '₹' + fixed(v, 2) })],
  [/grid_emission_factor_kgCO2_per_kWh\.value$/, dp(3)],
  [/cores_for_peak_flops\.value$/, int],
  [/base_clock_Hz\.value$/, sci(2)],
  [/peak_double_precision_flops_per_cycle_per_core\.value$/, int],
  [/^quantum_dots\.parameters_used\.\w+\.(bulk_gap_eV|electron_effective_mass|hole_effective_mass|relative_permittivity)$/,
    (v) => ({ n: String(v) })],
  [/\.(name|smiles|stage|status|source|note|cause|reference|kind|value|licence|description|url|file)$/, raw],
  [/\.(provenance|downloaded_on|sha256|rule|method|formula|equation|basis|headline|dataset|model_used|ranking|protocol|split|group|solvent|target|selection|standardisation|dihedral|molecule|colour_conversion|dye_filter_status|expected|actual|key_bond_name)$/, raw],
  [/^(generated_at|git_commit)$/, raw],
  [/(dye_filter_rules|lipinski_rules)\.\w+$/, raw],
  [/^random_seed$/, int],
  [/(size_bytes|removed|remaining|dye_rule_pass_counts\.\w+|n_atoms|n_heavy_atoms|rings)$/, int],
  [/gap_eV_(mean|std|min|max)$/, dp(2)],
  [/ml_screen_all_qm9\.wall_seconds$/, dp(2)],
  [/^quantum\.(hardware|basis|protocol)$/, raw],
  [/b3lyp_error_vs_experiment_eV\.\w+$/, dp(3)],

  // --- predictor (values computed in the browser by the Ridge model) ------------------------
  [/^predictor\.\w+_eV$/, dp(2)],
  [/^predictor\.count$/, int],
  [/^descriptors\.summary_statistics\.(h_bond_donors|h_bond_acceptors|rotatable_bonds|ring_count|aromatic_ring_count|largest_conjugated_system)\.(min|max)$/, int],
  [/^predictor\.input\.(h_bond_donors|h_bond_acceptors|rotatable_bonds|ring_count|aromatic_ring_count|largest_conjugated_system)$/, int],
  [/^predictor\.input\.\w+$/, dp(3)],

  // --- part-page interactives (indexed into stored curves and scans) -------------------------
  [/literature_optical_gaps\.\w+\.gap_eV$/, dp(2)],
  [/^torsion\.scan\[\d+\]\.energy_eV$/, (v) => ({ n: fixed(v * 1000, 1), u: 'meV' })],
  [/^quantum_dots\.brus_curve\.\w+\.(gap_eV|experimental_gap_eV)\[\d+\]$/, dp(2)],
  [/^quantum_dots\.brus_curve\.\w+\.wavelength_nm\[\d+\]$/, dp(0)],
  [/^quantum_dots\.brus_curve\.\w+\.radius_nm\[\d+\]$/, dp(2)],
  [/^count\.\w+$/, int],
  [/heavy_atoms_range\[\d\]$/, int],
  [/(lipinski_max_violations|rows_with_pce|rows_with_experimental_gap)$/, int],

  // --- counts -------------------------------------------------------------------------------
  [/(\.count|_count|rows_clean|rows_raw|rows_with_\w+|\.molecules|max_heavy_atoms|unique_filter_passers_ranked|top_candidates_in_training_set|split\.(train|validation|test)|\.n|checks_passed|checks_total|largest_conjugated_system|rank)$/, int],

  // --- Shockley-Queisser ----------------------------------------------------------------------
  [/refined_optimum_gap_eV$/, dp(3)],
  [/(optimum_gap_eV|target_gap_eV)$/, dp(2)],
  [/optimum_efficiency_percent$/, (v) => ({ n: fixed(v, 2), u: '%' })],
  [/^sq\.(optimum_efficiency|refined_optimum_efficiency|secondary_peak\.efficiency|curve\.efficiency(\[\d+\])?)$/, pct(2)],
  [/^sq\.curve\.gap_eV(\[\d+\])?$/, dp(2)],
  [/gap_grid_step_eV$/, dp(2)],
  [/secondary_peak\.gap_eV$/, dp(2)],
  [/(J_sc_mA_cm2|J_mp_mA_cm2|P_max_mW_cm2)$/, dp(2)],
  [/(V_oc_V|V_mp_V|fill_factor)$/, dp(3)],
  [/(cell_temperature_K|temperature_K)$/, dp(0)],
  [/incident_power_W_m2$/, dp(2)],
  [/(mean_sq_limit|mean_measured_pce|best_measured_pce|sq_efficiency|measured_pce)$/, pct(1)],
  [/(lipinski_pass_rate|dye_filter_pass_rate)$/, pct(1)],

  // --- headline prose: 2 decimals -----------------------------------------------------------
  [/(closest_predicted_gap_eV|closest_distance_from_target_eV)$/, dp(2)],
  [/out_of_domain_hopv\.metrics\.\w+\.(MAE_eV|RMSE_eV)$/, dp(2)],
  [/out_of_domain_hopv\.predicted_gap_range_eV\.\w+\[\d\]$/, dp(2)],
  [/hf_error_vs_experiment_eV\.\w+$/, dp(2)],

  // --- torsion ----------------------------------------------------------------------------
  [/barrier_to_planarity_eV$/, (v) => ({ n: fixed(v * 1000, 1), u: 'meV' })],
  [/_over_kT$/, dp(2)],
  [/(angle_deg)$/, dp(0)],
  [/thermal_energy_kT_eV_300K$/, (v) => ({ n: fixed(v * 1000, 1), u: 'meV' })],

  // --- statistics and metrics ---------------------------------------------------------------
  [/(MAE_eV|RMSE_eV|R2|pearson|spearman)$/, dp(3)],
  [/(centroid_fraction)$/, dp(2)],
  [/(_bond_A|bond_range_A\[\d\]|key_bond_A)$/, dp(3)],
  [/_A$/, dp(2)],

  // --- quantum dots ---------------------------------------------------------------------------
  [/(_nm|brus_over_experimental_radius)$/, dp(2)],

  // --- energy and cost --------------------------------------------------------------------
  [/\.years$/, dp(2)],
  [/energy_kWh$/, (v) => ({ n: fixed(v, v < 1 ? 3 : 0), u: 'kWh' })],
  [/cost_INR$/, (v) => ({ n: '₹' + fixed(v, v < 1000 ? 2 : 0) })],
  [/co2_kg$/, (v) => (v < 1 ? { n: fixed(v * 1000, 0), u: 'g' } : { n: fixed(v, 0), u: 'kg' })],
  [/(landauer_limit_J_per_bit|cpu_energy_per_flop_J)$/, sci(4)],
  [/landauer_limit_eV_per_bit$/, dp(4)],
  [/orders_of_magnitude_above_landauer$/, dp(1)],
  [/(speedup_ml_over_dft|ratio_energy_per_flop_to_landauer|bits_erasable_at_landauer_limit_with_project_energy|cpu_peak_flops_per_second)$/, sci(2)],
  [/energy_J$/, sci(3)],

  // --- energies in eV (tables): 3 decimals ----------------------------------------------------
  [/(_eV|_eV\[\d\])$/, dp(3)],
  [/coefficients_eV_per_std\.\w+$/, dp(3)],
  [/(\.mean|\.std|\.min|\.max)$/, dp(2)],
];

/** Derived displays: computed in code from a results.json value, and labelled "derived" on the page. */
export const DERIVED: Record<string, (value: number) => Formatted> = {
  hoursFromSeconds: (s) => ({ n: fixed(s / 3600, 1), u: 'h' }),
  minutesFromSeconds: (s) => ({ n: fixed(s / 60, 1), u: 'min' }),
  gigahertz: (hz) => ({ n: fixed(hz / 1e9, 1), u: 'GHz' }),
  // photon wavelength for a photon energy: lambda = hc / E
  wavelengthFromEv: (eV) => ({ n: fixed(wavelengthNm(eV), 0), u: 'nm' }),
};

export function format(key: string, value: unknown, derived?: keyof typeof DERIVED): Formatted {
  if (derived) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`derived ${derived}: "${key}" is not a number`);
    return DERIVED[derived](value);
  }
  for (const [pattern, rule] of PRECISION) {
    if (pattern.test(key)) {
      if (rule === raw || typeof value === 'number') return rule(value);
      throw new Error(`format: "${key}" is ${typeof value}, expected a number`);
    }
  }
  throw new Error(`format: no precision rule for "${key}" — add one to src/lib/format.ts`);
}

/** Text form: number and unit with a thin space. */
export function formatText(key: string, value: unknown, unit?: string, derived?: keyof typeof DERIVED): string {
  const f = format(key, value, derived);
  const u = f.u ?? unit;
  return u ? `${f.n} ${u}` : f.n;
}
