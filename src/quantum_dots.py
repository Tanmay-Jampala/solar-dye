"""
Part 6: quantum dots, a band gap tuned by size alone (the Brus equation).

    E_gap(R) = E_bulk + h^2 / (8 R^2) * (1/m_e* + 1/m_h*) - 1.8 e^2 / (4 pi eps0 eps_r R)

  * E_bulk: the band gap of the large crystal.
  * The second term is the particle-in-a-sphere confinement energy of the electron and
    the hole (effective masses m_e*, m_h* in units of the free-electron mass). Smaller dot,
    larger confinement, larger gap: the same physics as conjugation length in a dye.
  * The third term is the Coulomb attraction between electron and hole, screened by the
    crystal's dielectric constant eps_r. It lowers the gap slightly.

Two materials:
  * CdSe, the textbook quantum dot. Its bulk gap (1.74 eV) is ALREADY above the
    Shockley-Queisser optimum, and confinement only raises it, so no CdSe dot of any
    size reaches 1.34 eV. It is the right material for colour, not for this target.
  * PbS, the dot actually used in quantum-dot solar cells. Bulk gap 0.41 eV, so
    confinement can lift it to exactly 1.34 eV.

Each Brus curve is compared with an EXPERIMENTAL sizing curve (absorption peak vs
measured size) from the literature, because the effective-mass model is known to
overestimate confinement in very small dots (the bands are not parabolic that far from
the band edge). The comparison is the honest test of the model.
"""

import numpy as np
from scipy.optimize import brentq

from src.constants import ELECTRON_MASS, ELEMENTARY_CHARGE, HC_EV_NM, PLANCK_H, VACUUM_PERMITTIVITY

# Material parameters. The effective masses, dielectric constants and bulk gaps are the
# values these sources quote; the page should be confirmed against the original before
# it is cited in the report.
MATERIALS = {
    "CdSe": {
        "bulk_gap_eV": 1.74,
        "electron_effective_mass": 0.13,
        "hole_effective_mass": 0.45,
        "relative_permittivity": 10.6,
        "source": ("Kippeny, Swafford & Rosenthal, J. Chem. Educ. 79, 1094 (2002), CdSe parameters "
                   "for the Brus equation; bulk gap at 300 K"),
        "status": "values as quoted by the source; confirm page before citing",
    },
    "PbS": {
        "bulk_gap_eV": 0.41,
        "electron_effective_mass": 0.085,
        "hole_effective_mass": 0.085,
        "relative_permittivity": 17.2,
        "source": ("Wise, Acc. Chem. Res. 33, 773 (2000), 'Lead salt quantum dots: the limit of strong "
                   "quantum confinement' (m_e* = m_h* = 0.085, high-frequency eps = 17.2, 0.41 eV at 300 K)"),
        "status": "values as quoted by the source; confirm page before citing",
    },
}

# Experimental sizing curves (first excitonic absorption peak vs measured diameter).
EXPERIMENTAL_SIZING = {
    "CdSe": {
        "source": "Yu, Qu, Guo & Peng, Chem. Mater. 15, 2854 (2003): diameter from absorption peak",
        "formula": "D(nm) = 1.6122e-9 L^4 - 2.6575e-6 L^3 + 1.6242e-3 L^2 - 0.4277 L + 41.57 (L in nm)",
        "valid_wavelength_nm": (470.0, 650.0),
    },
    "PbS": {
        "source": "Moreels et al., ACS Nano 3, 3023 (2009): absorption peak from diameter",
        "formula": "E0(eV) = 0.41 + 1 / (0.0252 d^2 + 0.283 d) (d in nm)",
        "valid_diameter_nm": (2.0, 10.0),
    },
}

RADIUS_RANGE_NM = (1.0, 6.0)
RADIUS_STEP_NM = 0.01
BRUS_COULOMB_COEFFICIENT = 1.8


def brus_gap_eV(radius_nm, material):
    """Band gap (eV) of a spherical nanocrystal of the given radius (nm), from the Brus equation."""
    parameters = MATERIALS[material]
    radius_m = np.asarray(radius_nm, dtype=float) * 1e-9
    reduced_inverse_mass = (1.0 / parameters["electron_effective_mass"]
                            + 1.0 / parameters["hole_effective_mass"]) / ELECTRON_MASS
    confinement_J = PLANCK_H ** 2 / (8.0 * radius_m ** 2) * reduced_inverse_mass
    coulomb_J = (BRUS_COULOMB_COEFFICIENT * ELEMENTARY_CHARGE ** 2
                 / (4.0 * np.pi * VACUUM_PERMITTIVITY * parameters["relative_permittivity"] * radius_m))
    return parameters["bulk_gap_eV"] + (confinement_J - coulomb_J) / ELEMENTARY_CHARGE


def brus_terms_eV(radius_nm, material):
    """The confinement and Coulomb terms separately (eV), for explaining the curve."""
    parameters = MATERIALS[material]
    total = brus_gap_eV(radius_nm, material)
    radius_m = np.asarray(radius_nm, dtype=float) * 1e-9
    coulomb_eV = (BRUS_COULOMB_COEFFICIENT * ELEMENTARY_CHARGE
                  / (4.0 * np.pi * VACUUM_PERMITTIVITY * parameters["relative_permittivity"] * radius_m))
    return {"confinement_eV": total - parameters["bulk_gap_eV"] + coulomb_eV, "coulomb_eV": coulomb_eV}


def radius_for_gap_nm(target_gap_eV, material, model="brus"):
    """
    Radius (nm) at which the dot's gap equals the target, or None if no radius in
    RADIUS_RANGE_NM reaches it (e.g. CdSe, whose bulk gap is already above 1.34 eV).
    """
    function = brus_gap_eV if model == "brus" else experimental_gap_eV
    difference = lambda radius: float(np.ravel(function(radius, material))[0]) - target_gap_eV  # noqa: E731
    # Bracket the crossing on a fine grid (the experimental curve is NaN outside its valid
    # range), then solve exactly between the two grid points either side of it.
    radii = np.arange(RADIUS_RANGE_NM[0], RADIUS_RANGE_NM[1] + 1e-9, 0.01)
    values = np.array([difference(radius) for radius in radii])
    crossings = np.where(np.isfinite(values[:-1]) & np.isfinite(values[1:]) & (values[:-1] * values[1:] <= 0))[0]
    if len(crossings) == 0:
        return None
    index = crossings[0]
    return float(brentq(difference, radii[index], radii[index + 1], xtol=1e-8))


def experimental_gap_eV(radius_nm, material):
    """
    Gap (eV) from the experimental sizing curve at the given radius (nm); NaN outside its valid range.

    For CdSe the published fit gives diameter as a function of wavelength, so it is
    inverted numerically on a fine wavelength grid.
    """
    radius_nm = np.atleast_1d(np.asarray(radius_nm, dtype=float))
    diameter_nm = 2.0 * radius_nm
    if material == "PbS":
        low, high = EXPERIMENTAL_SIZING["PbS"]["valid_diameter_nm"]
        gap = 0.41 + 1.0 / (0.0252 * diameter_nm ** 2 + 0.283 * diameter_nm)
        return np.where((diameter_nm >= low) & (diameter_nm <= high), gap, np.nan)
    if material == "CdSe":
        low, high = EXPERIMENTAL_SIZING["CdSe"]["valid_wavelength_nm"]
        wavelengths = np.linspace(low, high, 20001)
        diameters = cdse_diameter_from_wavelength_nm(wavelengths)
        order = np.argsort(diameters)
        wavelength = np.interp(diameter_nm, diameters[order], wavelengths[order], left=np.nan, right=np.nan)
        return HC_EV_NM / wavelength
    raise ValueError(material)


def cdse_diameter_from_wavelength_nm(wavelength_nm):
    """Yu et al. (2003) empirical CdSe diameter (nm) from the first absorption peak (nm)."""
    L = np.asarray(wavelength_nm, dtype=float)
    return 1.6122e-9 * L ** 4 - 2.6575e-6 * L ** 3 + 1.6242e-3 * L ** 2 - 0.4277 * L + 41.57


def wavelength_to_rgb(wavelength_nm):
    """
    Approximate display colour (r, g, b in 0-1) of monochromatic light, after Dan Bruton's
    widely used piecewise-linear approximation (380-780 nm). Outside that range the light
    is invisible and None is returned.
    """
    w = float(wavelength_nm)
    if w < 380.0 or w > 780.0:
        return None
    if w < 440.0:
        r, g, b = -(w - 440.0) / 60.0, 0.0, 1.0
    elif w < 490.0:
        r, g, b = 0.0, (w - 440.0) / 50.0, 1.0
    elif w < 510.0:
        r, g, b = 0.0, 1.0, -(w - 510.0) / 20.0
    elif w < 580.0:
        r, g, b = (w - 510.0) / 70.0, 1.0, 0.0
    elif w < 645.0:
        r, g, b = 1.0, -(w - 645.0) / 65.0, 0.0
    else:
        r, g, b = 1.0, 0.0, 0.0
    # The eye is less sensitive at the edges of the visible range: fade intensity there.
    if w < 420.0:
        factor = 0.3 + 0.7 * (w - 380.0) / 40.0
    elif w > 700.0:
        factor = 0.3 + 0.7 * (780.0 - w) / 80.0
    else:
        factor = 1.0
    gamma = 0.8
    return tuple(float((channel * factor) ** gamma) if channel > 0 else 0.0 for channel in (r, g, b))


def brus_curve(material):
    """Radius grid with Brus gap, experimental gap, wavelength and display colour for one material."""
    radii = np.round(np.arange(RADIUS_RANGE_NM[0], RADIUS_RANGE_NM[1] + RADIUS_STEP_NM / 2, RADIUS_STEP_NM), 4)
    gaps = brus_gap_eV(radii, material)
    experimental = experimental_gap_eV(radii, material)
    wavelengths = HC_EV_NM / gaps
    return {
        "radius_nm": radii,
        "gap_eV": gaps,
        "experimental_gap_eV": experimental,
        "wavelength_nm": wavelengths,
        "rgb": [wavelength_to_rgb(value) for value in wavelengths],
    }
