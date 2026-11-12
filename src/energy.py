"""
Part 7: what did the computation itself cost, and how far is it from the physical limit?

Every timing here is MEASURED (wall-clock seconds recorded when each calculation ran
and stored in cache/). Energy is then ESTIMATED as

    energy = CPU TDP x wall time

which is an UPPER BOUND, not a measurement: the CPU does not draw its full rated
power the whole time, and the rest of the laptop (screen, memory, disk) is ignored.
Every assumed constant is listed in ASSUMPTIONS and written to results.json.
"""

import glob
import json

import numpy as np

from src.constants import BOLTZMANN_K, CACHE_DIR, CELL_TEMPERATURE_K, ELEMENTARY_CHARGE

SECONDS_PER_YEAR = 365.25 * 24 * 3600
JOULES_PER_KWH = 3.6e6

ASSUMPTIONS = {
    "cpu": {
        "value": "Intel Core i5-10500H, 6 cores / 12 threads, 2.5 GHz base",
        "source": "detected on this laptop (Windows CIM query); specifications from Intel ARK",
    },
    "cpu_tdp_W": {
        "value": 45.0,
        "source": "Intel ARK, Core i5-10500H processor base power (TDP) 45 W",
        "note": "energy = TDP x time is an upper-bound estimate, not a measurement",
    },
    "electricity_tariff_INR_per_kWh": {
        "value": 5.80,
        "source": ("BESCOM domestic LT-2(a), flat energy charge for FY 2025-26 under the KERC tariff order 2025, "
                   "as reported by several bill-calculator sites"),
        "status": ("secondary source - the KERC order itself could not be read; confirm against the order on "
                   "kerc.karnataka.gov.in. Fixed charges and surcharges are excluded (energy charge only)"),
    },
    "grid_emission_factor_kgCO2_per_kWh": {
        "value": 0.727,
        "source": ("Central Electricity Authority, CO2 Baseline Database for the Indian Power Sector, "
                   "User Guide Version 20.0 (Dec 2024): weighted average emission factor FY 2023-24, "
                   "0.727 tCO2/MWh"),
    },
    "temperature_K": {
        "value": CELL_TEMPERATURE_K,
        "source": "same 300 K as the Shockley-Queisser calculation",
    },
    "peak_double_precision_flops_per_cycle_per_core": {
        "value": 16,
        "source": "two 256-bit AVX2 FMA units per core: 2 x 4 doubles x 2 operations (Skylake/Comet Lake)",
        "note": "peak, not achieved; used only for the order-of-magnitude Landauer comparison",
    },
    "cores_for_peak_flops": {"value": 6, "source": "physical cores of the i5-10500H"},
    "base_clock_Hz": {"value": 2.5e9, "source": "Intel ARK base frequency"},
}


def value(name):
    """An assumed constant's numerical value."""
    return ASSUMPTIONS[name]["value"]


def energy_cost_carbon(seconds):
    """Energy (J, kWh), cost (INR) and CO2 (kg) for a wall time, under the stated assumptions."""
    joules = value("cpu_tdp_W") * seconds
    kwh = joules / JOULES_PER_KWH
    return {
        "wall_seconds": float(seconds),
        "energy_J": float(joules),
        "energy_kWh": float(kwh),
        "cost_INR": float(kwh * value("electricity_tariff_INR_per_kWh")),
        "co2_kg": float(kwh * value("grid_emission_factor_kgCO2_per_kWh")),
    }


def quantum_timings():
    """Every cached HF/B3LYP optimisation and torsion-scan point, with its measured wall time."""
    rows = []
    for path in sorted(glob.glob(str(CACHE_DIR / "quantum" / "*.json"))):
        record = json.loads(open(path, encoding="utf-8").read())
        rows.append({"name": record["name"], "method": record["method"], "n_heavy_atoms": record["n_heavy_atoms"],
                     "n_basis_functions": record["n_basis_functions"], "wall_seconds": record["wall_seconds"],
                     "kind": "screening candidate" if record["name"].startswith("candidate_") else "Part 2 molecule"})
    for path in sorted(glob.glob(str(CACHE_DIR / "torsion" / "angle_*.json"))):
        record = json.loads(open(path, encoding="utf-8").read())
        rows.append({"name": f"bithiophene scan {record['angle_deg']:.0f} deg", "method": "B3LYP",
                     "n_heavy_atoms": 10, "n_basis_functions": None, "wall_seconds": record["wall_seconds"],
                     "kind": "torsion scan point"})
    return rows


def landauer_comparison(total_energy_J):
    """
    Landauer's principle: erasing one bit of information must dissipate at least kT ln 2.

    Compared here with the energy a real CPU spends per floating-point operation at its
    peak rate (an optimistic figure for the CPU, so the gap shown is a LOWER bound).
    """
    temperature = value("temperature_K")
    landauer_J = BOLTZMANN_K * temperature * np.log(2.0)
    peak_flops = (value("peak_double_precision_flops_per_cycle_per_core") * value("cores_for_peak_flops")
                  * value("base_clock_Hz"))
    joules_per_flop = value("cpu_tdp_W") / peak_flops
    return {
        "temperature_K": temperature,
        "landauer_limit_J_per_bit": float(landauer_J),
        "landauer_limit_eV_per_bit": float(landauer_J / ELEMENTARY_CHARGE),
        "cpu_peak_flops_per_second": float(peak_flops),
        "cpu_energy_per_flop_J": float(joules_per_flop),
        "ratio_energy_per_flop_to_landauer": float(joules_per_flop / landauer_J),
        "orders_of_magnitude_above_landauer": float(np.log10(joules_per_flop / landauer_J)),
        "project_energy_J": float(total_energy_J),
        "bits_erasable_at_landauer_limit_with_project_energy": float(total_energy_J / landauer_J),
        "note": ("one floating-point operation erases more than one bit, so per-bit the real CPU is "
                 "somewhat closer to the limit than this ratio says; the order of magnitude is the point"),
    }
