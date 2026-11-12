"""
Physical constants, unit conversions, paths and the global random seed.

Every other module imports from here, so there is exactly ONE definition of
each constant in the whole project. Values are CODATA 2018 (the SI-exact
values for h, e, k_B and c), the same values SciPy ships.
"""

from pathlib import Path

# ---------------------------------------------------------------------------
# Unit conversions
# ---------------------------------------------------------------------------

# 1 Hartree (atomic unit of energy) in electron-volts. CODATA 2018.
HARTREE_TO_EV = 27.211386245988

# ---------------------------------------------------------------------------
# Fundamental constants (SI units)
# ---------------------------------------------------------------------------

PLANCK_H = 6.62607015e-34          # J s        (exact)
SPEED_OF_LIGHT = 2.99792458e8      # m / s      (exact)
ELEMENTARY_CHARGE = 1.602176634e-19  # C        (exact)
BOLTZMANN_K = 1.380649e-23         # J / K      (exact)
VACUUM_PERMITTIVITY = 8.8541878128e-12  # F / m (CODATA 2018)
ELECTRON_MASS = 9.1093837015e-31   # kg         (CODATA 2018)

# Handy derived constant: h*c expressed in eV*nm, so that E[eV] = 1239.84 / lambda[nm]
HC_EV_NM = PLANCK_H * SPEED_OF_LIGHT / ELEMENTARY_CHARGE * 1e9

# ---------------------------------------------------------------------------
# Conditions used throughout the project
# ---------------------------------------------------------------------------

CELL_TEMPERATURE_K = 300.0          # solar-cell temperature for Shockley-Queisser
RANDOM_SEED = 42                    # used for numpy, scikit-learn and RDKit embedding

# ---------------------------------------------------------------------------
# Paths (all relative to the repository root, so a fresh clone works anywhere)
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = REPO_ROOT / "data" / "raw"
PROCESSED_DIR = REPO_ROOT / "data" / "processed"
RESULTS_DIR = REPO_ROOT / "results"
FIGURES_DIR = RESULTS_DIR / "figures"
CACHE_DIR = REPO_ROOT / "cache"
RESULTS_JSON = RESULTS_DIR / "results.json"

# MMFF94 (RDKit) reports energies in kcal/mol. 1 kcal/mol = 4184 J/mol / (N_A * e).
KCAL_PER_MOL_TO_EV = 0.0433641043

# ---------------------------------------------------------------------------
# Quantum-chemistry settings for this laptop (Intel i5-10500H: 6 cores, 16 GB RAM)
# ---------------------------------------------------------------------------

PYSCF_THREADS = 6            # one per physical core; hyper-threads add memory (one JK buffer each), little speed
PYSCF_MAX_MEMORY_MB = 2000   # per-process cap; without it the JK buffers over-allocate and crash
BASIS_SET = "6-31G*"
