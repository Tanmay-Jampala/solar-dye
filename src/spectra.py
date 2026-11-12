"""
Part 1 -- The thermodynamic ceiling: the Shockley-Queisser detailed-balance limit.

The idea (Shockley & Queisser, J. Appl. Phys. 32, 510, 1961):

  * Every photon from the sun with energy above the band gap Eg creates exactly
    one electron-hole pair (short-circuit current J_sc). Photons below the gap
    are lost; the excess energy of photons above it is lost as heat.
  * A cell at temperature T is also a black body. By detailed balance it must
    re-emit photons above its gap, and each emitted photon is a recombined
    electron-hole pair: that is the unavoidable dark current J_0.
  * The cell then behaves like an ideal diode:  J(V) = J_sc - J_0 [exp(qV/kT) - 1].
    Maximising the power J*V over V gives the best possible efficiency.

The input spectrum is ASTM G173-03 AM1.5 global tilt, tabulated in W m^-2 nm^-1.
The single most common bug is integrating that *power* density where a photon
*count* is needed; the conversion is done explicitly in `photon_flux_per_nm`.
"""

import numpy as np
import pandas as pd
from scipy.integrate import quad
from scipy.optimize import minimize_scalar

from src.constants import (BOLTZMANN_K, CELL_TEMPERATURE_K, ELEMENTARY_CHARGE, HC_EV_NM, PLANCK_H,
                           RAW_DIR, SPEED_OF_LIGHT)


def load_am15g():
    """
    Load the ASTM G173-03 AM1.5 global-tilt spectrum.

    Returns a DataFrame with columns:
        wavelength_nm, irradiance_W_m2_nm   (as tabulated, 280-4000 nm, 2002 rows)
    """
    table = pd.read_csv(RAW_DIR / "ASTMG173.csv", skiprows=1)
    spectrum = pd.DataFrame({
        "wavelength_nm": table["wavelength"].astype(float),
        "irradiance_W_m2_nm": table["global"].astype(float),
    })
    assert len(spectrum) == 2002, "ASTM G173 table should have 2002 wavelengths"
    return spectrum


def total_irradiance(spectrum):
    """Integrate the spectral irradiance over wavelength: total incident power in W/m^2 (about 1000)."""
    return float(np.trapezoid(spectrum["irradiance_W_m2_nm"], spectrum["wavelength_nm"]))


def photon_flux_per_nm(spectrum):
    """
    Convert spectral irradiance (W m^-2 nm^-1) into spectral photon flux
    (photons s^-1 m^-2 nm^-1).

    A photon of wavelength lambda carries energy h*c/lambda, so the number of
    photons per second in each nm-wide slice is (power in that slice) / (h*c/lambda).
    """
    wavelength_m = spectrum["wavelength_nm"].values * 1e-9
    energy_per_photon_J = PLANCK_H * SPEED_OF_LIGHT / wavelength_m
    return spectrum["irradiance_W_m2_nm"].values / energy_per_photon_J


def cumulative_photon_flux_above(spectrum):
    """
    Build a lookup for 'how many solar photons per second per m^2 have energy >= E'.

    Returns (energies_eV ascending, flux_above) where flux_above[i] is the photon flux
    with energy at least energies_eV[i]. Photons above energy E are photons BELOW
    wavelength hc/E, so we integrate from the short-wavelength end of the table.
    """
    wavelengths_nm = spectrum["wavelength_nm"].values
    flux_per_nm = photon_flux_per_nm(spectrum)

    # Trapezoid slices between neighbouring wavelengths, accumulated from 280 nm upwards.
    slice_flux = 0.5 * (flux_per_nm[1:] + flux_per_nm[:-1]) * np.diff(wavelengths_nm)
    flux_below_wavelength = np.concatenate([[0.0], np.cumsum(slice_flux)])

    energies_eV = HC_EV_NM / wavelengths_nm
    # Reverse so energies are ascending (np.interp needs that).
    return energies_eV[::-1], flux_below_wavelength[::-1]


def short_circuit_current(gap_eV, flux_lookup):
    """J_sc in A/m^2: elementary charge times the photon flux above the gap (one electron per photon)."""
    energies_eV, flux_above = flux_lookup
    photons_above_gap = np.interp(gap_eV, energies_eV, flux_above, left=flux_above[0], right=0.0)
    return ELEMENTARY_CHARGE * photons_above_gap


def dark_saturation_current(gap_eV, temperature_K=CELL_TEMPERATURE_K):
    """
    J_0 in A/m^2: radiative recombination current of a black body at the cell temperature.

    Photon flux emitted by a black body (from one face, into a hemisphere) above energy Eg:
        Phi = (2 pi / (h^3 c^2)) * integral_{Eg}^{inf} E^2 / (exp(E/kT) - 1) dE
    The integral is done in eV-scaled units to keep numbers well conditioned.
    """
    thermal_energy_eV = BOLTZMANN_K * temperature_K / ELEMENTARY_CHARGE

    def integrand(energy_eV):
        return energy_eV ** 2 / np.expm1(energy_eV / thermal_energy_eV)

    upper_limit_eV = gap_eV + 60.0 * thermal_energy_eV   # exp(-60) is negligible
    integral_eV3, _ = quad(integrand, gap_eV, upper_limit_eV, epsabs=0, epsrel=1e-10, limit=200)

    # Convert eV^3 to J^3, then apply the prefactor.
    integral_J3 = integral_eV3 * ELEMENTARY_CHARGE ** 3
    prefactor = 2.0 * np.pi / (PLANCK_H ** 3 * SPEED_OF_LIGHT ** 2)
    photon_flux = prefactor * integral_J3
    return ELEMENTARY_CHARGE * photon_flux


def current_density(voltage_V, j_sc, j_0, temperature_K=CELL_TEMPERATURE_K):
    """Ideal-diode J-V relation: J = J_sc - J_0 * (exp(qV/kT) - 1), in A/m^2."""
    thermal_voltage = BOLTZMANN_K * temperature_K / ELEMENTARY_CHARGE
    return j_sc - j_0 * np.expm1(voltage_V / thermal_voltage)


def maximum_power_point(gap_eV, flux_lookup, temperature_K=CELL_TEMPERATURE_K):
    """
    Find the voltage that maximises P = J*V for a cell with the given gap.

    Returns a dict with J_sc, J_0, V_oc, V_mp, J_mp, P_max (SI units).
    """
    j_sc = short_circuit_current(gap_eV, flux_lookup)
    j_0 = dark_saturation_current(gap_eV, temperature_K)
    thermal_voltage = BOLTZMANN_K * temperature_K / ELEMENTARY_CHARGE

    if j_sc <= 0.0:
        return {"J_sc": 0.0, "J_0": j_0, "V_oc": 0.0, "V_mp": 0.0, "J_mp": 0.0, "P_max": 0.0}

    open_circuit_voltage = thermal_voltage * np.log1p(j_sc / j_0)

    def negative_power(voltage_V):
        return -voltage_V * current_density(voltage_V, j_sc, j_0, temperature_K)

    best = minimize_scalar(negative_power, bounds=(0.0, open_circuit_voltage), method="bounded",
                           options={"xatol": 1e-9})
    v_mp = float(best.x)
    j_mp = float(current_density(v_mp, j_sc, j_0, temperature_K))
    return {"J_sc": j_sc, "J_0": j_0, "V_oc": open_circuit_voltage,
            "V_mp": v_mp, "J_mp": j_mp, "P_max": v_mp * j_mp}


def sq_efficiency(gap_eV, flux_lookup, incident_power_W_m2):
    """Shockley-Queisser efficiency (fraction, 0-1) for a single band gap in eV."""
    return maximum_power_point(gap_eV, flux_lookup)["P_max"] / incident_power_W_m2


def shockley_queisser_curve(gap_min=0.3, gap_max=3.0, step=0.01):
    """
    Compute the SQ efficiency on a grid of band gaps.

    Returns a dict with the gap grid, efficiencies (fractions), the optimum and the
    inputs used, ready to be written to results.json.
    """
    spectrum = load_am15g()
    incident_power = total_irradiance(spectrum)
    flux_lookup = cumulative_photon_flux_above(spectrum)

    number_of_points = int(round((gap_max - gap_min) / step)) + 1
    gaps_eV = np.round(np.linspace(gap_min, gap_max, number_of_points), 4)
    efficiencies = np.array([sq_efficiency(gap, flux_lookup, incident_power) for gap in gaps_eV])

    best_index = int(np.argmax(efficiencies))
    # Refine the optimum between grid points so it is not quantised to 0.01 eV.
    refined = minimize_scalar(lambda gap: -sq_efficiency(gap, flux_lookup, incident_power),
                              bounds=(gaps_eV[max(best_index - 1, 0)], gaps_eV[min(best_index + 1, len(gaps_eV) - 1)]),
                              method="bounded", options={"xatol": 1e-5})

    return {
        "gaps_eV": gaps_eV,
        "efficiencies": efficiencies,
        "grid_optimum_gap_eV": float(gaps_eV[best_index]),
        "grid_optimum_efficiency": float(efficiencies[best_index]),
        "optimum_gap_eV": float(refined.x),
        "optimum_efficiency": float(-refined.fun),
        "incident_power_W_m2": incident_power,
        "flux_lookup": flux_lookup,
        "spectrum": spectrum,
    }


def efficiency_for_gaps(gaps_by_name, flux_lookup, incident_power):
    """Map {name: gap_eV} to {name: {gap_eV, sq_efficiency}} -- 'where this dye sits on the curve'."""
    placed = {}
    for name, gap in gaps_by_name.items():
        placed[name] = {"gap_eV": float(gap), "sq_efficiency": float(sq_efficiency(gap, flux_lookup, incident_power))}
    return placed


def jv_curve(gap_eV, flux_lookup, number_of_points=400):
    """J-V and P-V curves (J in mA/cm^2, P in mW/cm^2) for one gap, from 0 V to V_oc."""
    operating_point = maximum_power_point(gap_eV, flux_lookup)
    voltages = np.linspace(0.0, operating_point["V_oc"], number_of_points)
    currents_A_m2 = current_density(voltages, operating_point["J_sc"], operating_point["J_0"])
    # 1 A/m^2 = 0.1 mA/cm^2;  1 W/m^2 = 0.1 mW/cm^2
    return {
        "voltage_V": voltages,
        "current_mA_cm2": currents_A_m2 * 0.1,
        "power_mW_cm2": voltages * currents_A_m2 * 0.1,
        "operating_point": operating_point,
    }
