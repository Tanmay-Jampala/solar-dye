# Solar Dye — website

The website for *Designing a Solar Dye on a Laptop*, live at https://tanmay-jampala.github.io/solar-dye/.

It is a static [Astro](https://astro.build) site. three.js draws the WebGL scenes, GSAP and Lenis handle scroll and motion, and KaTeX typesets the Brus equation at build time. It reads `../results/results.json`, `../results/figures/` and `../cache/quantum/` and never writes to them.

## The one rule: every number comes from results.json

- **No typed numbers.** No result is typed into a page. A number is rendered with `<Num k="sq.optimum_gap_eV" />` (or the equivalent `num()` helper in scripts), which reads the key from `results.json` and formats it with `format()` in `src/lib/format.ts`.
- **Precision rules.** `format()` has one precision rule per key; a key without a rule fails the build.
- **Derived values.** A value derived for display (a wavelength from an energy, hours from seconds) uses a named converter and is labelled as derived on the page.
- **Counts written as words** ("nine molecules") come from `<Count>`, which counts the array in `results.json`.
- **The lint.** `scripts/lint-numbers.mjs` fails the build if any digit appears in page text or attributes without being bound to a key.
- **The audit.** `scripts/audit-numbers.mjs` loads every page and re-derives every shown value from `results.json`; the result is [`NUMBER_AUDIT.md`](NUMBER_AUDIT.md).
- **Secondary-source tags.** Values whose `status` in `results.json` marks them as secondary-source get a "Secondary source" tag wherever they appear (`<SecondaryTag>`).

## Setup

- **Node 22.** `node.sh` runs `node`, `npm` and `npx` from a micromamba environment (`$HOME/micromamba/envs/solar-dye-site`, or set `SOLAR_DYE_SITE_ENV`). Any Node 22 on your `PATH` also works.

  ```bash
  micromamba create -n solar-dye-site -c conda-forge nodejs=22
  ```

- **Packages:**

  ```bash
  ./node.sh npm ci
  ```

- **Chromium for the build and the checks** (screenshots, the hero still, tests):

  ```bash
  ./node.sh npx playwright install chromium
  ```

- **Fonts.** General Sans is not in the repository because of its licence. Download it and copy two files into `src/assets/fonts/`, as described in [`src/assets/fonts/README.md`](src/assets/fonts/README.md).

## Commands

All of these run from `site/`, prefixed with `./node.sh`.

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Data sync → Ridge parity test → notebook export → `astro build` → hero stills (`public/hero-poster.jpg`, `public/og.png`) → number lint |
| `npm run preview` | Serves `dist/` at http://localhost:4321/ (the checks take the address as their first argument, e.g. `node scripts/check-pages.mjs http://localhost:4321/`) |
| `npm run verify` | With the preview running: accessibility (axe, both motion settings), every page in normal / reduced-motion / no-WebGL modes, the honest-negative, secondary-source and predictor checks, and the number audit |
| `node scripts/publish-pages.mjs --user Tanmay-Jampala --push` | Builds for `https://tanmay-jampala.github.io/solar-dye/` and pushes the built site to the `gh-pages` branch, which GitHub Pages serves |

## Scripts

| Script | Purpose |
|---|---|
| `sync-data.mjs` | Copies `results.json`, the figures and the web data into `public/`, and turns the B3LYP geometries (`.xyz`) into `public/data/molecules.json` |
| `test-ridge.mjs` | Checks that the browser Ridge reproduces the notebook's prediction for all 12 presets |
| `export-notebook.mjs` | Renders the executed notebook to `/notebook/` |
| `render-stills.mjs` | Renders the WebGL hero into the no-WebGL poster and the social preview image |
| `bake-env.mjs` | Bakes the 3D lighting (three.js RoomEnvironment, pre-filtered) into `public/data/env-room.rgbe.gz`; re-run only after a three.js upgrade |
| `lint-numbers.mjs` | Fails the build on unbound digits |
| `a11y.mjs`, `check-pages.mjs`, `verify-claims.mjs`, `audit-numbers.mjs` | The verification suite behind `npm run verify` |
| `screenshots.mjs`, `screenshots-pages.mjs` | Checkpoint screenshots at 1440×900 and 390×844 |
| `publish-pages.mjs` | GitHub Pages deploy |

## Structure

- `src/pages/`: the home page, the eight part pages (`parts/*`) and `checks`.
- `src/components/home/`: the home-page sections.
- `src/lib/`: data access, `format()`, constants, counts and the Ridge model.
- `src/scripts/`: client code. `app.ts` is the shell: scroll, reveals, menu and loading the WebGL scenes. `webgl/` holds the scenes.

## Fallbacks and performance

- **Without WebGL** the site shows a still of the hero, and every section reads as plain content.
- **With reduced motion** there is no smooth scrolling or scroll-driven animation, and auto-advance is off.
- **On a slow GPU** the heavy post-processing turns itself off.

Results are in [`VERIFICATION.md`](VERIFICATION.md).
