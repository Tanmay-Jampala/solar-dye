// Physical constants shared by derived displays (rule 1: derived = a results.json value + a constant).
// h·c in eV·nm, from the exact SI values of h and c and the elementary charge.
export const HC_EV_NM = 1239.841984;

/** Photon wavelength in nm for a photon energy in eV. */
export const wavelengthNm = (eV: number) => HC_EV_NM / eV;
