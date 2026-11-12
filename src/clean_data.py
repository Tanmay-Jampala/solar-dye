"""
Clean the raw QM9 and HOPV15 datasets into data/processed/*.csv.

Every cleaning rule is applied as a separate, logged step, so the report can
state exactly how many rows each rule removed.

Outputs
-------
data/processed/qm9_clean.csv   smiles, n_heavy_atoms, homo_eV, lumo_eV, gap_eV
data/processed/hopv_clean.csv  smiles, n_heavy_atoms, homo_eV, lumo_eV, gap_eV, pce_percent,
                               optical_gap_eV, b3lyp_homo_eV, b3lyp_lumo_eV, b3lyp_gap_eV
"""

from datetime import date

import numpy as np
import pandas as pd
from rdkit import Chem, RDLogger

from src.constants import HARTREE_TO_EV, PROCESSED_DIR, RAW_DIR
from src.download_data import DATASETS

# RDKit prints a warning for every SMILES it cannot parse; we count failures ourselves.
RDLogger.DisableLog("rdApp.*")

ALLOWED_QM9_ELEMENTS = {"C", "H", "N", "O", "F"}


# ---------------------------------------------------------------------------
# QM9
# ---------------------------------------------------------------------------

def read_uncharacterized_indices():
    """
    Parse the QM9 'uncharacterized' list and return the set of molecule indices it names.

    The file has a free-text header, then one row per molecule whose first column
    is the integer QM9 index. Any line whose first token is not an integer is header
    or footer text and is skipped.
    """
    indices = set()
    with open(RAW_DIR / "qm9_uncharacterized.txt", encoding="utf-8") as handle:
        for line in handle:
            tokens = line.split()
            if tokens and tokens[0].isdigit():
                indices.add(int(tokens[0]))
    return indices


def elements_in(molecule):
    """Return the set of element symbols in an RDKit molecule, including implicit hydrogens."""
    symbols = {atom.GetSymbol() for atom in molecule.GetAtoms()}
    if any(atom.GetTotalNumHs() > 0 for atom in molecule.GetAtoms()):
        symbols.add("H")
    return symbols


def clean_qm9():
    """
    Apply the QM9 cleaning rules in order and write qm9_clean.csv.

    Returns (clean_dataframe, cleaning_log) where cleaning_log is a list of
    {rule, removed, remaining} dictionaries, one per rule.
    """
    raw = pd.read_csv(RAW_DIR / "qm9.csv")
    cleaning_log = [{"rule": "raw rows in DeepChem QM9 CSV", "removed": 0, "remaining": len(raw)}]

    # Rule 1: drop the molecules whose relaxed geometry no longer matches their SMILES.
    raw["qm9_index"] = raw["mol_id"].str.replace("gdb_", "", regex=False).astype(int)
    uncharacterized = read_uncharacterized_indices()
    is_characterized = ~raw["qm9_index"].isin(uncharacterized)
    after_rule1 = raw[is_characterized].copy()
    cleaning_log.append({
        "rule": f"drop molecules on the Ramakrishnan 'uncharacterized' list ({len(uncharacterized)} listed)",
        "removed": len(raw) - len(after_rule1),
        "remaining": len(after_rule1),
    })

    # Rule 2: drop SMILES that RDKit cannot parse and sanitise.
    molecules = [Chem.MolFromSmiles(smiles) for smiles in after_rule1["smiles"]]
    sanitises = np.array([molecule is not None for molecule in molecules])
    after_rule2 = after_rule1[sanitises].copy()
    valid_molecules = [molecule for molecule in molecules if molecule is not None]
    cleaning_log.append({
        "rule": "drop SMILES that fail RDKit parsing/sanitisation",
        "removed": len(after_rule1) - len(after_rule2),
        "remaining": len(after_rule2),
    })

    # Rule 3: ASSERT (not assume) that only C, H, N, O, F occur.
    unexpected_elements = set()
    for molecule in valid_molecules:
        unexpected_elements |= elements_in(molecule) - ALLOWED_QM9_ELEMENTS
    assert not unexpected_elements, f"QM9 contains unexpected elements: {unexpected_elements}"
    cleaning_log.append({
        "rule": "assert only C, H, N, O, F present (assertion, removes nothing)",
        "removed": 0,
        "remaining": len(after_rule2),
    })

    # Convert energies from Hartree to eV at this boundary, once.
    clean = pd.DataFrame({
        "smiles": after_rule2["smiles"].values,
        "n_heavy_atoms": [molecule.GetNumHeavyAtoms() for molecule in valid_molecules],
        "homo_eV": after_rule2["homo"].values * HARTREE_TO_EV,
        "lumo_eV": after_rule2["lumo"].values * HARTREE_TO_EV,
        "gap_eV": after_rule2["gap"].values * HARTREE_TO_EV,
    })

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    clean.to_csv(PROCESSED_DIR / "qm9_clean.csv", index=False)
    return clean, cleaning_log


# ---------------------------------------------------------------------------
# HOPV15
# ---------------------------------------------------------------------------

def _parse_float(text):
    """Turn a HOPV field into a float, mapping 'nan' or blanks to NaN."""
    text = text.strip()
    if text == "" or text.lower() == "nan":
        return float("nan")
    return float(text)


def parse_hopv_file(path):
    """
    Parse the HOPV15 .data file into a list of per-molecule dictionaries.

    File layout, per molecule:
        line 1  SMILES
        line 2  InChI
        line 3  experimental CSV: doi, inchikey, construction, architecture, complement,
                HOMO, LUMO, electrochemical gap, optical gap, PCE, Voc, Jsc, fill factor
        line 4  pruned SMILES
        line 5  number of conformers N
        then N blocks of:
            'Conformer k'
            atom count A
            A lines of 'element x y z'
            4 DFT lines: 'QChem <functional>/def2-SVP DFT,HOMO,LUMO,gap,scharber_pce,voc,jsc'
                         (orbital energies in Hartree)

    The B3LYP orbital energies are averaged over all conformers of a molecule.
    """
    with open(path, encoding="utf-8") as handle:
        lines = [line.rstrip("\n") for line in handle]

    molecules = []
    position = 0
    while position < len(lines):
        if lines[position].strip() == "":
            position += 1
            continue
        smiles = lines[position].strip()
        experimental = lines[position + 2].split(",")
        n_conformers = int(lines[position + 4].strip())
        position += 5

        b3lyp_homo, b3lyp_lumo, b3lyp_gap = [], [], []
        for _ in range(n_conformers):
            n_atoms = int(lines[position + 1].strip())
            position += 2 + n_atoms
            for _ in range(4):
                fields = lines[position].split(",")
                if fields[0].startswith("QChem B3LYP/"):
                    b3lyp_homo.append(float(fields[1]))
                    b3lyp_lumo.append(float(fields[2]))
                    b3lyp_gap.append(float(fields[3]))
                position += 1

        def mean_ev(values):
            return float(np.mean(values)) * HARTREE_TO_EV if values else float("nan")

        molecules.append({
            "smiles": smiles,
            "homo_eV": _parse_float(experimental[5]),
            "lumo_eV": _parse_float(experimental[6]),
            "gap_eV": _parse_float(experimental[7]),
            "optical_gap_eV": _parse_float(experimental[8]),
            "pce_percent": _parse_float(experimental[9]),
            "b3lyp_homo_eV": mean_ev(b3lyp_homo),
            "b3lyp_lumo_eV": mean_ev(b3lyp_lumo),
            "b3lyp_gap_eV": mean_ev(b3lyp_gap),
            "n_conformers": n_conformers,
        })
    return molecules


def clean_hopv():
    """Parse HOPV15, drop molecules RDKit cannot sanitise, write hopv_clean.csv. Returns (df, log)."""
    records = parse_hopv_file(RAW_DIR / "HOPV_15_revised_2.data")
    raw = pd.DataFrame(records)
    cleaning_log = [{"rule": "molecules parsed from HOPV_15_revised_2.data", "removed": 0, "remaining": len(raw)}]

    molecules = [Chem.MolFromSmiles(smiles) for smiles in raw["smiles"]]
    sanitises = np.array([molecule is not None for molecule in molecules])
    clean = raw[sanitises].copy()
    clean.insert(1, "n_heavy_atoms", [m.GetNumHeavyAtoms() for m in molecules if m is not None])
    cleaning_log.append({
        "rule": "drop SMILES that fail RDKit parsing/sanitisation",
        "removed": int((~sanitises).sum()),
        "remaining": len(clean),
    })

    column_order = ["smiles", "n_heavy_atoms", "homo_eV", "lumo_eV", "gap_eV", "pce_percent",
                    "optical_gap_eV", "b3lyp_homo_eV", "b3lyp_lumo_eV", "b3lyp_gap_eV", "n_conformers"]
    clean = clean[column_order]
    clean.to_csv(PROCESSED_DIR / "hopv_clean.csv", index=False)
    return clean, cleaning_log


# ---------------------------------------------------------------------------
# Provenance
# ---------------------------------------------------------------------------

def provenance_paragraph(qm9_log, hopv_log, download_date):
    """Build the one-paragraph data provenance note quoted in the report."""
    qm9_before = qm9_log[0]["remaining"]
    qm9_after = qm9_log[-1]["remaining"]
    hopv_before = hopv_log[0]["remaining"]
    hopv_after = hopv_log[-1]["remaining"]
    return (
        f"QM9 (Ramakrishnan et al., Sci. Data 1, 140022, 2014; CC0) was obtained from the "
        f"DeepChem/MoleculeNet mirror ({DATASETS['qm9.csv']['url']}) together with the authors' list of "
        f"geometrically inconsistent ('uncharacterized') molecules from figshare, on {download_date}. "
        f"It contained {qm9_before} molecules; removing the uncharacterized set and any SMILES failing "
        f"RDKit sanitisation left {qm9_after}. HOMO, LUMO and gap are B3LYP/6-31G(2df,p) values, "
        f"converted from Hartree to eV. HOPV15 (Lopez et al., Sci. Data 3, 160086, 2016; CC BY 4.0) "
        f"revision 2 was obtained from figshare ({DATASETS['HOPV_15_revised_2.data']['url']}) on the same "
        f"date: {hopv_before} molecules parsed, {hopv_after} retained after RDKit sanitisation. Its "
        f"HOMO/LUMO/gap columns are experimental (electrochemical) values in eV with PCE in percent; "
        f"B3LYP/def2-SVP orbital energies are averaged over the supplied conformers. The AM1.5G spectrum "
        f"is the ASTM G173-03 table as redistributed with pvlib-python v0.11.0."
    )


def run_cleaning(download_date=None):
    """Clean both datasets and return everything results.json needs under 'data'."""
    download_date = download_date or date.today().isoformat()
    qm9, qm9_log = clean_qm9()
    hopv, hopv_log = clean_hopv()
    return {
        "qm9": qm9,
        "hopv": hopv,
        "qm9_log": qm9_log,
        "hopv_log": hopv_log,
        "provenance": provenance_paragraph(qm9_log, hopv_log, download_date),
    }
