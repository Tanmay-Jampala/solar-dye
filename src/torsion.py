"""
Part 3 -- A potential energy surface: torsion controls the gap.

2,2'-bithiophene has one rotatable bond between its rings. We scan the S-C-C-S
dihedral angle from 0 deg (syn-planar, sulfurs on the same side) to 180 deg
(anti-planar) in 10 deg steps. At every angle:

  * the dihedral is FIXED at that value, and every other coordinate is optimised
    at B3LYP/6-31G* (a "relaxed" or constrained scan, done with geomeTRIC's
    $set constraint);
  * we record the total energy (the potential energy surface) and the
    HOMO-LUMO gap.

What we expect: the energy minimum is twisted (steric clash between ring
hydrogens/sulfurs fights against pi-conjugation, which favours planarity), while
the GAP is smallest when the rings are planar, because planarity maximises the
overlap of the two rings' pi orbitals. The molecule's preferred shape and its
best optical shape are not the same -- a real design problem in dye chemistry.

Each angle is cached to cache/torsion/angle_XXX.json, so the scan only ever runs once.
"""

import json
import tempfile
from pathlib import Path

import numpy as np
from rdkit import Chem
from rdkit.Chem import rdMolTransforms

from src import quantum
from src.constants import CACHE_DIR, HARTREE_TO_EV

TORSION_CACHE = CACHE_DIR / "torsion"
SCAN_MOLECULE = "bithiophene"
SCAN_METHOD = "B3LYP"
SCAN_ANGLES_DEG = list(range(0, 181, 10))
DIHEDRAL_SMARTS = "s:c-!@c:s"   # S-C-C-S across the inter-ring bond


def find_scan_dihedral(molecule):
    """Return the four atom indices (0-based) of the S-C-C-S dihedral in bithiophene."""
    matches = molecule.GetSubstructMatches(Chem.MolFromSmarts(DIHEDRAL_SMARTS))
    if not matches:
        raise RuntimeError("S-C-C-S dihedral not found")
    return matches[0]


def starting_molecule():
    """
    The B3LYP-optimised bithiophene from Part 2 as an RDKit molecule (same atom order).

    Starting each constrained optimisation from a good geometry means only the
    angle needs to change, so each point converges in few steps.
    """
    spec = quantum.MOLECULES[SCAN_MOLECULE]
    reference = quantum.run_molecule(SCAN_MOLECULE, SCAN_METHOD)
    rdkit_molecule, _ = quantum.embed_and_mmff(spec["smiles"])
    xyz_lines = quantum.cache_paths(SCAN_MOLECULE, SCAN_METHOD)["xyz"].read_text(encoding="utf-8").splitlines()[2:]
    coordinates = [[float(value) for value in line.split()[1:4]] for line in xyz_lines if line.strip()]
    return quantum.set_coordinates(rdkit_molecule, coordinates), reference


def write_constraint_file(directory, atoms, angle_deg):
    """Write a geomeTRIC constraints file fixing one dihedral (geomeTRIC counts atoms from 1)."""
    one_based = [index + 1 for index in atoms]
    path = Path(directory) / "constraints.txt"
    path.write_text(f"$set\ndihedral {one_based[0]} {one_based[1]} {one_based[2]} {one_based[3]} {angle_deg:.1f}\n",
                    encoding="utf-8")
    return path


def angle_cache_path(angle_deg):
    """Cache file for one scan point."""
    return TORSION_CACHE / f"angle_{int(angle_deg):03d}.json"


def run_scan_point(base_molecule, atoms, angle_deg, verbose=True):
    """Constrained B3LYP optimisation at one dihedral angle (or load it from cache)."""
    cache_file = angle_cache_path(angle_deg)
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))

    TORSION_CACHE.mkdir(parents=True, exist_ok=True)
    start_molecule = Chem.Mol(base_molecule)
    rdMolTransforms.SetDihedralDeg(start_molecule.GetConformer(), *atoms, float(angle_deg))
    symbols = [atom.GetSymbol() for atom in start_molecule.GetAtoms()]

    with tempfile.TemporaryDirectory() as work_directory:
        constraint_file = write_constraint_file(work_directory, atoms, angle_deg)
        optimised, n_steps, optimisation_seconds = quantum.optimise_geometry(
            quantum.rdkit_to_pyscf_atoms(start_molecule), SCAN_METHOD, constraints_file=constraint_file)

    final_coordinates = optimised.atom_coords(unit="Angstrom")
    final_atoms = [(symbol, tuple(position)) for symbol, position in zip(symbols, final_coordinates)]
    mean_field, single_point_seconds = quantum.single_point(final_atoms, SCAN_METHOD)
    orbitals = quantum.frontier_orbitals(mean_field)
    final_molecule = quantum.set_coordinates(start_molecule, final_coordinates)

    point = {
        "angle_deg": float(angle_deg),
        "achieved_angle_deg": float(rdMolTransforms.GetDihedralDeg(final_molecule.GetConformer(), *atoms)),
        "total_energy_eV": float(mean_field.e_tot) * HARTREE_TO_EV,
        "homo_eV": orbitals["homo_eV"],
        "lumo_eV": orbitals["lumo_eV"],
        "gap_eV": orbitals["gap_eV"],
        "inter_ring_bond_A": float(rdMolTransforms.GetBondLength(final_molecule.GetConformer(), atoms[1], atoms[2])),
        "optimisation_steps": n_steps,
        "wall_seconds": optimisation_seconds + single_point_seconds,
        "symbols": symbols,
        "coordinates_A": final_coordinates.tolist(),
    }
    cache_file.write_text(json.dumps(point, indent=2), encoding="utf-8")
    if verbose:
        print(f"torsion {angle_deg:3d} deg: gap {point['gap_eV']:.3f} eV, {point['wall_seconds']:.0f} s", flush=True)
    return point


def run_scan(verbose=True):
    """
    Run the full 0-180 deg scan. Each point starts from the previous optimised
    geometry (so neighbouring points stay on the same smooth path).

    Returns the list of scan points with energies made relative to the scan minimum.
    """
    base_molecule, _ = starting_molecule()
    atoms = find_scan_dihedral(base_molecule)
    points = []
    current_molecule = base_molecule
    for angle in SCAN_ANGLES_DEG:
        point = run_scan_point(current_molecule, atoms, angle, verbose)
        points.append(point)
        current_molecule = quantum.set_coordinates(base_molecule, point["coordinates_A"])

    lowest_energy = min(point["total_energy_eV"] for point in points)
    for point in points:
        point["energy_eV"] = point["total_energy_eV"] - lowest_energy
    return points


def summarise_scan(points):
    """
    The numbers the report quotes: where the minimum is, how much it costs to
    flatten the molecule, and how much the gap changes over the scan.
    """
    angles = np.array([point["angle_deg"] for point in points])
    energies = np.array([point["energy_eV"] for point in points])
    gaps = np.array([point["gap_eV"] for point in points])

    minimum_index = int(np.argmin(energies))
    planar_energies = {0.0: float(energies[angles == 0.0][0]), 180.0: float(energies[angles == 180.0][0])}
    best_planar_angle = min(planar_energies, key=planar_energies.get)
    maximum_index = int(np.argmax(energies))

    return {
        "minimum_angle_deg": float(angles[minimum_index]),
        "minimum_gap_eV": float(gaps[minimum_index]),
        # Cost of forcing the relaxed molecule flat (into its cheaper planar form).
        "barrier_to_planarity_eV": float(planar_energies[best_planar_angle] - energies[minimum_index]),
        "best_planar_angle_deg": best_planar_angle,
        "rotational_barrier_eV": float(energies[maximum_index]),
        "rotational_barrier_angle_deg": float(angles[maximum_index]),
        "gap_range_eV": [float(gaps.min()), float(gaps.max())],
        "gap_span_eV": float(gaps.max() - gaps.min()),
        "gap_minimum_angle_deg": float(angles[int(np.argmin(gaps))]),
        "gap_maximum_angle_deg": float(angles[int(np.argmax(gaps))]),
    }
