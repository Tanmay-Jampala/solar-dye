# Site plan: Gate 6, step 1 (waiting for your OK)

No site code has been written. Nothing in `src/`, `results/`, `notebook/` or `cache/` has been touched.

---

## A. What step zero found

- **The state file:** I read `PROJECT_STATE_FOR_COWORK.md` and it agrees with `results.json`.
- **Key tree:** every key the prompt names exists. Their shapes:

  | Key | Shape |
  |---|---|
  | `sq.curve` | `{gap_eV[271], efficiency[271]}`, 0.30 to 3.00 eV in 0.01 eV steps |
  | `quantum_dots.sq_placement.curve` | Same shape, 671 points covering 0.30 to 7.00 eV. The predictor uses this one, because Ridge can predict gaps above 3 eV. |
  | `sq.at_optimum` | `J_sc_mA_cm2, V_oc_V, V_mp_V, J_mp_mA_cm2, P_max_mW_cm2, fill_factor`. The optimum efficiency itself is `sq.optimum_efficiency_percent`. |
  | `quantum.molecules[9]` | `name, smiles, group, rings, HF{gap_eV,…}, B3LYP{gap_eV,…}, reference{…}` |
  | `torsion.scan[19]` | `angle_deg, energy_eV, gap_eV, …` plus `coordinates_A`. Real per-angle geometries are in results.json, so no rotation fake is needed. |
  | `model.metrics.{ridge,random_forest,gradient_boosting}` | `.test/.validation/.train{MAE_eV,RMSE_eV,R2}`, `.hyperparameters` |
  | `model.top_candidates[10]` | `smiles, predicted_gap_eV, qm9_gap_eV, b3lyp_6_31Gs_gap_eV` (B3LYP only for ranks 1 to 3) |
  | `model.screening.funnel[5]` | `{stage, count}` |
  | `model.ridge_for_web` | `coefficients_eV_per_std{11}, intercept_eV, feature_mean{11}, feature_std_ddof0{11}`. There is no explicit order field; the order comes from `descriptors.names`. |
  | `quantum_dots.brus_curve.{CdSe,PbS}` | `radius_nm, gap_eV, wavelength_nm, experimental_gap_eV, rgb`. The `rgb` value is **null** where the wavelength falls outside the visible range; the slider will say "outside visible" there. |
  | `quantum_dots.sq_placement.hopv_experimental.points[209]` | `{gap_eV, sq_efficiency, measured_pce}` |
  | `energy.*`, `checks[49]` (`name, expected, actual, passed`), `environment` | — |

  Two gaps in `environment`:
  - **No hardware in `environment`:** the CPU, core count and TDP live in `energy.assumptions.*`.
  - **RAM:** it appears only inside the string `quantum.hardware`. I will use those keys.
- **Figures:** 16 figures as PNG and SVG (32 files), fig01 to fig17 with no fig08.
- **Geometries:**
  - `cache/quantum/*__B3LYP.xyz` exists for all 9 Part 2 molecules and all 3 screen hits. The rank-1 hit is `candidate_1df8840e`, mapped by sha256 of its SMILES.
  - The 19 torsion frames are in `cache/torsion/angle_*.json`.
  - The orbital `.cube` files exist locally but are git-ignored.
- **No `demo/` folder,** so the panel reads `SEE ◉ CEILING`.
- **Node.js is not installed** on this laptop: no `node`, `npm` or `npx`. See question 1.

## B. Tech stack

- **Framework: Astro (static output) + TypeScript.** Astro renders every page to plain HTML at build time, with numbers already bound. Three things follow from that:
  - The no-WebGL and reduced-motion modes are real pages, not empty shells.
  - The number lint can scan the generated HTML.
  - The first paint never waits for JS.
- **3D:** `three`, with WebGL islands loaded lazily.
- **Motion:** `lenis` and `gsap` with ScrollTrigger, all driven by one shared ticker.
- **Maths:** `katex`, self-hosted.
- **Testing:** `@playwright/test` for screenshots, the page-load test and the number audit; `lighthouse` for scores.
- **Physics:** hand-written spring and repulsion, with no physics library, to stay inside the JS budget.
- **Versions:** all pinned exactly, at releases at least two weeks old.
- **Build-time helpers:** these reuse the existing Python environment through `./py.sh` and live in `site/scripts/`. They only read the repo and only write into `site/`.
  - Turn the xyz geometries and torsion frames into compact JSON, with bonds from covalent radii.
  - RDKit 2D structure SVGs for the stickers (9 molecules + 3 hits).
  - Orbital isosurfaces through `skimage.measure.marching_cubes`, baked once into `site/public/assets/orbitals/`. Fallback: fig05.
  - The notebook exported to static HTML with nbconvert, behind the `● READ THE NOTEBOOK` pill.
- **Data layer:**
  - `site/scripts/sync-data.mjs` copies `results.json` and the figures into `site/public/`.
  - `src/lib/data.ts` provides getters by key path.
  - `format(key, value)` applies the precision table in section E.
  - Numbers render through `<Num k="…"/>`.
  - `scripts/lint-numbers.mjs` fails the build on any stray result-like digits. It allow-lists:
    - CSS values;
    - `25BSCH01`, `AM1.5G`, `6-31G*`, `B3LYP`, `CO₂`, `sp³`;
    - years, and versions taken from JSON.
  - Derived values, such as λ = hc/E and seconds → hours, come from `src/lib/constants.ts`, are labelled "derived", and are calculated only in code.

## C. Section map, with the key behind each number

| Section | Numbers and source keys |
|---|---|
| Preloader morph | `sq.optimum_gap_eV` |
| Hero | No numbers. Molecules come from the 9 Part 2 B3LYP geometries. |
| Intro and light ray | `sq.optimum_gap_eV`, `sq.optimum_efficiency_percent`; target wavelength derived = hc / `sq.optimum_gap_eV` |
| THE CEILING panel | `sq.curve`, `sq.optimum_*`, `sq.secondary_peak.{gap_eV,efficiency,cause}`, `sq.at_optimum.*`; then fig02 |
| Card 0 Data | `data.qm9.rows_clean` |
| Card 1 | `sq.optimum_efficiency_percent` |
| Card 2 | `quantum.findings.b3lyp_error_vs_experiment_eV.thiophene` with a SECONDARY SOURCE tag from `quantum.literature_optical_gaps.thiophene.status` |
| Card 3 | `torsion.barrier_to_planarity_over_kT` |
| Card 4 | `descriptors.qm9.dye_filter_pass_count` |
| Card 5 | `model.metrics.gradient_boosting.test.MAE_eV` |
| Card 6 | `quantum_dots.radius_at_optimum_nm.PbS.{brus_nm,experimental_sizing_curve_nm}` |
| Card 7 | `energy.full_dataset_extrapolation.b3lyp_all_qm9.mean.years` |
| Laptop section | Funnel counts: `model.screening.funnel[*].count`. Hardware: `energy.assumptions.{cpu,cpu_tdp_W,cores_for_peak_flops}.value`, `quantum.hardware` |
| THE SCREEN statement | `funnel[0].count`, `funnel[4].count` |
| Tunnel 1 | `funnel[1..4].count`; point colours from per-molecule gaps (question 2) |
| Honest beat | `model.screening.{target_gap_eV,closest_predicted_gap_eV,closest_distance_from_target_eV,top_candidates_in_training_set}`; `model.top_candidates[0..2]` |
| Quantum dots | `quantum_dots.brus_curve.*`, `radius_at_optimum_nm.CdSe.note`, `radius_at_optimum_nm.PbS.*`, `.brus_over_experimental_radius`; parameter flags `parameters_used.*.status` |
| HOPV shatter | `quantum_dots.sq_placement.hopv_experimental.{count,points,mean_sq_limit,mean_measured_pce,best_measured_pce}` |
| Extrapolation bars | `model.out_of_domain_hopv.metrics.*.MAE_eV`, `predicted_gap_range_eV.ridge[0]` |
| Predictor | `model.ridge_for_web.*`; feature order from `descriptors.names`; labels from `descriptors.labels`; range warnings from `descriptors.summary_statistics.*.{min,max,mean,std}` (QM9); caveat from `model.metrics.ridge.test.MAE_eV`, `model.metrics.gradient_boosting.test.MAE_eV`, `model.out_of_domain_hopv.metrics.ridge.MAE_eV`, `predicted_gap_range_eV.ridge[0]`, `data.qm9.max_heavy_atoms`; SQ at the predicted gap interpolated from `quantum_dots.sq_placement.curve`, labelled "interpolated" |
| Footer | `checks` (passed count / total), `environment.{python,pyscf,rdkit,scikit-learn}`, `data.sources[*].licence` |
| Part pages | Same keys, plus `quantum.molecules[*]`, `quantum.push_pull.*`, `quantum.literature_optical_gaps.*`, `torsion.*`, `descriptors.*` (Lipinski rates, rule counts, `correlations_with_gap`), `model.*`, `quantum_dots.*`, `energy.*` (per_method, project_total, landauer_comparison, assumptions with the tariff flag) |

**Honest negatives:** all six appear both in the home scroll and on their part page:
- QM9 cannot reach 1.34 eV, and every hit is a training molecule: the honest beat and Part 5.
- The models fail out of domain: the extrapolation bars and Part 5.
- My B3LYP prediction was wrong: card 2 and Part 2.
- CdSe cannot reach the target, and Brus is off by 2× for PbS: the quantum-dot beat, card 6 and Part 6.

## D. What results.json lacks

1. **Predictor presets.**
   - There are no stored 11-descriptor values for the Part 2 molecules or for the 3 hits.
   - Six of the nine Part 2 molecules aren't in QM9 at all.
2. **Per-molecule tunnel data.**
   - Per-molecule gaps exist in the committed `data/processed/qm9_clean.csv`.
   - Two things don't exist anywhere committed: per-molecule pass/fail for the dye filter, and the predicted gap. Tunnel 1 needs them to drop out exactly the right points at each stage.
3. **RAM:** only available as text inside `quantum.hardware`. That's fine, and it will be shown as written.

## E. Proposed precision table (taken from the state file)

| Kind | Format | Example |
|---|---|---|
| Counts | Integer with thousands separators | 130,831 |
| DFT/QM9/predicted gaps (tables) | 3 decimals | 6.797, 3.096 |
| Target and optimum gap | 2 decimals | 1.34 eV |
| SQ optimum efficiency | 2 decimals | 33.68 % |
| HOPV mean SQ, mean PCE, best PCE; secondary peak | 1 decimal | 27.6 %, 3.7 %, 10.2 %; 33.49 % |
| J_sc, P_max | 2 decimals | 35.03, 33.69 |
| V_oc, V_mp, FF | 3 decimals | 1.082, 0.987, 0.889 |
| MAE, RMSE, R², Pearson r | 3 decimals | 0.226, 0.942, −0.721 |
| HOPV out-of-domain MAE | 2 decimals | 3.61 / 3.10 / 12.01 |
| Torsion barrier | meV, 1 decimal | 3.9 meV |
| Barrier / kT | 2 decimals | 0.15 |
| Angles | 0 decimals | 160° |
| Radii, diameters, Brus factor | 2 decimals | 3.00 nm, 2.00× |
| Years | 2 decimals | 1.33 (bracket 0.81–2.26) |
| kWh | 3 decimals | 0.198; 525 kWh at 0 decimals |
| ₹ | 2 decimals for the project total; 0 decimals at ≥ ₹1,000 | ₹1.15, ₹3,045 |
| CO₂ | g when < 1 kg (0 decimals), else kg (0 decimals) | 144 g, 382 kg |
| Hours (derived from seconds) | 1 decimal | 4.4 h |
| Landauer | 4 significant figures | 2.871 × 10⁻²¹ J |
| Orders of magnitude | 1 decimal | 10.8 |
| Speedup | 2 significant figures, labelled "re-measured each run" | 1.6 × 10⁷ |

## F. Decisions I need from you

1. **Node.js.** It isn't installed. The options:
   - **(a) Recommended:** install `nodejs` into its own micromamba environment (`solar-dye-site`, from conda-forge). This touches no system settings.
   - **(b)** `winget install OpenJS.NodeJS.LTS`, which installs system-wide.

   Either way, Playwright also needs to download its Chromium (about 150 MB).
2. **Missing data (D1, D2).** Under your rules, `src/` and `results/` are read-only for me. The options:
   - **(a) Recommended:** let me add a small export step to `src/pipeline.py`. It would write a `web` block into results.json: the 11 descriptors and reference gap for the 9 Part 2 molecules + 3 hits. It would also write a committed compact file of the per-QM9 gap, filter pass and predicted gap, for example `results/web_qm9_points.json`. Both would be regenerated by `src.reproduce`, with no hand edits.
   - **(b)** Drop the presets, and colour the tunnel by real per-molecule gaps from `qm9_clean.csv`. Points would fall away at random in the true proportions, labelled "illustrative".
3. **The SMILES box: I recommend leaving it out.** Our descriptors use RDKit's `Lipinski.NumHDonors`/`NumHAcceptors` and `Descriptors.BertzCT`. RDKit.js exposes different H-bond donor and acceptor definitions (`NumHBD`/`NumHBA`) and no Bertz complexity. Parity to 1e-6 would need a hand-port of BertzCT plus SMARTS replicas, on top of a WASM file of about 6 MB. The 11 sliders plus presets stay.
4. **Fonts.** General Sans comes from Fontshare as a zip download (ITF free licence), so I need your OK to fetch it. IBM Plex Mono comes from npm (`@fontsource/ibm-plex-mono`, OFL). Alternatively, you download General Sans yourself and drop the WOFF2 files in `site/public/fonts/`.
5. **Precision.** Check the table in section E. One conflict needs a decision:
   - The state file's prose says the closest prediction is "3.10 eV", while its table shows 3.096.
   - The prose also says the Ridge out-of-domain MAE is "12.0", while the stored value is 12.012.

   I propose:
   - **Headline prose:** 2 decimals (3.10, 12.01).
   - **Tables:** 3 decimals.
