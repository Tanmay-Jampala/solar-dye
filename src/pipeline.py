"""
The pipeline, one function per notebook section.

Each `run_*` function does the computation for one part (by calling the
specialised modules), writes its block of results.json, records its checks,
and draws its figures. The notebook simply calls these in order, so every
number the notebook shows comes from the same code that wrote results.json.
"""

import subprocess
from datetime import datetime, timezone

import numpy as np

from src import results_io
from src.constants import RANDOM_SEED, REPO_ROOT


def set_global_seed():
    """Seed numpy's legacy global RNG. scikit-learn and RDKit receive RANDOM_SEED explicitly where used."""
    np.random.seed(RANDOM_SEED)


def git_commit_hash():
    """Return the current git commit hash, or 'uncommitted' if the repo has no commits yet."""
    try:
        completed = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO_ROOT,
                                   capture_output=True, text=True, check=True)
        return completed.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "uncommitted"


def stamp_metadata():
    """Write generated_at, git commit and environment versions into results.json."""
    results_io.set_value("generated_at", datetime.now(timezone.utc).isoformat(timespec="seconds"))
    results_io.set_value("git_commit", git_commit_hash())
    results_io.set_value("environment", results_io.environment_versions())
    results_io.set_value("random_seed", RANDOM_SEED)


# ---------------------------------------------------------------------------
# Part 0 -- data
# ---------------------------------------------------------------------------

def run_data(download_date="2026-11-11"):
    """Download (or verify) the raw data, clean it, and record provenance and row counts."""
    from rdkit import Chem

    from src.clean_data import run_cleaning
    from src.download_data import download_all

    download_records = download_all()
    cleaned = run_cleaning(download_date)
    qm9 = cleaned["qm9"]
    hopv = cleaned["hopv"]

    results_io.set_value("data", {
        "provenance": cleaned["provenance"],
        "downloaded_on": download_date,
        "sources": download_records,
        "qm9": {
            "rows_raw": cleaned["qm9_log"][0]["remaining"],
            "rows_clean": len(qm9),
            "cleaning_steps": cleaned["qm9_log"],
            "gap_eV_mean": float(qm9["gap_eV"].mean()),
            "gap_eV_std": float(qm9["gap_eV"].std(ddof=0)),
            "gap_eV_min": float(qm9["gap_eV"].min()),
            "gap_eV_max": float(qm9["gap_eV"].max()),
            "max_heavy_atoms": int(qm9["n_heavy_atoms"].max()),
        },
        "hopv": {
            "rows_raw": cleaned["hopv_log"][0]["remaining"],
            "rows_clean": len(hopv),
            "cleaning_steps": cleaned["hopv_log"],
            "rows_with_experimental_gap": int(hopv["gap_eV"].notna().sum()),
            "rows_with_pce": int(hopv["pce_percent"].notna().sum()),
            "b3lyp_gap_eV_mean": float(hopv["b3lyp_gap_eV"].mean()),
        },
    })

    # Re-parse every cleaned SMILES: the check is on the written file, not on our intentions.
    resanitised = sum(Chem.MolFromSmiles(smiles) is not None for smiles in qm9["smiles"])
    results_io.record_check("all cleaned QM9 rows sanitise in RDKit", len(qm9), resanitised,
                            resanitised == len(qm9))
    results_io.record_check("cleaned QM9 row count is roughly 130k (120k-134k)", "120000-133885",
                            len(qm9), 120_000 <= len(qm9) <= 133_885)
    results_io.record_check("HOPV15 parsed molecule count equals 350", 350,
                            cleaned["hopv_log"][0]["remaining"], cleaned["hopv_log"][0]["remaining"] == 350)
    results_io.record_check("QM9 molecules have at most 9 heavy atoms", "<= 9",
                            int(qm9["n_heavy_atoms"].max()), int(qm9["n_heavy_atoms"].max()) <= 9)
    return cleaned


# ---------------------------------------------------------------------------
# Part 1 -- Shockley-Queisser ceiling
# ---------------------------------------------------------------------------

# Literature reference values for the detailed-balance limit under AM1.5G, 300 K
# (Ruhle, Solar Energy 130, 139-147, 2016: 1.34 eV, 33.7 %).
SQ_REFERENCE_GAP_EV = 1.34
SQ_REFERENCE_EFFICIENCY_PERCENT = 33.7


def run_shockley_queisser():
    """Compute the SQ curve, write results.sq, run the two mandatory checks, draw fig01 and fig02."""
    from src import figures
    from src.spectra import jv_curve, shockley_queisser_curve

    sq = shockley_queisser_curve(gap_min=0.3, gap_max=3.0, step=0.01)
    jv = jv_curve(sq["grid_optimum_gap_eV"], sq["flux_lookup"])
    point = jv["operating_point"]

    results_io.set_value("sq", {
        "method": "Detailed balance (Shockley-Queisser 1961): one e-h pair per photon above Eg, "
                  "radiative recombination only, cell at 300 K, ASTM G173-03 AM1.5G.",
        "cell_temperature_K": 300.0,
        "incident_power_W_m2": sq["incident_power_W_m2"],
        "gap_grid_step_eV": 0.01,
        "optimum_gap_eV": sq["grid_optimum_gap_eV"],
        "optimum_efficiency": sq["grid_optimum_efficiency"],
        "optimum_efficiency_percent": sq["grid_optimum_efficiency"] * 100.0,
        "refined_optimum_gap_eV": sq["optimum_gap_eV"],
        "refined_optimum_efficiency": sq["optimum_efficiency"],
        "at_optimum": {
            "J_sc_mA_cm2": point["J_sc"] * 0.1,
            "V_oc_V": point["V_oc"],
            "V_mp_V": point["V_mp"],
            "J_mp_mA_cm2": point["J_mp"] * 0.1,
            "P_max_mW_cm2": point["P_max"] * 0.1,
            "fill_factor": point["P_max"] / (point["V_oc"] * point["J_sc"]),
        },
        "curve": {"gap_eV": sq["gaps_eV"], "efficiency": sq["efficiencies"]},
        "efficiency_at": {},   # filled in by later parts as molecules and dots are studied
        "reference": "Ruhle, Solar Energy 130 (2016) 139: 1.34 eV, 33.7 %",
    })

    gap_error = abs(sq["grid_optimum_gap_eV"] - SQ_REFERENCE_GAP_EV)
    efficiency_error = abs(sq["grid_optimum_efficiency"] * 100.0 - SQ_REFERENCE_EFFICIENCY_PERCENT)
    results_io.record_check("SQ optimum gap within 0.05 eV of 1.34 eV", SQ_REFERENCE_GAP_EV,
                            round(sq["grid_optimum_gap_eV"], 3), gap_error <= 0.05)
    results_io.record_check("SQ optimum efficiency within 1 point of 33.7 %", SQ_REFERENCE_EFFICIENCY_PERCENT,
                            round(sq["grid_optimum_efficiency"] * 100.0, 2), efficiency_error <= 1.0)
    results_io.record_check("integrated AM1.5G irradiance within 1 % of 1000 W/m^2", 1000.0,
                            round(sq["incident_power_W_m2"], 2), abs(sq["incident_power_W_m2"] - 1000.0) <= 10.0)
    # The AM1.5G curve is NOT smooth: atmospheric absorption bands (H2O near 1.13 um, O2 A-band at
    # 760 nm) leave local maxima. A first version of this check assumed a smooth monotonic fall above
    # the optimum and failed at 1.62->1.63 eV (765 nm, the O2 A-band) -- real physics, not a bug.
    # The checks below encode the known structure instead.
    gaps = sq["gaps_eV"]
    efficiencies = sq["efficiencies"]
    local_maxima_gaps = [float(gaps[i]) for i in range(1, len(gaps) - 1)
                         if efficiencies[i] > efficiencies[i - 1] and efficiencies[i] > efficiencies[i + 1]]
    secondary_peak_gap = min(local_maxima_gaps, key=lambda gap: abs(gap - 1.15))
    secondary_peak_efficiency = float(efficiencies[np.argmin(np.abs(gaps - secondary_peak_gap))])
    results_io.set_value("sq.local_maxima_gaps_eV", local_maxima_gaps)
    results_io.set_value("sq.secondary_peak", {"gap_eV": secondary_peak_gap, "efficiency": secondary_peak_efficiency,
                                               "cause": "H2O absorption band near 1.13 um in AM1.5G"})
    results_io.record_check("AM1.5G SQ curve shows the known secondary peak near 1.15 eV (H2O band)", "1.10-1.20 eV",
                            secondary_peak_gap, 1.10 <= secondary_peak_gap <= 1.20)
    results_io.record_check("global SQ maximum beats the 1.15 eV secondary peak", "> secondary",
                            round(sq["grid_optimum_efficiency"] - secondary_peak_efficiency, 5),
                            sq["grid_optimum_efficiency"] > secondary_peak_efficiency)
    results_io.record_check("J_sc at optimum within 1 mA/cm^2 of 35.0 (Ruhle 2016)", 35.0,
                            round(point["J_sc"] * 0.1, 2), abs(point["J_sc"] * 0.1 - 35.0) <= 1.0)
    old_checks = results_io.load_results()
    old_checks["checks"] = [c for c in old_checks.get("checks", [])
                            if c["name"] != "SQ efficiency falls monotonically above the optimum gap"]
    results_io.save_results(old_checks)

    figures.fig01_sq_efficiency(sq)
    figures.fig02_jv_curve(jv)
    return sq


# ---------------------------------------------------------------------------
# Part 2 -- HF vs DFT on the molecule set
# ---------------------------------------------------------------------------

# Experimental optical gaps (lowest strong UV-vis absorption, room-temperature solution).
# Primary source: Becker, Seixas de Melo, Macanita & Elisei, J. Phys. Chem. 100, 18683 (1996).
# These two values were read from the table that arXiv:2609.29284 (Table S6) reproduces from
# that paper. They are marked "secondary" until checked against Becker et al. directly.
# No sourced value was found for terthiophene, so none is used: we do not fill gaps from memory.
LITERATURE_OPTICAL_GAPS = {
    "thiophene": {"gap_eV": 5.37, "solvent": "acetonitrile",
                  "source": "Becker et al., J. Phys. Chem. 100, 18683 (1996), via arXiv:2609.29284 Table S6",
                  "status": "secondary source - confirm against Becker et al. 1996 before quoting"},
    "bithiophene": {"gap_eV": 4.09, "solvent": "1,4-dioxane",
                    "source": "Becker et al., J. Phys. Chem. 100, 18683 (1996), via arXiv:2609.29284 Table S6",
                    "status": "secondary source - confirm against Becker et al. 1996 before quoting"},
}

# Donor and acceptor atoms for the push-pull charge-transfer measurement (SMARTS, first atom used).
PUSH_PULL_ATOMS = {
    "4-nitroaniline": {"donor": "[NX3;H2]", "acceptor": "[N+](=O)[O-]"},
    "4-aminobenzonitrile": {"donor": "[NX3;H2]", "acceptor": "N#C"},
}


def dataset_reference_gaps(names):
    """QM9 / HOPV15 gaps for any study molecule present in those datasets (canonical-SMILES match)."""
    import pandas as pd
    from rdkit import Chem

    from src.constants import PROCESSED_DIR
    from src.quantum import MOLECULES

    def canonical(smiles):
        return Chem.MolToSmiles(Chem.MolFromSmiles(smiles))

    qm9 = pd.read_csv(PROCESSED_DIR / "qm9_clean.csv")
    hopv = pd.read_csv(PROCESSED_DIR / "hopv_clean.csv")
    wanted = {canonical(MOLECULES[name]["smiles"]): name for name in names}
    found = {name: {} for name in names}
    for smiles, gap in zip(qm9["smiles"], qm9["gap_eV"]):
        molecule = Chem.MolFromSmiles(smiles)
        key = Chem.MolToSmiles(molecule) if molecule is not None else None
        if key in wanted:
            found[wanted[key]]["qm9_b3lyp_6-31G(2df,p)_gap_eV"] = float(gap)
    for _, row in hopv.iterrows():
        key = canonical(row["smiles"])
        if key in wanted:
            found[wanted[key]]["hopv_experimental_gap_eV"] = float(row["gap_eV"])
            found[wanted[key]]["hopv_b3lyp_def2-SVP_gap_eV"] = float(row["b3lyp_gap_eV"])
    return found


def push_pull_analysis(name):
    """
    For a donor-acceptor molecule: where along the donor -> acceptor axis do the HOMO
    and LUMO densities sit? Returns fractions (0 = donor atom, 1 = acceptor atom),
    the centroid shift in Angstrom, plus the grids for fig05.
    """
    from rdkit import Chem

    from src import quantum

    spec = quantum.MOLECULES[name]
    molecule = Chem.AddHs(Chem.MolFromSmiles(spec["smiles"]))  # same atom order as the calculation
    donor = molecule.GetSubstructMatch(Chem.MolFromSmarts(PUSH_PULL_ATOMS[name]["donor"]))[0]
    acceptor = molecule.GetSubstructMatch(Chem.MolFromSmarts(PUSH_PULL_ATOMS[name]["acceptor"]))[0]

    grids = quantum.orbital_grids(name, "B3LYP")
    coordinates = np.asarray(grids["coordinates_A"])
    fractions, centroids = {}, {}
    for label in ("HOMO", "LUMO"):
        fraction, centroid = quantum.density_centroid_along_axis(grids["orbitals"][label], coordinates[donor],
                                                                 coordinates[acceptor])
        fractions[label] = fraction
        centroids[label] = centroid
    axis_length = float(np.linalg.norm(coordinates[acceptor] - coordinates[donor]))
    return {
        "donor_atom_index": int(donor),
        "acceptor_atom_index": int(acceptor),
        "donor_acceptor_distance_A": axis_length,
        "homo_centroid_fraction": fractions["HOMO"],
        "lumo_centroid_fraction": fractions["LUMO"],
        "charge_transfer_shift_A": (fractions["LUMO"] - fractions["HOMO"]) * axis_length,
        "cube_files": [grids["orbitals"]["HOMO"]["cube_file"], grids["orbitals"]["LUMO"]["cube_file"]],
        "_grids": grids,
        "_fractions": fractions,
    }


def run_quantum_molecules():
    """Collect Part 2 results (from cache), write quantum.* to results.json, run checks, draw fig03-05."""
    from src import figures, quantum
    from src.spectra import cumulative_photon_flux_above, load_am15g, sq_efficiency, total_irradiance

    names = list(quantum.MOLECULES)
    calculations = {(name, method): quantum.run_molecule(name, method, verbose=False)
                    for name in names for method in ("HF", "B3LYP")}
    references = dataset_reference_gaps(names)

    spectrum = load_am15g()
    flux_lookup = cumulative_photon_flux_above(spectrum)
    incident_power = total_irradiance(spectrum)

    molecule_records = []
    for name in names:
        hf, dft = calculations[(name, "HF")], calculations[(name, "B3LYP")]
        reference = dict(references[name])
        if name in LITERATURE_OPTICAL_GAPS:
            reference["experimental_optical_gap"] = LITERATURE_OPTICAL_GAPS[name]
        per_method = {}
        for method, result in (("HF", hf), ("B3LYP", dft)):
            per_method[method] = {
                key: result[key] for key in (
                    "total_energy_eV", "homo_eV", "lumo_eV", "gap_eV", "key_bond_A", "key_dihedrals_deg",
                    "optimisation_steps", "optimisation_seconds", "single_point_seconds", "wall_seconds",
                    "n_basis_functions")
            }
            per_method[method]["sq_efficiency_at_gap"] = sq_efficiency(result["gap_eV"], flux_lookup, incident_power)
            if name in LITERATURE_OPTICAL_GAPS:
                per_method[method]["error_vs_experiment_eV"] = result["gap_eV"] - LITERATURE_OPTICAL_GAPS[name]["gap_eV"]
        molecule_records.append({
            "name": name,
            "smiles": dft["smiles"],
            "group": dft["group"],
            "rings": dft["rings"],
            "n_atoms": dft["n_atoms"],
            "n_heavy_atoms": dft["n_heavy_atoms"],
            "key_bond_name": dft["key_bond_name"],
            "key_dihedral_name": dft["key_dihedral_name"],
            "mmff94": {
                "energy_before_eV": dft["mmff94_energy_before_eV"],
                "energy_after_eV": dft["mmff94_energy_after_eV"],
                "energy_drop_eV": dft["mmff94_energy_drop_eV"],
                "converged": dft["mmff94_converged"],
                "key_bond_A": dft["key_bond_mmff94_A"],
                "key_dihedrals_deg": dft["key_dihedrals_mmff94_deg"],
            },
            "HF": per_method["HF"],
            "B3LYP": per_method["B3LYP"],
            "gap_difference_HF_minus_B3LYP_eV": hf["gap_eV"] - dft["gap_eV"],
            "reference": reference,
        })

    push_pull = {name: push_pull_analysis(name) for name in PUSH_PULL_ATOMS}
    results_io.set_value("quantum", {
        "basis": "6-31G*",
        "methods": ["HF", "B3LYP"],
        "protocol": "RDKit ETKDG (seed 42) -> MMFF94 -> PySCF/geomeTRIC optimisation -> single point; "
                    "inter-ring dihedrals left exactly planar by MMFF94 are rotated to 160 deg first so the "
                    "optimiser is not held on a symmetry-imposed saddle point.",
        "hardware": "Intel Core i5-10500H (6 cores), 16 GB RAM, 6 OpenMP threads",
        "molecules": molecule_records,
        "push_pull": {name: {key: value for key, value in data.items() if not key.startswith("_")}
                      for name, data in push_pull.items()},
        "literature_optical_gaps": LITERATURE_OPTICAL_GAPS,
    })
    for record in molecule_records:
        results_io.set_value(f"sq.efficiency_at.{record['name']} (B3LYP)",
                             {"gap_eV": record["B3LYP"]["gap_eV"], "sq_efficiency": record["B3LYP"]["sq_efficiency_at_gap"]})

    # ---- checks ----
    hf_above = [r["name"] for r in molecule_records if r["HF"]["gap_eV"] > r["B3LYP"]["gap_eV"]]
    results_io.record_check("HF gap > B3LYP gap for every molecule", len(molecule_records), len(hf_above),
                            len(hf_above) == len(molecule_records))
    ladder = ["thiophene", "bithiophene", "terthiophene"]
    for method in ("HF", "B3LYP"):
        gaps = [calculations[(name, method)]["gap_eV"] for name in ladder]
        results_io.record_check(f"{method} gap decreases monotonically along the thiophene ladder",
                                "decreasing", [round(g, 3) for g in gaps], all(np.diff(gaps) < 0))
        phenyl = [calculations[(name, method)]["gap_eV"] for name in ("benzene", "biphenyl")]
        results_io.record_check(f"{method} gap: biphenyl < benzene", "biphenyl smaller",
                                [round(g, 3) for g in phenyl], phenyl[1] < phenyl[0])
    with_experiment = [r for r in molecule_records if "experimental_optical_gap" in r["reference"]]
    closer = [r["name"] for r in with_experiment
              if abs(r["B3LYP"]["error_vs_experiment_eV"]) < abs(r["HF"]["error_vs_experiment_eV"])]
    results_io.record_check("B3LYP is closer to the experimental optical gap than HF", len(with_experiment),
                            len(closer), len(closer) == len(with_experiment))
    hf_over = [r["name"] for r in with_experiment if r["HF"]["error_vs_experiment_eV"] > 1.0]
    results_io.record_check("HF overestimates the experimental optical gap by more than 1 eV", len(with_experiment),
                            len(hf_over), len(hf_over) == len(with_experiment))
    for record in molecule_records:
        qm9_gap = record["reference"].get("qm9_b3lyp_6-31G(2df,p)_gap_eV")
        if qm9_gap is not None:
            difference = record["B3LYP"]["gap_eV"] - qm9_gap
            results_io.record_check(f"{record['name']}: B3LYP/6-31G* gap within 0.3 eV of QM9 B3LYP/6-31G(2df,p)",
                                    round(qm9_gap, 3), round(record["B3LYP"]["gap_eV"], 3), abs(difference) <= 0.3)
    lowered = [r["name"] for r in molecule_records if r["mmff94"]["energy_drop_eV"] > 0]
    results_io.record_check("MMFF94 optimisation lowered the force-field energy of every molecule",
                            len(molecule_records), len(lowered), len(lowered) == len(molecule_records))
    # The brief predicted B3LYP would UNDERestimate the optical gap. Record what actually happened,
    # as a finding (not a pass/fail check): the sign of the B3LYP error for each molecule with data.
    b3lyp_errors = {r["name"]: r["B3LYP"]["error_vs_experiment_eV"] for r in with_experiment}
    hf_errors = {r["name"]: r["HF"]["error_vs_experiment_eV"] for r in with_experiment}
    results_io.set_value("quantum.findings", {
        "b3lyp_error_vs_experiment_eV": b3lyp_errors,
        "hf_error_vs_experiment_eV": hf_errors,
        "b3lyp_overestimates_for_all_with_data": all(error > 0 for error in b3lyp_errors.values()),
        "b3lyp_error_shrinks_with_conjugation": b3lyp_errors.get("bithiophene", 0) < b3lyp_errors.get("thiophene", 0),
        "note": "Predicted: B3LYP underestimates the optical gap. Observed: for these short oligomers the B3LYP "
                "HOMO-LUMO gap is ABOVE the experimental optical gap, and the excess shrinks as the chain grows. "
                "The HOMO-LUMO gap is not the optical gap: it ignores the electron-hole attraction (exciton binding) "
                "and B3LYP's self-interaction error, which pull in opposite directions; their balance depends on size.",
    })

    nitro = push_pull["4-nitroaniline"]
    results_io.record_check("4-nitroaniline: LUMO density sits nearer the acceptor than the HOMO density",
                            "LUMO fraction > HOMO fraction",
                            [round(nitro["homo_centroid_fraction"], 3), round(nitro["lumo_centroid_fraction"], 3)],
                            nitro["lumo_centroid_fraction"] > nitro["homo_centroid_fraction"])

    # ---- figures ----
    reference_for_plot = {name: data["gap_eV"] for name, data in LITERATURE_OPTICAL_GAPS.items()}
    figures.fig03_gap_vs_conjugation(calculations, {"thiophene": ladder, "phenyl": ["benzene", "biphenyl"]},
                                     reference_for_plot)
    # Atom numbering follows the SMILES Nc1ccc(cc1)[N+](=O)[O-]: N1 amine, C2 ipso, ..., C5 para, N8 nitro.
    nitroaniline_bond_names = {"N8-O9": "N–O (nitro)", "N1-C2": "C–NH₂ (donor)",
                               "C3-C4": "ring C3–C4", "C4-C5": "ring C4–C5",
                               "C2-C3": "ring C2–C3", "C5-N8": "C–NO₂ (acceptor)"}
    figures.fig04_mmff_vs_quantum(calculations, names, "4-nitroaniline", nitroaniline_bond_names)
    figures.fig05_orbitals(nitro["_grids"],
                           {"HOMO": calculations[("4-nitroaniline", "B3LYP")]["homo_eV"],
                            "LUMO": calculations[("4-nitroaniline", "B3LYP")]["lumo_eV"]},
                           donor_index=nitro["donor_atom_index"], acceptor_index=nitro["acceptor_atom_index"],
                           centroid_fractions=nitro["_fractions"],
                           atom_labels={nitro["donor_atom_index"]: "NH₂ donor",
                                        nitro["acceptor_atom_index"]: "NO₂ acceptor"})
    return molecule_records


# ---------------------------------------------------------------------------
# Part 3 -- torsion PES
# ---------------------------------------------------------------------------

def run_torsion():
    """Collect the bithiophene scan (from cache), write torsion.* to results.json, run checks, draw fig06-07."""
    from src import figures, quantum, torsion

    points = torsion.run_scan(verbose=False)
    summary = torsion.summarise_scan(points)
    scan_rows = [{
        "angle_deg": point["angle_deg"],
        "energy_eV": point["energy_eV"],
        "gap_eV": point["gap_eV"],
        "homo_eV": point["homo_eV"],
        "lumo_eV": point["lumo_eV"],
        "total_energy_eV": point["total_energy_eV"],
        "achieved_angle_deg": point["achieved_angle_deg"],
        "inter_ring_bond_A": point["inter_ring_bond_A"],
        "wall_seconds": point["wall_seconds"],
        "coordinates_A": point["coordinates_A"],
    } for point in points]

    results_io.set_value("torsion", {
        "molecule": torsion.SCAN_MOLECULE,
        "method": f"{torsion.SCAN_METHOD}/6-31G*, relaxed scan (all other coordinates optimised)",
        "dihedral": "S-C-C-S",
        "symbols": points[0]["symbols"],
        "scan": scan_rows,
        **summary,
        "total_wall_seconds": float(sum(point["wall_seconds"] for point in points)),
    })

    angles = [point["angle_deg"] for point in points]
    results_io.record_check("torsion PES minimum is not at exactly 0 or 180 deg", "not 0/180",
                            summary["minimum_angle_deg"], summary["minimum_angle_deg"] not in (0.0, 180.0))
    results_io.record_check("gap at planarity is the minimum of the gap scan", "0 or 180 deg",
                            summary["gap_minimum_angle_deg"], summary["gap_minimum_angle_deg"] in (0.0, 180.0))
    results_io.record_check("gap is largest near perpendicular (60-120 deg)", "60-120 deg",
                            summary["gap_maximum_angle_deg"], 60.0 <= summary["gap_maximum_angle_deg"] <= 120.0)
    worst_constraint_error = max(abs(((p["achieved_angle_deg"] - p["angle_deg"] + 180) % 360) - 180)
                                 for p in points if p["angle_deg"] not in (0.0, 180.0))
    results_io.record_check("every constrained dihedral reached its target within 1 deg", "<= 1 deg",
                            round(worst_constraint_error, 3), worst_constraint_error <= 1.0)
    results_io.record_check("torsion scan covers 0-180 deg in 10 deg steps", 19, len(angles), len(angles) == 19)

    # Conjugation shows up in the bond itself: less pi overlap -> less double-bond character -> longer bond.
    bond_lengths = [point["inter_ring_bond_A"] for point in points]
    longest_bond_angle = angles[int(np.argmax(bond_lengths))]
    results_io.set_value("torsion.inter_ring_bond_range_A", [min(bond_lengths), max(bond_lengths)])
    results_io.set_value("torsion.longest_inter_ring_bond_angle_deg", longest_bond_angle)
    results_io.record_check("inter-ring C-C bond is longest at perpendicular (conjugation broken)", 90.0,
                            longest_bond_angle, longest_bond_angle == 90.0)

    # Compare the flattening cost with the thermal energy available at room temperature.
    from src.constants import BOLTZMANN_K, CELL_TEMPERATURE_K, ELEMENTARY_CHARGE
    thermal_energy_eV = BOLTZMANN_K * CELL_TEMPERATURE_K / ELEMENTARY_CHARGE
    results_io.set_value("torsion.thermal_energy_kT_eV_300K", thermal_energy_eV)
    results_io.set_value("torsion.barrier_to_planarity_over_kT", summary["barrier_to_planarity_eV"] / thermal_energy_eV)

    # Cross-check Part 2 against Part 3: the free B3LYP optimisation should land near the scan minimum.
    free_dihedral = abs(quantum.run_molecule("bithiophene", "B3LYP", verbose=False)["key_dihedrals_deg"][0])
    results_io.record_check("Part 2 free-optimised bithiophene dihedral within 15 deg of the scan minimum",
                            summary["minimum_angle_deg"], round(free_dihedral, 1),
                            abs(free_dihedral - summary["minimum_angle_deg"]) <= 15.0)

    figures.fig06_torsion_pes(points, summary)
    figures.fig07_torsion_gap(points, summary)
    return points, summary


# ---------------------------------------------------------------------------
# Part 4 -- descriptors, Lipinski, dye-likeness
# ---------------------------------------------------------------------------

# Hand-checkable values of the conjugation proxy, used as a unit test of our own code.
CONJUGATION_EXAMPLES = {"CC": 0, "C=C": 2, "C=CC=C": 4, "c1ccccc1": 6, "Nc1ccccc1": 7,
                        "c1ccc(-c2ccccc2)cc1": 12, "C=CCC=C": 2}


def load_descriptor_tables():
    """Cleaned QM9 and HOPV15 with their descriptor tables (cached after the first run)."""
    import pandas as pd

    from src.constants import PROCESSED_DIR
    from src.descriptors import cached_descriptor_table

    qm9 = pd.read_csv(PROCESSED_DIR / "qm9_clean.csv")
    hopv = pd.read_csv(PROCESSED_DIR / "hopv_clean.csv")
    return qm9, cached_descriptor_table("qm9", qm9["smiles"]), hopv, cached_descriptor_table("hopv", hopv["smiles"])


def filter_summary(table):
    """Pass counts and rates for Lipinski and each dye-filter rule on one descriptor table."""
    from src.descriptors import DYE_FILTER_RULES

    n_rows = len(table)
    return {
        "molecules": n_rows,
        "lipinski_pass_count": int(table["passes_lipinski"].sum()),
        "lipinski_pass_rate": float(table["passes_lipinski"].mean()),
        "dye_filter_pass_count": int(table["passes_dye_filter"].sum()),
        "dye_filter_pass_rate": float(table["passes_dye_filter"].mean()),
        "dye_rule_pass_counts": {rule: int(table[f"dye_{rule}"].sum()) for rule in DYE_FILTER_RULES},
        "both_filters_pass_count": int((table["passes_lipinski"] & table["passes_dye_filter"]).sum()),
    }


def run_descriptors():
    """Part 4: descriptors for QM9 and HOPV15, Lipinski vs the dye filter, correlations with the gap."""
    from rdkit import Chem

    from src import descriptors, figures

    qm9, qm9_table, hopv, hopv_table = load_descriptor_tables()
    gaps = qm9["gap_eV"].to_numpy()
    correlations = descriptors.correlations_with_gap(qm9_table, gaps)
    qm9_summary = filter_summary(qm9_table)
    hopv_summary = filter_summary(hopv_table)

    results_io.set_value("descriptors", {
        "names": descriptors.DESCRIPTOR_NAMES,
        "labels": descriptors.DESCRIPTOR_LABELS,
        "conjugation_proxy_definition": descriptors.largest_conjugated_system.__doc__.strip(),
        "lipinski_rules": {name: f"{op} {limit}" for name, (op, limit) in descriptors.LIPINSKI_RULES.items()},
        "lipinski_max_violations": descriptors.LIPINSKI_MAX_VIOLATIONS,
        "lipinski_pass_rate": qm9_summary["lipinski_pass_rate"],
        "dye_filter_pass_rate": qm9_summary["dye_filter_pass_rate"],
        "dye_filter_status": "our own construction by analogy with Lipinski; not a literature standard",
        "dye_filter_rules": descriptors.DYE_FILTER_RULES,
        "dye_filter_smarts": {"donors": descriptors.DONOR_SMARTS, "acceptors": descriptors.ACCEPTOR_SMARTS,
                              "unstable": descriptors.UNSTABLE_SMARTS},
        "qm9": qm9_summary,
        "hopv": hopv_summary,
        "correlations_with_gap": correlations,
        "summary_statistics": {
            name: {"mean": float(qm9_table[name].mean()), "std": float(qm9_table[name].std(ddof=0)),
                   "min": float(qm9_table[name].min()), "max": float(qm9_table[name].max())}
            for name in descriptors.DESCRIPTOR_NAMES},
    })

    # Our own conjugation code against values that can be counted by hand.
    computed = {smiles: descriptors.largest_conjugated_system(Chem.MolFromSmiles(smiles))
                for smiles in CONJUGATION_EXAMPLES}
    results_io.record_check("hand-written conjugation proxy matches hand-counted examples",
                            CONJUGATION_EXAMPLES, computed, computed == CONJUGATION_EXAMPLES)
    results_io.record_check("descriptors computed for every cleaned QM9 and HOPV15 molecule",
                            [len(qm9), len(hopv)], [len(qm9_table), len(hopv_table)],
                            len(qm9_table) == len(qm9) and len(hopv_table) == len(hopv))
    conjugation_r = correlations["largest_conjugated_system"]["pearson"]
    results_io.record_check("larger conjugated system correlates with a smaller gap (Pearson r < 0)", "< 0",
                            round(conjugation_r, 3), conjugation_r < 0)
    # The filter must accept the textbook push-pull molecule and reject plain benzene (no donor/acceptor).
    probe = descriptors.descriptor_table(["Nc1ccc(cc1)[N+](=O)[O-]", "c1ccccc1"])
    results_io.record_check("dye filter accepts 4-nitroaniline and rejects benzene", [True, False],
                            probe["passes_dye_filter"].tolist(), probe["passes_dye_filter"].tolist() == [True, False])

    figures.fig09_descriptor_distributions(qm9_table, gaps, descriptors.DESCRIPTOR_LABELS)
    figures.fig10_correlation_heatmap(qm9_table, gaps, descriptors.DESCRIPTOR_LABELS)
    return qm9_table, hopv_table


# ---------------------------------------------------------------------------
# Part 5 -- ML surrogate, screen, DFT verification
# ---------------------------------------------------------------------------

N_TOP_CANDIDATES = 10
N_DFT_VERIFIED = 3
# Funnel display threshold: candidates whose predicted gap is below 4.0 eV (310 nm, the near-UV).
# A presentation choice for fig13 only; the ranking itself uses distance from the SQ optimum alone.
SHORTLIST_MAX_GAP_EV = 4.0


def verify_with_dft(smiles_list):
    """B3LYP/6-31G* on each candidate (cached; the slow part can be run with src.run_candidate_dft)."""
    from src import quantum

    return [quantum.run_molecule(quantum.candidate_name(smiles), "B3LYP", verbose=False,
                                 spec=quantum.candidate_spec(smiles)) for smiles in smiles_list]


def run_model():
    """Part 5: train the three models, screen QM9 toward the SQ optimum, verify the top 3 with B3LYP."""
    from src import figures, model
    from src.descriptors import DESCRIPTOR_LABELS, DESCRIPTOR_NAMES

    qm9, qm9_table, hopv, hopv_table = load_descriptor_tables()
    gaps = qm9["gap_eV"].to_numpy()
    bundle = model.train_models(qm9_table, gaps)
    best = model.best_model_kind(bundle)
    split = bundle["split"]
    target_gap = results_io.get_value("sq.optimum_gap_eV")

    # --- metrics and importances -------------------------------------------------------------
    results_io.set_value("model", {
        "target": "QM9 B3LYP/6-31G(2df,p) HOMO-LUMO gap (eV)",
        "features": DESCRIPTOR_NAMES,
        "split": {"method": "random 80/10/10, seed 42 (justification in src/model.py)",
                  **{part: int(len(rows)) for part, rows in split.items()}},
        "standardisation": "z-score, population std (ddof=0), fitted on training rows only",
        "selection": "hyperparameters chosen by validation MAE; test set used once, for reporting",
        "best_model": best,
        "metrics": {kind: {"test": bundle["models"][kind]["metrics"]["test"],
                           "validation": bundle["models"][kind]["metrics"]["validation"],
                           "train": bundle["models"][kind]["metrics"]["train"],
                           "hyperparameters": bundle["models"][kind]["params"],
                           "fit_seconds": bundle["models"][kind]["fit_seconds"],
                           "grid_search": bundle["models"][kind]["search"]}
                    for kind in model.MODEL_ORDER},
        "feature_importance": {kind: {"permutation_importance_test_MAE_increase_eV":
                                      bundle["models"][kind]["permutation_importance_eV"],
                                      "permutation_importance_std_eV":
                                      bundle["models"][kind]["permutation_importance_std_eV"]}
                               for kind in model.MODEL_ORDER},
        "ridge_coefficients_eV_per_std": bundle["ridge_coefficients_eV_per_std"],
        # Everything the website needs to run the ridge model in JavaScript.
        "ridge_for_web": {"coefficients_eV_per_std": bundle["ridge_coefficients_eV_per_std"],
                          "intercept_eV": bundle["ridge_intercept_eV"],
                          "feature_mean": dict(zip(DESCRIPTOR_NAMES, bundle["standardiser"].mean_.tolist())),
                          "feature_std_ddof0": dict(zip(DESCRIPTOR_NAMES, bundle["standardiser"].std_.tolist()))},
    })

    # --- screen QM9 ------------------------------------------------------------------------
    screen = qm9_table.copy()
    screen["qm9_gap_eV"] = gaps
    screen["split"] = model.split_membership(len(screen), split)
    ranked = model.rank_candidates(screen, model.predict(bundle, best, qm9_table), target_gap)
    top = ranked.head(N_TOP_CANDIDATES).copy()
    top["rank"] = range(1, len(top) + 1)
    columns = ["rank", "smiles", "predicted_gap_eV", "distance_from_target_eV", "qm9_gap_eV", "split",
               "largest_conjugated_system"]
    candidates = model.frame_records(top, columns)
    dft = verify_with_dft([record["smiles"] for record in candidates[:N_DFT_VERIFIED]])
    for index, record in enumerate(candidates):
        record["b3lyp_6_31Gs_gap_eV"] = dft[index]["gap_eV"] if index < len(dft) else None
        record["b3lyp_wall_seconds"] = dft[index]["wall_seconds"] if index < len(dft) else None
    verified = candidates[:N_DFT_VERIFIED]
    errors = [record["predicted_gap_eV"] - record["b3lyp_6_31Gs_gap_eV"] for record in verified]

    funnel = [
        {"stage": "cleaned QM9", "count": len(qm9_table)},
        {"stage": "pass dye-likeness filter", "count": int(qm9_table["passes_dye_filter"].sum())},
        {"stage": f"predicted gap < {SHORTLIST_MAX_GAP_EV:.1f} eV",
         "count": int((ranked["predicted_gap_eV"] < SHORTLIST_MAX_GAP_EV).sum())},
        {"stage": f"top {N_TOP_CANDIDATES}, closest to {target_gap:.2f} eV", "count": len(top)},
        {"stage": "verified with B3LYP/6-31G*", "count": len(verified)},
    ]
    results_io.set_value("model.top_candidates", candidates)
    results_io.set_value("model.screening", {
        "dataset": "QM9 (the model's own chemical space)",
        "model_used": best,
        "target_gap_eV": target_gap,
        "ranking": "dye-filter passers, unique SMILES, sorted by |predicted gap - target|",
        "unique_filter_passers_ranked": len(ranked),
        "closest_predicted_gap_eV": float(ranked["predicted_gap_eV"].iloc[0]),
        "closest_distance_from_target_eV": float(ranked["distance_from_target_eV"].iloc[0]),
        "top_candidates_in_training_set": int((top["split"] == "train").sum()),
        "funnel": funnel,
        "dft_check": {
            "protocol": "ETKDG -> MMFF94 -> B3LYP/6-31G* optimisation -> single point (as Part 2)",
            "mean_absolute_error_predicted_vs_b3lyp_eV": float(np.mean(np.abs(errors))),
            "signed_errors_predicted_minus_b3lyp_eV": errors,
            "mean_absolute_difference_qm9_label_vs_our_b3lyp_eV": float(np.mean(
                [abs(record["qm9_gap_eV"] - record["b3lyp_6_31Gs_gap_eV"]) for record in verified])),
            "total_wall_seconds": float(sum(record["b3lyp_wall_seconds"] for record in verified)),
        },
    })

    # --- out-of-domain test on HOPV15 --------------------------------------------------------
    # The model was trained on molecules with at most 9 heavy atoms; HOPV15 molecules are far larger.
    has_dft = hopv["b3lyp_gap_eV"].notna().to_numpy()
    hopv_reference = hopv["b3lyp_gap_eV"].to_numpy()[has_dft]
    hopv_predictions = {kind: model.predict(bundle, kind, hopv_table)[has_dft] for kind in model.MODEL_ORDER}
    results_io.set_value("model.out_of_domain_hopv", {
        "reference": "HOPV15 B3LYP HOMO-LUMO gap, averaged over conformers",
        "molecules": int(has_dft.sum()),
        "heavy_atoms_range": [int(hopv["n_heavy_atoms"].min()), int(hopv["n_heavy_atoms"].max())],
        "reference_gap_range_eV": [float(hopv_reference.min()), float(hopv_reference.max())],
        "metrics": {kind: model.regression_metrics(hopv_reference, values)
                    for kind, values in hopv_predictions.items()},
        "predicted_gap_range_eV": {kind: [float(values.min()), float(values.max())]
                                   for kind, values in hopv_predictions.items()},
        "qm9_training_gap_min_eV": float(gaps[split["train"]].min()),
    })

    # --- checks ------------------------------------------------------------------------------
    all_rows = np.concatenate(list(split.values()))
    results_io.record_check("train/validation/test split is disjoint and covers every QM9 row", len(qm9_table),
                            int(len(np.unique(all_rows))),
                            len(np.unique(all_rows)) == len(all_rows) == len(qm9_table))
    standardised = bundle["standardiser"].transform(
        qm9_table[DESCRIPTOR_NAMES].to_numpy(dtype=float)[split["train"]])
    worst = float(max(np.abs(standardised.mean(axis=0)).max(),
                      np.abs(standardised.std(axis=0, ddof=0) - 1).max()))
    results_io.record_check("standardised training features have mean 0 and std 1 (ddof=0)", "< 1e-9",
                            worst, worst < 1e-9)
    test_mae = {kind: bundle["models"][kind]["metrics"]["test"]["MAE_eV"] for kind in model.MODEL_ORDER}
    results_io.record_check("both tree models beat the ridge baseline on test MAE", "trees < ridge",
                            {kind: round(value, 4) for kind, value in test_mae.items()},
                            max(test_mae["random_forest"], test_mae["gradient_boosting"]) < test_mae["ridge"])
    results_io.record_check("every top candidate passes the dye-likeness filter", N_TOP_CANDIDATES,
                            int(top["passes_dye_filter"].sum()), bool(top["passes_dye_filter"].all()))
    results_io.record_check("top 3 candidates have a real B3LYP gap", N_DFT_VERIFIED,
                            sum(record["b3lyp_6_31Gs_gap_eV"] is not None for record in verified),
                            all(record["b3lyp_6_31Gs_gap_eV"] is not None for record in verified))

    figures.fig11_parity(bundle, qm9_table, gaps, model, best, hopv_reference, hopv_predictions[best], verified)
    figures.fig12_feature_importance(bundle, DESCRIPTOR_LABELS, model.MODEL_ORDER, model.MODEL_LABELS, best)
    figures.fig13_screening_funnel(funnel)
    return bundle, candidates
