"""
Part 4: molecular descriptors, Lipinski's Rule of Five and a dye-likeness filter.

Three things live here:

1. `compute_descriptors`: eleven numbers per molecule. Ten come straight from
   RDKit. The eleventh, `largest_conjugated_system`, is written by hand below
   (see `largest_conjugated_system` for exactly what it counts and why).

2. `lipinski_rule_of_five`: the drug-likeness filter exactly as taught. It is a
   rule about ORAL ABSORPTION: a drug has to dissolve in the gut and cross
   cell membranes. A solar dye does neither, so passing Lipinski says nothing
   about whether a molecule would make a good dye. We apply it to make that point.

3. `dye_likeness_filter`: OUR OWN CONSTRUCTION, built by analogy with Lipinski.
   It is not a literature standard and has not been validated against real dye
   performance. Each rule encodes one property a dye-sensitised-solar-cell dye
   needs; the thresholds are judgement calls, stated in DYE_FILTER_RULES.
"""

import numpy as np
import pandas as pd
from rdkit import Chem, RDLogger
from rdkit.Chem import Crippen, Descriptors, Lipinski, rdMolDescriptors

from src.constants import CACHE_DIR

RDLogger.DisableLog("rdApp.*")

DESCRIPTOR_CACHE = CACHE_DIR / "descriptors"
# Bump when a descriptor or filter rule changes, so cached tables are recomputed.
DESCRIPTOR_VERSION = "v3"

# Display names and units, in the order used for every table and figure.
DESCRIPTOR_LABELS = {
    "molecular_weight": "Molecular weight (g/mol)",
    "logp": "LogP (Crippen)",
    "h_bond_donors": "H-bond donors",
    "h_bond_acceptors": "H-bond acceptors",
    "tpsa": "TPSA (Å²)",
    "rotatable_bonds": "Rotatable bonds",
    "ring_count": "Rings",
    "aromatic_ring_count": "Aromatic rings",
    "fraction_sp3": "Fraction sp³ carbons",
    "bertz_complexity": "Bertz complexity",
    "largest_conjugated_system": "Largest conjugated system (atoms)",
}
DESCRIPTOR_NAMES = list(DESCRIPTOR_LABELS)


# ---------------------------------------------------------------------------
# The conjugation proxy (hand-written)
# ---------------------------------------------------------------------------

def is_pi_atom(atom):
    """
    True if the atom contributes a p orbital that is part of a pi system:
    it is aromatic, or it carries a double or triple bond.
    """
    if atom.GetIsAromatic():
        return True
    return any(bond.GetBondType() in (Chem.BondType.DOUBLE, Chem.BondType.TRIPLE) for bond in atom.GetBonds())


def is_lone_pair_donor(atom):
    """
    True for an N, O or S atom with only single bonds that sits next to a pi atom.

    Its lone pair can overlap with the neighbouring p orbital, which is exactly
    how an amino group (aniline) or an ether oxygen (anisole) pushes electron
    density into a ring. Such atoms extend the conjugated system by one atom.
    """
    if atom.GetSymbol() not in ("N", "O", "S") or is_pi_atom(atom):
        return False
    return any(is_pi_atom(neighbour) for neighbour in atom.GetNeighbors())


def largest_conjugated_system(molecule):
    """
    Number of heavy atoms in the largest connected conjugated (pi) system.

    Written from the bond orders and aromaticity flags rather than RDKit's own
    conjugation perception, so every step can be explained:

      1. Mark every atom that takes part in pi bonding: aromatic atoms and atoms
         with a double or triple bond (`is_pi_atom`), plus N/O/S atoms whose lone
         pair sits next to such an atom (`is_lone_pair_donor`).
      2. Two marked atoms are in the same conjugated system if they are bonded.
         Any bond between two marked atoms counts: a double/aromatic bond is part
         of the pi system itself, and a single bond between two pi atoms is what
         joins them (as in butadiene, C=C-C=C, or biphenyl).
      3. Group the marked atoms into connected pieces (a union-find, below) and
         return the size of the biggest piece.

    Examples: ethene 2, butadiene 4, benzene 6, aniline 7 (ring + N),
    biphenyl 12, a saturated molecule 0. Larger means a longer path for
    delocalised electrons, which (particle in a box) should mean a smaller gap.

    Known simplifications: geometry is ignored (a twisted biphenyl still counts as
    12), cross-conjugation counts the same as linear conjugation, and a lone-pair
    atom between two pi systems joins them.
    """
    marked = [atom.GetIdx() for atom in molecule.GetAtoms() if is_pi_atom(atom) or is_lone_pair_donor(atom)]
    if not marked:
        return 0
    marked_set = set(marked)
    parent = {index: index for index in marked}

    def find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]  # path halving keeps the trees shallow
            index = parent[index]
        return index

    for bond in molecule.GetBonds():
        start, end = bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()
        if start in marked_set and end in marked_set:
            parent[find(start)] = find(end)

    sizes = {}
    for index in marked:
        root = find(index)
        sizes[root] = sizes.get(root, 0) + 1
    return max(sizes.values())


# ---------------------------------------------------------------------------
# Descriptors
# ---------------------------------------------------------------------------

def compute_descriptors(molecule):
    """The eleven descriptors (dict, in DESCRIPTOR_NAMES order) for one RDKit molecule."""
    return {
        "molecular_weight": Descriptors.MolWt(molecule),
        "logp": Crippen.MolLogP(molecule),
        "h_bond_donors": Lipinski.NumHDonors(molecule),
        "h_bond_acceptors": Lipinski.NumHAcceptors(molecule),
        "tpsa": rdMolDescriptors.CalcTPSA(molecule),
        "rotatable_bonds": Lipinski.NumRotatableBonds(molecule),
        "ring_count": rdMolDescriptors.CalcNumRings(molecule),
        "aromatic_ring_count": rdMolDescriptors.CalcNumAromaticRings(molecule),
        "fraction_sp3": rdMolDescriptors.CalcFractionCSP3(molecule),
        "bertz_complexity": Descriptors.BertzCT(molecule),
        "largest_conjugated_system": largest_conjugated_system(molecule),
    }


# ---------------------------------------------------------------------------
# Lipinski's Rule of Five (a DRUG filter)
# ---------------------------------------------------------------------------

# As stated in the syllabus (Lipinski et al., Adv. Drug Deliv. Rev. 23, 3, 1997):
# a molecule is likely to be orally absorbed if it violates AT MOST ONE of these.
LIPINSKI_RULES = {
    "molecular_weight": ("<=", 500.0),
    "logp": ("<=", 5.0),
    "h_bond_donors": ("<=", 5),
    "h_bond_acceptors": ("<=", 10),
}
LIPINSKI_MAX_VIOLATIONS = 1


def lipinski_violations(row):
    """Number of Rule-of-Five criteria a molecule breaks (row: descriptor dict or Series)."""
    return sum(row[name] > limit for name, (_, limit) in LIPINSKI_RULES.items())


def lipinski_rule_of_five(row):
    """True if the molecule passes Lipinski (at most one violation)."""
    return lipinski_violations(row) <= LIPINSKI_MAX_VIOLATIONS


# ---------------------------------------------------------------------------
# Dye-likeness filter (OUR OWN construction, by analogy with Lipinski)
# ---------------------------------------------------------------------------

# Electron-DONOR groups: lone pairs that push density into a pi system.
DONOR_SMARTS = {
    "amine on pi system": "[NX3;!$(N=*);!$(N#*);!$(N-[C,S,P]=O);!$([N+])]-[a,$([#6]=*)]",
    "hydroxyl/ether on pi system": "[OX2;!$(O-[C,S,P]=O)]-[a,$([#6]=*)]",
    "aromatic N-H (pyrrole type)": "[nH]",
    "thiophene/furan type ring atom": "[s,o;r5]",
}
# Electron-ACCEPTOR groups: low-lying empty pi* orbitals that pull density.
ACCEPTOR_SMARTS = {
    "carbonyl": "[CX3,c]=[OX1]",
    "nitrile": "C#N",
    "nitro": "[N+](=O)[O-]",
    "imine / azine C=N": "[CX3]=[NX2]",
    "pyridine-type ring N": "[nX2]",
}
# Weak bonds that would not survive the heat of a working cell (thermal-stability proxy).
UNSTABLE_SMARTS = {
    "peroxide O-O": "[OX2]-[OX2]",
    "N-N single bond": "[NX3]-[NX3]",
    "N-O single bond (not nitro)": "[NX3;!$([N+])]-[OX2]",
    "azide / diazo": "[N]=[N+]=[N-]",
}
DONOR_PATTERNS = {name: Chem.MolFromSmarts(smarts) for name, smarts in DONOR_SMARTS.items()}
ACCEPTOR_PATTERNS = {name: Chem.MolFromSmarts(smarts) for name, smarts in ACCEPTOR_SMARTS.items()}
UNSTABLE_PATTERNS = {name: Chem.MolFromSmarts(smarts) for name, smarts in UNSTABLE_SMARTS.items()}

# The rules and their thresholds. Each is a judgement call, written down so it can be argued with.
DYE_FILTER_RULES = {
    "extended_conjugation": "largest conjugated system >= 6 heavy atoms (at least a benzene ring's worth)",
    "planarity_capable": ("at least half the heavy atoms are in that conjugated system; single bonds between "
                          "conjugated rings are allowed (Part 3: flattening one costs < kT)"),
    "donor_and_acceptor": "contains at least one electron-donor group AND one electron-acceptor group",
    "thermal_stability_proxy": "no 3- or 4-membered rings, no O-O, N-N, non-nitro N-O single bonds, no azide",
    "no_charge_separation": "no formal charges except inside a nitro group (no zwitterions)",
}
MIN_CONJUGATED_ATOMS = 6
MIN_CONJUGATED_FRACTION = 0.5
# No limit on rotatable bonds: a first version required <= 2, which rejected 310 of the 350 real
# HOPV15 photovoltaic molecules, because the single bonds linking their aromatic rings count as
# "rotatable". Part 3 shows such a link (bithiophene) flattens for 3.9 meV, far below kT = 26 meV.


def has_any(molecule, patterns):
    """True if the molecule matches at least one of the SMARTS patterns."""
    return any(molecule.HasSubstructMatch(pattern) for pattern in patterns.values())


def has_small_ring(molecule):
    """True if the molecule has a strained 3- or 4-membered ring."""
    return any(len(ring) in (3, 4) for ring in molecule.GetRingInfo().AtomRings())


NITRO_PATTERN = Chem.MolFromSmarts("[N+](=O)[O-]")


def has_charge_separation(molecule):
    """
    True if any atom carries a formal charge that is not part of a nitro group.

    Added after the first screen: the molecules ranked closest to 1.34 eV were all
    zwitterions such as [NH2+]=CNC1=CC(=O)N[CH-]1, written with separated + and -
    charges. Such structures are reactive and are not dye cores, so they are excluded.
    """
    nitro_atoms = {index for match in molecule.GetSubstructMatches(NITRO_PATTERN) for index in match}
    return any(atom.GetFormalCharge() != 0 and atom.GetIdx() not in nitro_atoms for atom in molecule.GetAtoms())


def dye_filter_flags(molecule, descriptors):
    """The dye-likeness rules (dict of bools) for one molecule."""
    heavy_atoms = molecule.GetNumHeavyAtoms()
    conjugated = descriptors["largest_conjugated_system"]
    return {
        "extended_conjugation": conjugated >= MIN_CONJUGATED_ATOMS,
        "planarity_capable": conjugated >= MIN_CONJUGATED_FRACTION * heavy_atoms,
        "donor_and_acceptor": has_any(molecule, DONOR_PATTERNS) and has_any(molecule, ACCEPTOR_PATTERNS),
        "thermal_stability_proxy": not has_small_ring(molecule) and not has_any(molecule, UNSTABLE_PATTERNS),
        "no_charge_separation": not has_charge_separation(molecule),
    }


# ---------------------------------------------------------------------------
# Whole-dataset table (cached)
# ---------------------------------------------------------------------------

def descriptor_table(smiles_list):
    """
    Descriptors, Lipinski and dye-filter results for a list of SMILES, as a DataFrame
    (one row per SMILES, same order). Hydrogens are implicit, as RDKit's descriptor
    functions expect.
    """
    rows = []
    for smiles in smiles_list:
        molecule = Chem.MolFromSmiles(smiles)
        descriptors = compute_descriptors(molecule)
        flags = dye_filter_flags(molecule, descriptors)
        rows.append({
            "smiles": smiles,
            **descriptors,
            "lipinski_violations": lipinski_violations(descriptors),
            "passes_lipinski": lipinski_violations(descriptors) <= LIPINSKI_MAX_VIOLATIONS,
            **{f"dye_{name}": value for name, value in flags.items()},
            "passes_dye_filter": all(flags.values()),
        })
    return pd.DataFrame(rows)


def cached_descriptor_table(name, smiles_list):
    """`descriptor_table`, cached in cache/descriptors/<name>_<version>.csv (recomputed if the SMILES change)."""
    DESCRIPTOR_CACHE.mkdir(parents=True, exist_ok=True)
    path = DESCRIPTOR_CACHE / f"{name}_{DESCRIPTOR_VERSION}.csv"
    smiles_list = list(smiles_list)
    if path.exists():
        table = pd.read_csv(path)
        if table["smiles"].tolist() == smiles_list:
            return table
    table = descriptor_table(smiles_list)
    table.to_csv(path, index=False)
    return table


def correlations_with_gap(table, gaps):
    """Pearson and Spearman correlation of each descriptor with the gap."""
    result = {}
    for name in DESCRIPTOR_NAMES:
        values = table[name].astype(float)
        result[name] = {
            "pearson": float(np.corrcoef(values, gaps)[0, 1]),
            "spearman": float(pd.Series(values).corr(pd.Series(gaps), method="spearman")),
        }
    return result
