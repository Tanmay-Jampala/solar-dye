# Verification report — Solar Dye website (Gate 6, milestone 9)

This report checks the site against section 6 of `SOLAR_DYE_WEBSITE_PROMPT.md` ("Definition of done").

- **When:** 2026-11-12, on the build produced by `npm run build`.
- **Environment:** headless Chromium (Playwright 1.64.1) with the laptop's GTX 1650 (D3D11), on Windows 11.
- **Commits and deploys:** none have been made.

Every result below comes from a script in `site/scripts/`. With the preview server running (`npm run preview`), you can re-run all of them with:

```bash
./node.sh npm run build
```

```bash
./node.sh npm run verify
```

`verify` runs `a11y` (with normal and reduced motion), `check-pages`, `verify-claims` and `audit-numbers`. Each exits non-zero on any failure.

## Checklist

| # | Requirement | Result | Evidence |
|---|---|---|---|
| 1 | `npm run build` passes, including the number lint and the data sync | **Pass** | The build runs: sync → Ridge parity (12 presets, worst difference 1.78e-15 eV) → notebook export (`dist/notebook/`) → `astro build` (10 pages) → hero stills → `lint-numbers`: "no unbound numbers in page text". |
| 2 | Every page in headless Chromium: every `[data-key]` resolved, no `undefined`/`NaN`, no console errors | **Pass** | `scripts/check-pages.mjs`: all 60 page views pass (10 pages × 3 modes × 2 sizes). |
| 3 | Number audit: every visible number with the key it came from | **Pass** | [`NUMBER_AUDIT.md`](NUMBER_AUDIT.md), from `scripts/audit-numbers.mjs`: 892 bound values, 0 mismatches, 0 unbound digits or number words. Details below. |
| 4 | Every honest negative in the home scroll and on its part page; locations listed | **Pass** | `scripts/verify-claims.mjs`: all 6 found and visible on both, at both sizes. The table is below. |
| 5 | Every secondary-source flag visible where its value appears | **Pass** | 22 flagged values shown; each has its "Secondary source" tag in the same row, card or paragraph (desktop and mobile). The table is below. |
| 6 | Predictor caveat beside every prediction; out-of-range warning works | **Pass** | All 12 presets, both sizes; the out-of-range warning appears and clears. Details below. |
| 7 | Privacy grep over `site/dist/` | **Pass** | 0 email patterns; 0 `C:\`, `Users\`, `/home/`, `OneDrive` or user-name matches; 0 source maps or `sourceMappingURL`; the PNG, JPEG and `.gz` assets are also clean. |
| 8 | Reduced-motion and no-WebGL modes render all content | **Pass** | `check-pages.mjs`: in both modes every reveal plays, no text is left invisible, and every bound value renders. No-WebGL creates no canvas; reduced motion disables smooth scroll. |
| 9 | Lighthouse (desktop) performance ≥ 80, accessibility ≥ 90 | **Pass** | Scores are below. The lowest home-page performance run was 81. Accessibility is 100 on every page. |
| 10 | Screenshots at 1440×900 and 390×844 of every home section and one part page | **Done** | `site/verification/screenshots/home/` (31 moments × 2 sizes) and `site/verification/screenshots/part-twist/` (full page and both widgets, both sizes). |
| 11 | Nothing in `results/`, `src/`, `notebook/`, `cache/` modified, apart from approved build-only asset generation | **Pass, with the approved export** | See "Repository state" below. |
| 12 | No commits and no deploys | **Pass** | The last commit is still `3ccb262` (Gate 5 reproducibility). Nothing has been published. |

## Lighthouse (desktop preset)

Lighthouse 13.6.0, headless Chromium, real GPU. Each page was run once; the home page was run three times because its score varies.

| Page | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|---|
| `/` (run 1) | 90 | 100 | 100 | 100 | 0.4 s | 0.5 s | 260 ms | 0 |
| `/` (run 2) | 90 | 100 | 100 | 100 | 0.3 s | 0.5 s | 260 ms | 0 |
| `/` (run 3) | 81 | 100 | 100 | 100 | 0.4 s | 0.5 s | 440 ms | 0 |
| `/parts/data/` | 100 | 100 | 100 | 100 | 0.3 s | 0.3 s | 0 ms | 0 |
| `/parts/ceiling/` | 100 | 100 | 100 | 100 | 0.2 s | 0.2 s | 0 ms | 0 |
| `/parts/hf-vs-b3lyp/` | 95 | 100 | 100 | 100 | 0.2 s | 0.2 s | 190 ms | 0 |
| `/parts/twist/` | 99 | 100 | 100 | 100 | 0.3 s | 0.3 s | 90 ms | 0 |
| `/parts/descriptors/` | 100 | 100 | 100 | 100 | 0.2 s | 0.2 s | 0 ms | 0 |
| `/parts/surrogate/` | 100 | 100 | 100 | 100 | 0.2 s | 0.2 s | 0 ms | 0 |
| `/parts/quantum-dots/` | 100 | 100 | 100 | 100 | 0.4 s | 0.4 s | 0 ms | 0 |
| `/parts/cost/` | 100 | 100 | 100 | 100 | 0.2 s | 0.2 s | 0 ms | 0 |
| `/checks/` | 100 | 100 | 100 | 100 | 0.2 s | 0.2 s | 0 ms | 0.002 |

Across this milestone and the last, every home-page run scored between 81 and 90. The variation is total blocking time: the hero's first WebGL frame compiles its shaders on a cold cache, which takes 250–450 ms depending on the run.

## Accessibility

- **axe-core 4.14.0** (WCAG 2.0/2.1 A and AA): 0 violations on all 10 pages, at both sizes, with and without `prefers-reduced-motion`.
- **Headings:** in order on every page, with exactly one `h1`.
- **Keyboard:** a Tab walk on desktop shows a visible focus ring at every stop.
- **Sliders:** they expose `aria-valuetext`. The torsion slider reads the angle, energy and gap together.
- **Tables that scroll sideways on phones:** they become focusable, named regions.

## Number audit (summary of `NUMBER_AUDIT.md`)

| | Count |
|---|---|
| Bound values on all pages (text and numbers) | 892 |
| …containing digits, or a count written as a word (listed page by page) | 793 |
| Exactly equal to the site's own `format()` applied to the `results.json` value (including derived, typeset and count) | 814 |
| Computed at build from a `results.json` value (e.g. counts of rows; marked "computed") | 75 |
| Computed in the browser (the predictor's output; covered by the Ridge parity test) | 3 |
| Mismatches | **0** |
| Digits or number words in page text or attributes that are not bound | **0** |

What changed in this milestone:
- **Counts written as words are now bound** ("eleven descriptors", "nine molecules", "three models", "five rules", "two push–pull dyes"). The new `<Count>` component (`src/components/Count.astro`, `src/lib/words.ts`) generates the word from the length of the array in `results.json`, and the audit recounts it.
- **"For PbS, Brus is off by a factor of two" now shows the bound 2.00.**
- **"Up to ten times larger" (Part 5) is replaced.** It was an approximate ratio of two results. The page now shows the bound maximum heavy-atom count of the HOPV15 set.
- **The remaining number words are names or structure, not results.** Examples: "two-ring", "rule of five", "Tunnel two", "Eight steps". They are listed in the audit, each with its reason.
- **One allow-list entry was added to both number checkers: "3σ".** It is the predictor's own warning threshold (`src/lib/ridge.ts`), not a result.

## Honest negatives (rule 3): where each one is

Each claim is found as the smallest element containing its wording and its bound number(s). Every location listed is visible at 1440×900 and at 390×844.

| Honest negative | Home page (main scroll) | Part page |
|---|---|---|
| QM9 cannot reach 1.34 eV; the closest prediction is 3.10 eV | Dark chapter `#screen`, the "Honest negative" beat: target 1.34 eV, best prediction 3.10 eV, 1.76 eV short, "QM9 cannot reach the target." | `/parts/surrogate/`, section "Honest negative · QM9 cannot reach the target" |
| All 10 top hits are training-set molecules | `#screen`, the same beat: "10 of the top 10 hits were already in the training set." | `/parts/surrogate/`, the same section, as its heading |
| The ML models fail on real dyes (HOPV15) | `#screen`, "Honest negative · out of domain", with the out-of-domain MAE bars | `/parts/surrogate/`, "Honest negative · out of domain": "On real dyes, all three models fail." and the out-of-domain table |
| B3LYP overestimates the optical gap; my prediction was wrong | `#experiments`, the Part 2 card: "My prediction was wrong: B3LYP overshot the optical gap of thiophene by 0.757 eV", with its secondary-source tag | `/parts/hf-vs-b3lyp/`, "Honest negative · my prediction was wrong": "I expected B3LYP to underestimate the optical gap. It overestimates it." |
| CdSe cannot reach the target | `#screen`, the quantum-dot beat: the CdSe card "Cannot reach the target" | `/parts/quantum-dots/`, "Honest negative · two of them": "CdSe cannot reach the target." |
| Brus is off by 2× for PbS | `#screen`, the PbS card: "Brus is off by 2.00×", with its secondary-source tag | `/parts/quantum-dots/`, the same section: "For PbS, Brus is off by a factor of 2.00." |

## Secondary-source flags (rule 4): every place a flagged value appears

Each tag is generated from the `status` field in `results.json`. The checked keys are the flagged values themselves plus the B3LYP and HF errors computed from the Becker gaps.

| Flag | Page | Values shown, all tagged |
|---|---|---|
| Becker 1996 optical gaps | `/` | `#experiments` Part 2 card: the B3LYP error for thiophene (0.757 eV) |
| Becker 1996 optical gaps | `/parts/hf-vs-b3lyp/` | Key-fact strip: B3LYP too high for thiophene by 0.757 eV (the tag was added to the fact strip in this milestone). Honest-negative table: measured gaps (5.37 and 4.09 eV), B3LYP and HF errors for thiophene and bithiophene, and both source citations. |
| QD parameter page numbers | `/parts/quantum-dots/` | Parameter table: bulk gap, both effective masses, permittivity and source, for CdSe and for PbS (10 values) |
| QD parameter page numbers | `/` | `#screen` PbS card: the Brus factor carries the PbS parameters' tag |
| BESCOM tariff | `/parts/cost/` | "Honest caveats · the inputs": the tariff (₹5.80 per kWh) and its source |
| All three | `/checks/` | The "Values from secondary sources" list gives each flag its tag and its full status text |

That is 22 flagged values on desktop and 22 on mobile; every one has its tag.

## Predictor (rule 5)

Tested at both sizes:
- **Every preset:** for each of the 12 (the nine Part 2 molecules and the three screen hits), the caveat "Treat it as a toy" stays visible beside the output. It sits to the right of the output on desktop and directly below it on phones. It carries the Ridge test MAE and the out-of-domain MAE.
- **Out-of-range input:** typing 466.111 into the first descriptor (three times the QM9 maximum, plus 10) marks the field "range". It shows "1 input is outside the range seen in QM9. The model has seen few or no molecules like this, so the prediction is an extrapolation."
- **Back to the preset:** choosing the preset again clears the out-of-range warning and restores that preset's own state.
- **Preset warnings:** 8 of the 12 presets show a "more than 3σ" or "outside the range" warning on their own descriptors. All 8 are Part 2 molecules, most of which are unusual by QM9 standards; 4-aminobenzonitrile is the one Part 2 molecule without a warning. The three screen hits come from QM9 itself and show no warning.
- **Parity:** the browser's Ridge reproduces the notebook's prediction for all 12 presets (`scripts/test-ridge.mjs`, worst difference 1.78e-15 eV).

## Repository state

```
last commit: 3ccb262 Reproducibility: one-command rebuild, committed DFT caches, path cleanup
```

Uncommitted changes outside `site/` (all dated 14:02–14:04, before any site code was written):

| File | What changed | Why |
|---|---|---|
| `src/pipeline.py`, `src/build_notebook.py` | The web-export step (`run_web_export`) | Approved at the plan stage (decision 2: "add a small export step to `src/pipeline.py`… regenerated by `src.reproduce`") |
| `results/results.json` | Adds `web.predictor_presets` and `web.feature_order`, plus re-measured timings from the reproduce run | Written by the pipeline, not by hand |
| `results/web_qm9_points.json` | New: every QM9 row's gap and funnel stage, used for the tunnel | Written by the pipeline |
| `results/figures/fig16_*`, `fig17_*` | Regenerated by the same reproduce run (the ML screen's wall time is re-measured each run) | Written by `src/figures.py` |
| `notebook/solar_dye.ipynb` | Regenerated | Generated, not hand-edited |

- **After the export run:** no file under `results/`, `src/`, `notebook/` or `cache/` has changed. Checked by modification time against the site sources; `cache/` has no diff.
- **Site scripts only write inside `site/`:** `public/`, `dist/`, `NUMBER_AUDIT.md` and temporary folders. They only read `results/` and `cache/`.
- **Also untracked:** `PROJECT_STATE_FOR_COWORK.md` and `SOLAR_DYE_WEBSITE_PROMPT.md`.

## Known limitations

- **Only Chromium was tested.** Firefox and Safari have not been opened. The code uses widely supported APIs, with fallbacks where Safari lacks one (`requestIdleCallback` falls back to a timer). `DecompressionStream`, used by the lighting loader, needs Safari 16.4 or later; without it the 3D lighting fails, and the scene falls back to the static poster and DOM content.
- **Lighthouse ran on this laptop** (GTX 1650). On a slower GPU the hero's first-frame shader compile takes longer, and the home-page score will be lower. There is a frame-time fallback for slow devices, which drops the blur and glow. I tested it under 20× CPU throttling, not on real low-end hardware.
- **`og:image` is a relative URL** (`/og.png`). Most link previews need an absolute URL, so it needs the real site address at deploy time.
- **Text drawn inside WebGL canvases is not in the DOM audit.** The laptop screen's funnel counts go through the same `format()`. The sticker labels are names only.
- **The SMILES box is omitted**, as agreed at the plan stage. It would need RDKit.js matched to the notebook's RDKit, a port of our conjugated-system descriptor and a 50-molecule parity test.
- **`site/verification/screenshots/` is about 20 MB.** Whether it belongs in the repository is your call when committing; it is not part of the deployed site.
- **Baked lighting:** `site/public/data/env-room.rgbe.gz` is three.js's pre-filtered RoomEnvironment, produced by `scripts/bake-env.mjs`. It contains lighting, not results, and needs re-baking only if the three.js version changes.
