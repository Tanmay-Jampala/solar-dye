"""
Part 2 -- What gap does a molecule actually have? Molecular mechanics, Hartree-Fock and DFT.

Pipeline for one molecule:

  1. SMILES -> RDKit molecule with explicit hydrogens.
  2. ETKDG: a 3D conformer from distance geometry (random seed 42).
  3. MMFF94: classical force-field optimisation (Unit I molecular mechanics).
     The force-field energy before and after is kept.
  4. PySCF geometry optimisation (geomeTRIC optimiser) at HF/6-31G* and,
     separately, at B3LYP/6-31G*, both starting from the MMFF94 geometry.
  5. A final single-point calculation at the optimised geometry gives the orbital
     energies: HOMO, LUMO and their difference, the HOMO-LUMO gap.

Every result is cached to cache/quantum/<name>__<method>.json (plus a .chk
file holding the orbitals and an .xyz of the geometry). Re-running the
notebook therefore takes seconds: a cached calculation is never repeated.

Units: PySCF works in Hartree and Bohr. Energies are converted to eV
immediately after each PySCF call, using HARTREE_TO_EV, and never later.
"""

import hashlib
import json
import os
import time

from src.constants import (BASIS_SET, CACHE_DIR, HARTREE_TO_EV, KCAL_PER_MOL_TO_EV, PYSCF_MAX_MEMORY_MB,
                           PYSCF_THREADS, RANDOM_SEED)

# Thread count must be fixed before PySCF (and its BLAS) is imported.
os.environ.setdefault("OMP_NUM_THREADS", str(PYSCF_THREADS))

import numpy as np  # noqa: E402
from rdkit import Chem  # noqa: E402
from rdkit.Chem import AllChem, rdMolTransforms  # noqa: E402

QUANTUM_CACHE = CACHE_DIR / "quantum"

# Bump this if the calculation protocol changes, so old cached results are not reused by mistake.
PROTOCOL_VERSION = "v1"

# ---------------------------------------------------------------------------
# The molecule set
# ---------------------------------------------------------------------------
# Each entry: SMILES, the group it belongs to, the conjugation length used on the
# x-axis of fig03 (number of rings in the conjugated chain, for the ladders), and
# SMARTS patterns for the bond and dihedral worth reporting.

MOLECULES = {
    "benzene": {
        "smiles": "c1ccccc1", "group": "phenyl ladder", "rings": 1,
        "key_bond": ("aromatic C-C", "c:c"), "key_dihedral": None,
    },
    "biphenyl": {
        "smiles": "c1ccc(-c2ccccc2)cc1", "group": "phenyl ladder", "rings": 2,
        "key_bond": ("inter-ring C-C", "c-!@c"), "key_dihedral": ("inter-ring C-C-C-C", "c:c-!@c:c"),
    },
    "thiophene": {
        "smiles": "c1ccsc1", "group": "thiophene ladder", "rings": 1,
        "key_bond": ("C-S", "c:s"), "key_dihedral": None,
    },
    "bithiophene": {
        "smiles": "c1csc(-c2cccs2)c1", "group": "thiophene ladder", "rings": 2,
        "key_bond": ("inter-ring C-C", "c-!@c"), "key_dihedral": ("S-C-C-S", "s:c-!@c:s"),
    },
    "terthiophene": {
        "smiles": "c1csc(-c2ccc(-c3cccs3)s2)c1", "group": "thiophene ladder", "rings": 3,
        "key_bond": ("inter-ring C-C", "c-!@c"), "key_dihedral": ("S-C-C-S", "s:c-!@c:s"),
    },
    "4-nitroaniline": {
        "smiles": "Nc1ccc(cc1)[N+](=O)[O-]", "group": "push-pull", "rings": 1,
        "key_bond": ("C-NH2 (donor)", "[NX3;H2]-c"), "key_dihedral": None,
    },
    "4-aminobenzonitrile": {
        "smiles": "Nc1ccc(C#N)cc1", "group": "push-pull", "rings": 1,
        "key_bond": ("C#N (acceptor)", "C#N"), "key_dihedral": None,
    },
    "coumarin": {
        "smiles": "O=c1ccc2ccccc2o1", "group": "dye core", "rings": 2,
        "key_bond": ("C=O", "O=c"), "key_dihedral": None,
    },
    "azobenzene": {
        "smiles": "c1ccc(/N=N/c2ccccc2)cc1", "group": "dye core", "rings": 2,
        "key_bond": ("N=N", "N=N"), "key_dihedral": ("C-N=N-C", "c-N=N-c"),
    },
}

# Inter-ring dihedrals that MMFF94 leaves EXACTLY planar are rotated to this value before
# the quantum optimisation. Starting from a perfectly planar geometry, the optimiser
# cannot leave the plane (the gradient out of plane is zero by symmetry) and can get
# stuck on a saddle point. 160 degrees is anti and clearly non-planar.
# Note: azobenzene's C-N=N-C dihedral (about the N=N DOUBLE bond) also matched this rule, so it was
# started at 160 deg too. Both HF and B3LYP rotated it straight back to 180 deg (trans-planar), which
# shows the nudge only removes the symmetry trap; it does not bias where the optimiser ends up.
SYMMETRY_BREAK_DIHEDRAL_DEG = 160.0
PLANAR_TOLERANCE_DEG = 2.0


# ---------------------------------------------------------------------------
# Step 1-3: RDKit + MMFF94
# ---------------------------------------------------------------------------

def embed_and_mmff(smiles):
    """
    Build a 3D molecule from SMILES and optimise it with the MMFF94 force field.

    Returns (rdkit_molecule_with_Hs, info) where info holds the MMFF94 energies
    (eV) before and after optimisation and whether it converged.
    """
    molecule = Chem.AddHs(Chem.MolFromSmiles(smiles))
    embed_parameters = AllChem.ETKDGv3()
    embed_parameters.randomSeed = RANDOM_SEED
    status = AllChem.EmbedMolecule(molecule, embed_parameters)
    if status != 0:
        raise RuntimeError(f"ETKDG embedding failed for {smiles}")

    force_field_properties = AllChem.MMFFGetMoleculeProperties(molecule, mmffVariant="MMFF94")
    force_field = AllChem.MMFFGetMoleculeForceField(molecule, force_field_properties)
    energy_before_kcal = force_field.CalcEnergy()
    not_converged = force_field.Minimize(maxIts=5000)
    energy_after_kcal = force_field.CalcEnergy()

    info = {
        "mmff94_energy_before_eV": energy_before_kcal * KCAL_PER_MOL_TO_EV,
        "mmff94_energy_after_eV": energy_after_kcal * KCAL_PER_MOL_TO_EV,
        "mmff94_energy_drop_eV": (energy_before_kcal - energy_after_kcal) * KCAL_PER_MOL_TO_EV,
        "mmff94_converged": not_converged == 0,
    }
    return molecule, info


def break_planar_symmetry(molecule, dihedral_smarts):
    """
    Rotate any exactly planar inter-ring dihedral to SYMMETRY_BREAK_DIHEDRAL_DEG.

    Returns the list of dihedral values (deg) that MMFF94 had produced, so the
    report can say what the force field predicted on its own.
    """
    if dihedral_smarts is None:
        return []
    conformer = molecule.GetConformer()
    pattern = Chem.MolFromSmarts(dihedral_smarts)
    mmff_values = []
    seen_bonds = set()
    for atoms in molecule.GetSubstructMatches(pattern):
        central_bond = tuple(sorted(atoms[1:3]))
        if central_bond in seen_bonds:
            continue  # one dihedral per rotatable bond
        seen_bonds.add(central_bond)
        value = rdMolTransforms.GetDihedralDeg(conformer, *atoms)
        mmff_values.append(value)
        distance_from_plane = min(abs(value) % 180.0, 180.0 - abs(value) % 180.0)
        if distance_from_plane < PLANAR_TOLERANCE_DEG:
            rdMolTransforms.SetDihedralDeg(conformer, *atoms, SYMMETRY_BREAK_DIHEDRAL_DEG)
    return mmff_values


def rdkit_to_pyscf_atoms(molecule):
    """Convert an RDKit conformer into PySCF's atom list [(symbol, (x, y, z)), ...] in Angstrom."""
    positions = molecule.GetConformer().GetPositions()
    return [(atom.GetSymbol(), tuple(positions[index])) for index, atom in enumerate(molecule.GetAtoms())]


def set_coordinates(molecule, coordinates_angstrom):
    """Return a copy of the RDKit molecule with its conformer replaced by new coordinates."""
    updated = Chem.Mol(molecule)
    conformer = updated.GetConformer()
    for index, position in enumerate(coordinates_angstrom):
        conformer.SetAtomPosition(index, [float(value) for value in position])
    return updated


# ---------------------------------------------------------------------------
# Geometry measurements
# ---------------------------------------------------------------------------

def measure_bond(molecule, bond_smarts):
    """Length (Angstrom) of the first bond matching a two-atom SMARTS pattern."""
    pattern = Chem.MolFromSmarts(bond_smarts)
    matches = molecule.GetSubstructMatches(pattern)
    if not matches:
        return None
    first, second = matches[0][0], matches[0][1]
    return float(rdMolTransforms.GetBondLength(molecule.GetConformer(), first, second))


def measure_dihedrals(molecule, dihedral_smarts):
    """All distinct dihedral angles (deg, -180..180) matching a four-atom SMARTS, one per central bond."""
    if dihedral_smarts is None:
        return []
    pattern = Chem.MolFromSmarts(dihedral_smarts)
    values = []
    seen_bonds = set()
    for atoms in molecule.GetSubstructMatches(pattern):
        central_bond = tuple(sorted(atoms[1:3]))
        if central_bond in seen_bonds:
            continue
        seen_bonds.add(central_bond)
        values.append(float(rdMolTransforms.GetDihedralDeg(molecule.GetConformer(), *atoms)))
    return values


def heavy_atom_bond_lengths(molecule):
    """Every bond between two non-hydrogen atoms: list of {atoms, label, length_A}."""
    conformer = molecule.GetConformer()
    bonds = []
    for bond in molecule.GetBonds():
        begin, end = bond.GetBeginAtom(), bond.GetEndAtom()
        if begin.GetAtomicNum() == 1 or end.GetAtomicNum() == 1:
            continue
        label = f"{begin.GetSymbol()}{begin.GetIdx() + 1}-{end.GetSymbol()}{end.GetIdx() + 1}"
        bonds.append({
            "atoms": [begin.GetIdx(), end.GetIdx()],
            "label": label,
            "length_A": float(rdMolTransforms.GetBondLength(conformer, begin.GetIdx(), end.GetIdx())),
        })
    return bonds


# ---------------------------------------------------------------------------
# Step 4-5: PySCF
# ---------------------------------------------------------------------------

def make_pyscf_molecule(atoms, basis=BASIS_SET):
    """Build a closed-shell, neutral PySCF molecule (coordinates in Angstrom)."""
    from pyscf import gto
    return gto.M(atom=atoms, basis=basis, unit="Angstrom", charge=0, spin=0,
                 verbose=0, max_memory=PYSCF_MAX_MEMORY_MB)


def make_mean_field(pyscf_molecule, method):
    """Return an (unconverged) mean-field object: restricted HF, or restricted Kohn-Sham with B3LYP."""
    from pyscf import dft, scf
    if method == "HF":
        mean_field = scf.RHF(pyscf_molecule)
    elif method == "B3LYP":
        mean_field = dft.RKS(pyscf_molecule)
        # PySCF's "b3lyp" follows the Gaussian convention (VWN-RPA correlation) since PySCF 2.3,
        # i.e. the same B3LYP that QM9 and HOPV15 used.
        mean_field.xc = "b3lyp"
    else:
        raise ValueError(f"Unknown method {method}")
    mean_field.conv_tol = 1e-9
    mean_field.max_cycle = 200
    return mean_field


def frontier_orbitals(mean_field):
    """HOMO, LUMO and gap in eV from a converged closed-shell calculation."""
    occupations = np.asarray(mean_field.mo_occ)
    energies_hartree = np.asarray(mean_field.mo_energy)
    homo_index = int(np.max(np.where(occupations > 0)[0]))
    lumo_index = homo_index + 1
    homo_eV = float(energies_hartree[homo_index]) * HARTREE_TO_EV
    lumo_eV = float(energies_hartree[lumo_index]) * HARTREE_TO_EV
    return {"homo_index": homo_index, "lumo_index": lumo_index,
            "homo_eV": homo_eV, "lumo_eV": lumo_eV, "gap_eV": lumo_eV - homo_eV}


def optimise_geometry(atoms, method, constraints_file=None, max_steps=150):
    """
    Optimise a geometry with PySCF + geomeTRIC.

    Returns (optimised PySCF molecule, n_steps, seconds). Raises if the optimiser
    does not reach geomeTRIC's default convergence criteria within max_steps.
    `constraints_file` (optional) is a geomeTRIC constraints file, used by the torsion scan.
    """
    from pyscf.geomopt.geometric_solver import GeometryOptimizer

    pyscf_molecule = make_pyscf_molecule(atoms)
    mean_field = make_mean_field(pyscf_molecule, method)
    step_counter = {"steps": 0}

    def count_step(envs):
        step_counter["steps"] += 1

    optimiser = GeometryOptimizer(mean_field)
    optimiser.max_cycle = max_steps
    optimiser.callback = count_step
    if constraints_file is not None:
        optimiser.params = {"constraints": str(constraints_file)}

    start = time.perf_counter()
    optimised_molecule = optimiser.kernel()
    converged = optimiser.converged
    elapsed = time.perf_counter() - start
    if not converged:
        raise RuntimeError(f"{method} geometry optimisation did not converge in {max_steps} steps")
    return optimised_molecule, step_counter["steps"], elapsed


def single_point(atoms, method, chkfile=None):
    """Converged SCF at a fixed geometry. Returns (mean_field, seconds)."""
    pyscf_molecule = make_pyscf_molecule(atoms)
    mean_field = make_mean_field(pyscf_molecule, method)
    if chkfile is not None:
        mean_field.chkfile = str(chkfile)
    start = time.perf_counter()
    mean_field.kernel()
    elapsed = time.perf_counter() - start
    if not mean_field.converged:
        raise RuntimeError(f"{method} SCF did not converge")
    return mean_field, elapsed


def write_xyz(path, symbols, coordinates_angstrom, comment=""):
    """Write a plain .xyz file (opens in Avogadro, Jmol, VMD...)."""
    lines = [str(len(symbols)), comment]
    for symbol, (x, y, z) in zip(symbols, coordinates_angstrom):
        lines.append(f"{symbol:2s} {x:14.8f} {y:14.8f} {z:14.8f}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# Caching
# ---------------------------------------------------------------------------

def cache_key(name, method, smiles, basis=BASIS_SET):
    """A short hash of everything that defines a calculation; changes if any input changes."""
    text = f"{PROTOCOL_VERSION}|{name}|{method}|{smiles}|{basis}"
    return hashlib.sha256(text.encode()).hexdigest()[:12]


def cache_paths(name, method):
    """File paths for one cached calculation (json result, orbital checkpoint, optimised geometry)."""
    safe_name = name.replace(" ", "_")
    base = QUANTUM_CACHE / f"{safe_name}__{method}"
    return {"json": base.with_suffix(".json"), "chk": base.with_suffix(".chk"), "xyz": base.with_suffix(".xyz")}


def load_cached(name, method, smiles):
    """Return the cached result dict if it exists and matches the current inputs, else None."""
    paths = cache_paths(name, method)
    if not paths["json"].exists():
        return None
    cached = json.loads(paths["json"].read_text(encoding="utf-8"))
    if cached.get("cache_key") != cache_key(name, method, smiles):
        return None
    return cached


# ---------------------------------------------------------------------------
# The full calculation for one molecule and one method
# ---------------------------------------------------------------------------

def run_molecule(name, method, verbose=True, spec=None):
    """
    Run (or load from cache) the full MMFF94 -> PySCF optimisation -> single point
    protocol for one molecule and one method ('HF' or 'B3LYP').

    `spec` defaults to MOLECULES[name]; the Part 5 screening candidates pass their
    own (see `candidate_spec`), with no key bond or dihedral to report.
    """
    spec = spec if spec is not None else MOLECULES[name]
    smiles = spec["smiles"]
    cached = load_cached(name, method, smiles)
    if cached is not None:
        if verbose:
            print(f"{name} {method}: loaded from cache")
        return cached

    QUANTUM_CACHE.mkdir(parents=True, exist_ok=True)
    paths = cache_paths(name, method)
    if verbose:
        print(f"{name} {method}: running", flush=True)

    # Molecular mechanics.
    rdkit_molecule, mmff_info = embed_and_mmff(smiles)
    key_bond_smarts = spec["key_bond"][1] if spec["key_bond"] else None
    mmff_bond = measure_bond(rdkit_molecule, key_bond_smarts) if key_bond_smarts else None
    dihedral_smarts = spec["key_dihedral"][1] if spec["key_dihedral"] else None
    mmff_dihedrals = break_planar_symmetry(rdkit_molecule, dihedral_smarts)
    mmff_bonds_all = heavy_atom_bond_lengths(rdkit_molecule)
    symbols = [atom.GetSymbol() for atom in rdkit_molecule.GetAtoms()]
    write_xyz(QUANTUM_CACHE / f"{name.replace(' ', '_')}__MMFF94.xyz", symbols,
              rdkit_molecule.GetConformer().GetPositions(), f"{name} MMFF94")

    # Quantum geometry optimisation, then a clean single point at the final geometry.
    optimised, n_steps, optimisation_seconds = optimise_geometry(rdkit_to_pyscf_atoms(rdkit_molecule), method)
    final_coordinates = optimised.atom_coords(unit="Angstrom")
    final_atoms = [(symbol, tuple(position)) for symbol, position in zip(symbols, final_coordinates)]
    mean_field, single_point_seconds = single_point(final_atoms, method, chkfile=paths["chk"])

    total_energy_eV = float(mean_field.e_tot) * HARTREE_TO_EV
    orbitals = frontier_orbitals(mean_field)
    optimised_rdkit = set_coordinates(rdkit_molecule, final_coordinates)
    write_xyz(paths["xyz"], symbols, final_coordinates, f"{name} {method}/{BASIS_SET} optimised")

    result = {
        "cache_key": cache_key(name, method, smiles),
        "name": name,
        "smiles": smiles,
        "group": spec["group"],
        "rings": spec["rings"],
        "method": method,
        "basis": BASIS_SET,
        "n_atoms": rdkit_molecule.GetNumAtoms(),
        "n_heavy_atoms": rdkit_molecule.GetNumHeavyAtoms(),
        "n_basis_functions": int(mean_field.mol.nao_nr()),
        "total_energy_eV": total_energy_eV,
        "homo_eV": orbitals["homo_eV"],
        "lumo_eV": orbitals["lumo_eV"],
        "gap_eV": orbitals["gap_eV"],
        "key_bond_name": spec["key_bond"][0] if spec["key_bond"] else None,
        "key_bond_A": measure_bond(optimised_rdkit, key_bond_smarts) if key_bond_smarts else None,
        "key_bond_mmff94_A": mmff_bond,
        "key_dihedral_name": spec["key_dihedral"][0] if spec["key_dihedral"] else None,
        "key_dihedrals_deg": measure_dihedrals(optimised_rdkit, dihedral_smarts),
        "key_dihedrals_mmff94_deg": mmff_dihedrals,
        "heavy_atom_bonds": heavy_atom_bond_lengths(optimised_rdkit),
        "heavy_atom_bonds_mmff94": mmff_bonds_all,
        "optimisation_steps": n_steps,
        "optimisation_seconds": optimisation_seconds,
        "single_point_seconds": single_point_seconds,
        "wall_seconds": optimisation_seconds + single_point_seconds,
        "threads": PYSCF_THREADS,
        **mmff_info,
    }
    paths["json"].write_text(json.dumps(result, indent=2), encoding="utf-8")
    if verbose:
        print(f"{name} {method}: gap {orbitals['gap_eV']:.3f} eV, {result['wall_seconds']:.0f} s, "
              f"{n_steps} steps", flush=True)
    return result


def candidate_name(smiles):
    """Stable cache name for a screening candidate (a hash of its SMILES, so re-ranking reuses the cache)."""
    return "candidate_" + hashlib.sha256(smiles.encode()).hexdigest()[:8]


def candidate_spec(smiles):
    """A MOLECULES-style spec for a screening candidate: just the SMILES, nothing extra to measure."""
    from rdkit.Chem import rdMolDescriptors
    rings = rdMolDescriptors.CalcNumRings(Chem.MolFromSmiles(smiles))
    return {"smiles": smiles, "group": "screening candidate", "rings": rings,
            "key_bond": None, "key_dihedral": None}


# ---------------------------------------------------------------------------
# Orbitals on a grid (for fig05 and for Avogadro)
# ---------------------------------------------------------------------------

def orbital_grids(name, method="B3LYP", points_per_axis=80, margin_bohr=4.0):
    """
    Evaluate the HOMO and LUMO of a cached calculation on a 3D grid and write
    Gaussian .cube files (cache/quantum/<name>__<method>__HOMO.cube, ...LUMO.cube).

    The .cube files open directly in Avogadro (File > Open), which is how the
    isosurfaces can also be rendered in the syllabus-named modelling tool.

    Returns a dict with, for each orbital: the grid values, the grid axes in
    Angstrom, plus the atom symbols and coordinates in Angstrom.
    """
    from pyscf import lib
    from pyscf.tools import cubegen

    paths = cache_paths(name, method)
    pyscf_molecule = lib.chkfile.load_mol(str(paths["chk"]))
    scf_data = lib.chkfile.load(str(paths["chk"]), "scf")
    occupations = np.asarray(scf_data["mo_occ"])
    coefficients = np.asarray(scf_data["mo_coeff"])
    homo_index = int(np.max(np.where(occupations > 0)[0]))

    bohr_to_angstrom = 0.529177210903
    grids = {}
    for label, index in (("HOMO", homo_index), ("LUMO", homo_index + 1)):
        cube_path = paths["json"].with_name(f"{paths['json'].stem}__{label}.cube")
        cube = cubegen.Cube(pyscf_molecule, nx=points_per_axis, ny=points_per_axis, nz=points_per_axis,
                            margin=margin_bohr)
        values = cubegen.orbital(pyscf_molecule, str(cube_path), coefficients[:, index],
                                 nx=points_per_axis, ny=points_per_axis, nz=points_per_axis, margin=margin_bohr)
        axes_angstrom = [cube.boxorig[axis] * bohr_to_angstrom
                         + np.arange(points_per_axis) * cube.box[axis, axis] / (points_per_axis - 1) * bohr_to_angstrom
                         for axis in range(3)]
        grids[label] = {"values": np.asarray(values).reshape(points_per_axis, points_per_axis, points_per_axis),
                        "axes_A": axes_angstrom, "cube_file": str(cube_path)}

    symbols = [pyscf_molecule.atom_symbol(i) for i in range(pyscf_molecule.natm)]
    return {"orbitals": grids, "symbols": symbols, "coordinates_A": pyscf_molecule.atom_coords(unit="Angstrom")}


def density_centroid_along_axis(grid, start_point_A, end_point_A):
    """
    Where along the line start -> end does an orbital's density |psi|^2 sit?

    Returns a fraction: 0 = centred on start_point, 1 = centred on end_point.
    For a push-pull molecule with start = donor N and end = acceptor N, a HOMO
    near 0 and a LUMO near 1 is the signature of intramolecular charge transfer.
    """
    x_axis, y_axis, z_axis = grid["axes_A"]
    density = grid["values"] ** 2
    density = density / density.sum()
    mesh_x, mesh_y, mesh_z = np.meshgrid(x_axis, y_axis, z_axis, indexing="ij")
    centroid = np.array([(density * mesh_x).sum(), (density * mesh_y).sum(), (density * mesh_z).sum()])
    direction = np.asarray(end_point_A) - np.asarray(start_point_A)
    length = np.linalg.norm(direction)
    return float(np.dot(centroid - start_point_A, direction) / length ** 2), centroid
