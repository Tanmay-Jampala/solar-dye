# Demo video

**Download:** [solar-dye-demo.mp4](https://github.com/Tanmay-Jampala/solar-dye/releases/download/v1.0/solar-dye-demo.mp4), from the [v1.0 release](https://github.com/Tanmay-Jampala/solar-dye/releases/tag/v1.0). The video is attached to the release rather than committed, because it is too large to keep in the repository.

**File:** `solar-dye-demo.mp4`
- **Length:** 3 min 13 s.
- **Picture:** 1920×1080, 30 fps.
- **Encoding:** H.264 (BT.709), about 63 MB.
- **Audio:** none, so a voice-over can be added (see below).
- **Playback:** plays in PowerPoint, VLC, Windows Media Player and any browser.

It is a real-time recording of the live website (the GitHub Pages build), made in Chromium with the laptop's GPU, so the 3D scenes run at their real speed.
- **Overlay:** a visible cursor and on-screen captions are drawn on top of the page.
- **Numbers:** every number in the captions is read from `results/results.json` and formatted by the website's own `format()`, so the video shows exactly what the site shows.

## What happens when

Times are approximate (±3 s); each caption changes as its scroll lands.

| Time | Scene | Caption |
|---|---|---|
| 0:00 | Preloader, then the hero: the nine Part 2 molecules from their B3LYP geometries; the cursor pushes the pile and a click shows a molecule's name | Title · "The nine Part 2 molecules…" |
| 0:23 | "Sunlight Has a Sweet Spot" with the light ray | The target: a band gap of 1.34 eV |
| 0:29 | The ceiling panel opens; the cursor is dragged along the Shockley–Queisser curve | At most 33.68 % of sunlight becomes electricity, at 1.34 eV |
| 0:45 | The experiments grid | Eight experiments, one page each |
| 0:51 | The laptop, its screen counting down the funnel | Everything ran on one laptop |
| 0:57 | The dark chapter: tunnel of QM9 molecules and the funnel | Screening QM9: 130,831 → 13,087 → 81 → 10 → 3 |
| 1:08 | Honest beat: the target ring and the gap bar | QM9 cannot reach the target; closest prediction 3.10 eV |
| 1:16 | Quantum dots | CdSe cannot reach the target; PbS can, but Brus is off by a factor of 2.00 |
| 1:24 | 209 real dyes shatter onto the efficiency curve | 209 real dyes, measured in real labs |
| 1:32 | Out of domain | The models fail on real dyes (Ridge 12.01 eV, gradient boosting 3.61 eV) |
| 1:38 | The predictor: presets terthiophene and azobenzene, then an out-of-range value typed in | The Ridge model, the weakest of the three · out-of-range warning |
| 1:59 | Where the light ray ends | 925 nm, λ = hc/E for 1.34 eV (derived) |
| 2:06 | Part 2: clicking molecules, rotating the 3D viewer | Hartree–Fock vs B3LYP |
| 2:24 | Part 3: dragging the dihedral slider | The twist: minimum at 160°, 3.9 meV (0.15 kT) to flatten |
| 2:43 | Part 6: dragging the quantum-dot radius | Gap, wavelength and emission colour from the Brus curves |
| 3:01 | The checks page | 51/51 self-checks passed |
| 3:09 | End card | Website and repository addresses |

## Suggested voice-over

About 400 words. That is a comfortable pace for 3 minutes; each paragraph matches a scene above.

> **(0:00)** This is *Designing a Solar Dye on a Laptop*. The molecules on screen are the nine molecules from Part 2, at their real geometries optimised with B3LYP. You can push them around and click one to see its name.
>
> **(0:23)** The question starts with thermodynamics. A single-junction solar cell under real sunlight works best at a band gap of 1.34 eV.
>
> **(0:29)** This is the Shockley–Queisser limit, computed from the AM1.5G spectrum. At 1.34 eV, at most 33.68 % of the light can become electricity. Every value under the cursor is read from the stored curve.
>
> **(0:45)** The project has eight parts, from the data to the cost of the computation, and each has its own page.
>
> **(0:51)** Everything ran on one laptop.
>
> **(0:57)** I screened all 130,831 molecules in QM9. The dye-likeness filter keeps 13,087. The model predicts 81 below 4 eV. I took the ten closest to the target and checked the top three with B3LYP.
>
> **(1:08)** The honest result: QM9 cannot reach the target. The closest prediction is 3.10 eV, still 1.76 eV short. All ten of the top ten hits were already in the training set.
>
> **(1:16)** Quantum dots are the inorganic alternative. CdSe can never reach 1.34 eV, because its bulk gap is already higher. PbS can, but the Brus model puts the size off by a factor of two compared with experiment.
>
> **(1:24)** Real dyes, measured in real labs, sit far below the thermodynamic ceiling.
>
> **(1:32)** And the models trained on QM9 fail on real dyes. Ridge is off by 12 eV on average. That is the cost of extrapolating outside the training data.
>
> **(1:38)** You can try the Ridge model yourself in the browser. It is the weakest of the three, and the page says so beside every prediction. Enter something QM9 has never seen, and it warns you.
>
> **(1:59)** The light ray that runs through the page ends at 925 nm, the wavelength of the 1.34 eV target.
>
> **(2:06)** Each part has its own page. Here are the nine molecules from Part 2: click one to see its optimised geometry.
>
> **(2:24)** Part 3 is the twist. Every frame is a relaxed B3LYP geometry of bithiophene. Flattening it costs only 0.15 kT, while twisting it to 90° breaks the conjugation and opens the gap.
>
> **(2:43)** Part 6 lets you grow a quantum dot and watch its gap and colour change.
>
> **(3:01)** And every number on the site comes from one results file, guarded by 51 self-checks, all passing.
>
> **(3:09)** The site and the code are public.

Two numbers are said in words here: "a factor of two" for 2.00, and "12 eV" for 12.01 eV. If you would rather say the exact values, read 2.00 and 12.01 as on screen.

## Adding the voice-over

- **In PowerPoint:** insert the video, then record narration over the slide (*Slide Show → Record*). Or insert an audio file and set it to play with the video.
- **As one file:** record the voice-over (e.g. `voice.m4a`), then run this from this folder. The video is copied, not re-encoded:

  ```bash
  ffmpeg -i solar-dye-demo.mp4 -i voice.m4a -map 0:v -map 1:a -c:v copy -c:a aac -b:a 160k -shortest solar-dye-demo-voice.mp4
  ```

## Re-recording

The video is produced by `site/scripts/record-demo.mjs` (the scene list, timings and captions are all in that file).

The simplest way is to record the live site. From `site/`:

```bash
./node.sh node scripts/record-demo.mjs --base https://tanmay-jampala.github.io/solar-dye/
```

This video was recorded from a local server serving the same build (`--base http://127.0.0.1:4321/solar-dye/`, the default), which avoids network hiccups.

The script needs ffmpeg with libx264. The conda-forge `ffmpeg` package in the `solar-dye-site` environment is used automatically.
