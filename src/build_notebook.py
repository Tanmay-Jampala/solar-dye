"""
Generate notebook/solar_dye.ipynb from the cell list below.

The notebook is the narrative: markdown that explains each part, and code cells
that call into src/ (no analysis logic lives in the notebook itself). Keeping the
notebook as generated code means it can be rebuilt identically at any time:

    ./py.sh -m src.build_notebook
"""

import nbformat
from nbformat.v4 import new_code_cell, new_markdown_cell, new_notebook

from src.constants import REPO_ROOT

CELLS = [
    ("md", """# Designing a Solar Dye on a Laptop
### An in-silico screening pipeline for dye-sensitised solar cells
Computational Chemistry (25BSCH01) · Jain University FET

> **Thermodynamics** sets the band gap a solar absorber *should* have; **quantum chemistry** tells us what gap a
> molecule *actually* has; **machine learning** lets us search thousands of molecules without paying the
> quantum-chemistry bill for each one.

Every number in this notebook is written to `results/results.json`, which is the single source of truth.
All heavy calculations are cached in `cache/`, so re-running the notebook takes seconds."""),
    ("code", """import json
import sys
from pathlib import Path

# The notebook lives in notebook/; make the repository root importable so `src` is found.
REPOSITORY_ROOT = Path.cwd().parent if Path.cwd().name == "notebook" else Path.cwd()
sys.path.insert(0, str(REPOSITORY_ROOT))

from IPython.display import Image, display

from src import pipeline, results_io
from src.constants import FIGURES_DIR

pipeline.set_global_seed()
pipeline.stamp_metadata()

def show(name, width=760):
    \"\"\"Display a saved figure from results/figures.\"\"\"
    display(Image(filename=str(FIGURES_DIR / f"{name}.png"), width=width))"""),

    ("md", """## Part 0 — Data
**QM9** (≈134k small organic molecules, B3LYP HOMO/LUMO) trains the machine-learning model; **HOPV15** (350 real
organic photovoltaic molecules with experimental HOMO/LUMO and efficiency) is the reality check. Every cleaning
rule is logged with the number of rows it removed."""),
    ("code", """cleaned = pipeline.run_data()
for step in results_io.get_value("data.qm9.cleaning_steps"):
    print(f"QM9   {step['rule']:<80} removed {step['removed']:>5}  remaining {step['remaining']}")
for step in results_io.get_value("data.hopv.cleaning_steps"):
    print(f"HOPV  {step['rule']:<80} removed {step['removed']:>5}  remaining {step['remaining']}")
print()
print(results_io.get_value("data.provenance"))"""),

    ("md", """## Part 1 — The thermodynamic ceiling (Unit V)
The **Shockley–Queisser detailed-balance limit**. A cell absorbs every solar photon above its band gap (one
electron each) and, being a body at 300 K, must also *emit* black-body radiation above its gap — that emission
is unavoidable recombination. Maximising power `J·V` gives the best efficiency any single-junction absorber can
reach.

**Prediction:** the optimum lies near **1.34 eV** at about **33.7 %** (Rühle 2016). A gap too small wastes the
excess energy of blue photons as heat; too large, and red photons pass straight through."""),
    ("code", """sq = pipeline.run_shockley_queisser()
print(f"Optimum gap        : {results_io.get_value('sq.optimum_gap_eV'):.2f} eV")
print(f"Maximum efficiency : {results_io.get_value('sq.optimum_efficiency_percent'):.2f} %")
print(f"Second peak        : {results_io.get_value('sq.secondary_peak')['gap_eV']:.2f} eV (water absorption band)")
show("fig01_sq_efficiency")
show("fig02_jv_curve", 640)"""),

    ("md", """## Part 2 — What gap does a molecule actually have? HF vs DFT (Units I, IV)
Nine molecules: a thiophene ladder (1–3 rings), a phenyl ladder (1–2 rings), a donor–acceptor (push–pull) pair and
two dye cores. Each is built from SMILES, given a 3D shape by ETKDG, relaxed with the **MMFF94 force field**
(molecular mechanics), then optimised with **Hartree–Fock** and with **DFT (B3LYP)**, both in the 6-31G* basis.

**Predictions, written before looking at the numbers:**
1. **HF overestimates the gap badly**, by several eV. HF has no electron correlation, and its virtual (empty)
   orbitals, including the LUMO, are too high in energy.
2. **B3LYP is much closer** to experiment. (The brief expected it to *under*estimate the optical gap; we test
   this rather than assume it.)
3. **Longer conjugation → smaller gap**, as for a particle in a longer box: thiophene > bithiophene > terthiophene,
   and benzene > biphenyl.
4. In the push–pull molecule 4-nitroaniline, the **HOMO sits on the amino donor** and the **LUMO on the nitro
   acceptor**: light moves charge across the molecule."""),
    ("code", """molecules = pipeline.run_quantum_molecules()
print(f"{'molecule':<22}{'HF gap':>9}{'B3LYP gap':>11}{'HF-B3LYP':>10}{'expt':>7}{'B3LYP time':>12}")
for m in molecules:
    expt = m['reference'].get('experimental_optical_gap', {}).get('gap_eV')
    expt_text = f"{expt:.2f}" if expt is not None else "  -"
    print(f"{m['name']:<22}{m['HF']['gap_eV']:9.2f}{m['B3LYP']['gap_eV']:11.2f}"
          f"{m['gap_difference_HF_minus_B3LYP_eV']:10.2f}{expt_text:>7}{m['B3LYP']['wall_seconds']:11.0f}s")
show("fig03_gap_vs_conjugation")
show("fig04_mmff_vs_quantum", 900)
show("fig05_orbitals", 900)
print(json.dumps(results_io.get_value("quantum.push_pull")["4-nitroaniline"], indent=1))"""),

    ("md", """## Part 3 — A potential energy surface: torsion controls the gap (Units I, IV)
Bithiophene can twist about the bond joining its rings. We fix the S–C–C–S dihedral at 0°, 10°, … 180°, relax
everything else at B3LYP/6-31G*, and record energy and gap at each angle.

**Prediction:** the **energy minimum is twisted** (steric repulsion between the rings beats the extra
π-conjugation of the flat form), but the **gap is smallest when the molecule is planar**, because that is when
the two rings' π orbitals overlap best. The shape the molecule prefers is not its best optical shape."""),
    ("code", """points, summary = pipeline.run_torsion()
print(f"Energy minimum at         : {summary['minimum_angle_deg']:.0f} deg")
print(f"Cost of flattening        : {summary['barrier_to_planarity_eV'] * 1000:.1f} meV "
      f"(to {summary['best_planar_angle_deg']:.0f} deg)")
print(f"Barrier at                : {summary['rotational_barrier_angle_deg']:.0f} deg, "
      f"{summary['rotational_barrier_eV'] * 1000:.1f} meV")
print(f"Gap range over the scan   : {summary['gap_range_eV'][0]:.2f} - {summary['gap_range_eV'][1]:.2f} eV")
show("fig06_torsion_pes", 680)
show("fig07_torsion_gap", 680)"""),

    ("md", """## Validation
Every check recorded during the run, and a NaN scan of everything written to `results.json`. If any check fails,
the cell below raises an error, so a failure cannot slip by unnoticed."""),
    ("code", """bad_paths = results_io.find_nans(results_io.load_results())
results_io.record_check("no NaN or infinity anywhere in results.json", 0, len(bad_paths), len(bad_paths) == 0)

checks = results_io.load_results()["checks"]
failed = [check for check in checks if not check["passed"]]
for check in checks:
    print(("PASS  " if check["passed"] else "FAIL  ") + check["name"])
print()
print(f"{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    raise AssertionError("FAILED CHECKS: " + "; ".join(check["name"] for check in failed))"""),
]


def build():
    """Write the notebook file from CELLS."""
    notebook = new_notebook()
    notebook.cells = [new_markdown_cell(text) if kind == "md" else new_code_cell(text) for kind, text in CELLS]
    notebook.metadata["kernelspec"] = {"name": "python3", "display_name": "Python 3", "language": "python"}
    path = REPO_ROOT / "notebook" / "solar_dye.ipynb"
    nbformat.write(notebook, path)
    return path


if __name__ == "__main__":
    print(build())
