"""
Every figure in the project, one function each.

Conventions (from the brief, applied by `save_figure` and `apply_style`):
  * 300 dpi PNG and an SVG of every figure, white background.
  * Axis labels >= 12 pt so they read on a projector.
  * No title baked into the image -- the deck and report add their own captions.
  * One y-axis per panel. Where the brief asks for a "second axis" (e.g. the
    solar spectrum behind the SQ curve) it is drawn as a separate panel that
    shares the x-axis, so no panel ever has two y-scales.

Colours are a fixed categorical order (validated colour-blind-safe palette):
series 1 blue, 2 orange, 3 aqua. The same entity keeps the same colour in
every figure (HF = orange, B3LYP = blue, reference = aqua, etc.).
"""

import matplotlib

matplotlib.use("Agg")  # render to files; no window needed
import matplotlib.pyplot as plt
import numpy as np

from src.constants import FIGURES_DIR, HC_EV_NM

# ---------------------------------------------------------------------------
# Palette and style
# ---------------------------------------------------------------------------

BLUE = "#2a78d6"
ORANGE = "#eb6834"
AQUA = "#1baf7a"
YELLOW = "#eda100"
MAGENTA = "#e87ba4"
GREEN = "#008300"
VIOLET = "#6250d6"
RED = "#e34948"
CATEGORICAL = [BLUE, ORANGE, AQUA, YELLOW, MAGENTA, GREEN, VIOLET, RED]

TEXT_PRIMARY = "#0b0b0b"
TEXT_SECONDARY = "#52514e"
GRID = "#e4e3df"
FAINT_FILL = "#cfd6df"

# Which method/series always gets which colour, across every figure.
METHOD_COLOURS = {"HF": ORANGE, "B3LYP": BLUE, "reference": AQUA, "MMFF94": VIOLET}


def apply_style():
    """Set matplotlib defaults for projector-readable, consistent figures."""
    plt.rcParams.update({
        "figure.facecolor": "white",
        "axes.facecolor": "white",
        "savefig.facecolor": "white",
        "font.size": 13,
        "axes.labelsize": 14,
        "xtick.labelsize": 12,
        "ytick.labelsize": 12,
        "legend.fontsize": 12,
        "axes.edgecolor": TEXT_SECONDARY,
        "axes.labelcolor": TEXT_PRIMARY,
        "xtick.color": TEXT_SECONDARY,
        "ytick.color": TEXT_SECONDARY,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.grid": True,
        "grid.color": GRID,
        "grid.linewidth": 0.8,
        "lines.linewidth": 2.0,
        "legend.frameon": False,
        "svg.fonttype": "none",
    })


def save_figure(figure, name):
    """Save a figure as <name>.png (300 dpi) and <name>.svg in results/figures, then close it."""
    FIGURES_DIR.mkdir(parents=True, exist_ok=True)
    png_path = FIGURES_DIR / f"{name}.png"
    figure.savefig(png_path, dpi=300, bbox_inches="tight")
    figure.savefig(FIGURES_DIR / f"{name}.svg", bbox_inches="tight")
    plt.close(figure)
    return png_path


# ---------------------------------------------------------------------------
# Part 1 -- Shockley-Queisser
# ---------------------------------------------------------------------------

def fig01_sq_efficiency(sq_result):
    """
    SQ efficiency vs band gap, optimum marked, with the AM1.5G photon spectrum
    shown faintly in a thin panel above on the same energy axis.
    """
    apply_style()
    gaps = sq_result["gaps_eV"]
    efficiency_percent = sq_result["efficiencies"] * 100.0

    # Spectrum as photon flux per unit ENERGY: dPhi/dE = dPhi/dlambda * |dlambda/dE| = dPhi/dlambda * hc/E^2.
    spectrum = sq_result["spectrum"]
    wavelengths_nm = spectrum["wavelength_nm"].values
    energies_eV = HC_EV_NM / wavelengths_nm
    from src.spectra import photon_flux_per_nm
    flux_per_eV = photon_flux_per_nm(spectrum) * HC_EV_NM / energies_eV ** 2
    in_range = (energies_eV >= gaps.min()) & (energies_eV <= gaps.max())

    figure, (spectrum_axis, efficiency_axis) = plt.subplots(
        2, 1, sharex=True, figsize=(8, 6.2), gridspec_kw={"height_ratios": [1, 3.2], "hspace": 0.08})

    spectrum_axis.fill_between(energies_eV[in_range], flux_per_eV[in_range] / 1e21, color=FAINT_FILL, linewidth=0)
    spectrum_axis.set_ylabel("AM1.5G\n(10²¹ s⁻¹m⁻²eV⁻¹)", fontsize=11, color=TEXT_SECONDARY)
    spectrum_axis.set_ylim(bottom=0)
    spectrum_axis.grid(False)

    efficiency_axis.plot(gaps, efficiency_percent, color=BLUE)
    optimum_gap = sq_result["grid_optimum_gap_eV"]
    optimum_efficiency = sq_result["grid_optimum_efficiency"] * 100.0
    efficiency_axis.plot([optimum_gap], [optimum_efficiency], "o", markersize=9, color=BLUE,
                         markeredgecolor="white", markeredgewidth=2, zorder=5)
    efficiency_axis.axvline(optimum_gap, color=TEXT_SECONDARY, linewidth=1, linestyle=":")
    spectrum_axis.axvline(optimum_gap, color=TEXT_SECONDARY, linewidth=1, linestyle=":")
    efficiency_axis.annotate(f"{optimum_efficiency:.1f}% at {optimum_gap:.2f} eV",
                             xy=(optimum_gap, optimum_efficiency), xytext=(optimum_gap + 0.18, optimum_efficiency + 1.2),
                             fontsize=13, color=TEXT_PRIMARY)

    efficiency_axis.set_xlabel("Absorber band gap (eV)")
    efficiency_axis.set_ylabel("Maximum efficiency (%)")
    efficiency_axis.set_xlim(gaps.min(), gaps.max())
    efficiency_axis.set_ylim(0, 37)
    return save_figure(figure, "fig01_sq_efficiency")


def fig02_jv_curve(jv):
    """J-V curve of the ideal SQ cell at the optimum gap; the max-power rectangle is shaded."""
    apply_style()
    point = jv["operating_point"]
    v_mp = point["V_mp"]
    j_mp_mA = point["J_mp"] * 0.1
    j_sc_mA = point["J_sc"] * 0.1
    v_oc = point["V_oc"]
    fill_factor = (v_mp * j_mp_mA) / (v_oc * j_sc_mA)

    figure, axis = plt.subplots(figsize=(8, 5.5))
    axis.fill_between([0, v_mp], 0, j_mp_mA, color=BLUE, alpha=0.12, linewidth=0)
    axis.plot(jv["voltage_V"], jv["current_mA_cm2"], color=BLUE)
    axis.plot([v_mp], [j_mp_mA], "o", markersize=9, color=BLUE, markeredgecolor="white", markeredgewidth=2, zorder=5)

    axis.annotate(f"Maximum power point\nV = {v_mp:.3f} V, J = {j_mp_mA:.1f} mA cm⁻²\n"
                  f"P = {v_mp * j_mp_mA:.1f} mW cm⁻²",
                  xy=(v_mp, j_mp_mA), xytext=(v_mp * 0.32, j_mp_mA * 0.45), fontsize=12, color=TEXT_PRIMARY,
                  arrowprops={"arrowstyle": "-", "color": TEXT_SECONDARY, "linewidth": 1})
    axis.annotate(f"$J_{{sc}}$ = {j_sc_mA:.1f} mA cm⁻²", xy=(0, j_sc_mA), xytext=(0.03, j_sc_mA + 1.2), fontsize=12,
                  color=TEXT_SECONDARY)
    axis.annotate(f"$V_{{oc}}$ = {v_oc:.3f} V", xy=(v_oc, 0), xytext=(v_oc - 0.27, 1.5), fontsize=12,
                  color=TEXT_SECONDARY)
    axis.text(0.03, 0.06, f"Fill factor {fill_factor:.3f}", transform=axis.transAxes, fontsize=12,
              color=TEXT_SECONDARY)

    axis.set_xlabel("Voltage (V)")
    axis.set_ylabel("Current density (mA cm⁻²)")
    axis.set_xlim(0, v_oc * 1.04)
    axis.set_ylim(0, j_sc_mA * 1.12)
    return save_figure(figure, "fig02_jv_curve")


# ---------------------------------------------------------------------------
# Part 2 -- molecular orbital isosurfaces (fig05)
# ---------------------------------------------------------------------------

ELEMENT_COLOURS = {"C": "#3d3d3d", "H": "#f2f2f2", "N": VIOLET, "O": RED, "S": YELLOW, "F": GREEN}
ELEMENT_SIZES = {"H": 70, "C": 190, "N": 200, "O": 200, "S": 260, "F": 180}
COVALENT_RADII_A = {"H": 0.31, "C": 0.76, "N": 0.71, "O": 0.66, "S": 1.05, "F": 0.57}
PHASE_POSITIVE = BLUE
PHASE_NEGATIVE = ORANGE


def molecular_frame(coordinates, symbols, first_atom=None, second_atom=None):
    """
    A rotation that lays a (roughly planar) molecule flat in the x-y plane.

    The x-axis points from `first_atom` to `second_atom` if given (e.g. donor N to
    acceptor N), otherwise along the molecule's longest direction. Returns
    (centre, rotation_matrix) such that new = (old - centre) @ rotation_matrix.
    """
    heavy = np.array([position for position, symbol in zip(coordinates, symbols) if symbol != "H"])
    centre = heavy.mean(axis=0)
    _, _, principal_axes = np.linalg.svd(heavy - centre)
    normal = principal_axes[2]
    if first_atom is not None and second_atom is not None:
        x_direction = coordinates[second_atom] - coordinates[first_atom]
    else:
        x_direction = principal_axes[0]
    x_direction = x_direction - np.dot(x_direction, normal) * normal
    x_direction = x_direction / np.linalg.norm(x_direction)
    y_direction = np.cross(normal, x_direction)
    rotation = np.column_stack([x_direction, y_direction, normal])
    return centre, rotation


def isosurface_mesh(grid, level, centre, rotation):
    """Marching-cubes triangles of one orbital at one iso-value, rotated into the molecular frame."""
    from skimage.measure import marching_cubes

    values = grid["values"]
    if (level > 0 and values.max() < level) or (level < 0 and values.min() > level):
        return None
    axes = grid["axes_A"]
    spacing = tuple(float(axis[1] - axis[0]) for axis in axes)
    vertices, faces, _, _ = marching_cubes(values, level=level, spacing=spacing)
    vertices = vertices + np.array([axis[0] for axis in axes])
    return ((vertices - centre) @ rotation)[faces]


def shaded_colours(triangles, base_colour, light_direction=(0.35, -0.45, 0.82)):
    """Simple Lambert shading: brighter where a triangle faces the light. Returns RGBA per triangle."""
    from matplotlib.colors import to_rgb

    edge_one = triangles[:, 1] - triangles[:, 0]
    edge_two = triangles[:, 2] - triangles[:, 0]
    normals = np.cross(edge_one, edge_two)
    normals = normals / (np.linalg.norm(normals, axis=1, keepdims=True) + 1e-12)
    light = np.asarray(light_direction) / np.linalg.norm(light_direction)
    brightness = 0.55 + 0.45 * np.abs(normals @ light)
    base = np.array(to_rgb(base_colour))
    rgb = np.clip(base[None, :] * brightness[:, None] + (1 - brightness[:, None]) * 0.12, 0, 1)
    return np.column_stack([rgb, np.full(len(rgb), 0.78)])


def view_projection(points, elevation_deg):
    """
    Orthographic camera looking down on the x-y (molecular) plane, tilted by
    `elevation_deg` from edge-on. Returns (screen_x, screen_y, depth); larger depth = nearer the viewer.
    """
    elevation = np.radians(elevation_deg)
    points = np.asarray(points)
    screen_x = points[..., 0]
    screen_y = points[..., 1] * np.sin(elevation) + points[..., 2] * np.cos(elevation)
    depth = -points[..., 1] * np.cos(elevation) + points[..., 2] * np.sin(elevation)
    return screen_x, screen_y, depth


def draw_triangles(axis, triangles, colours, elevation_deg, zorder):
    """Draw triangles back-to-front (painter's algorithm) as one 2D collection."""
    from matplotlib.collections import PolyCollection

    screen_x, screen_y, depth = view_projection(triangles, elevation_deg)
    order = np.argsort(depth.mean(axis=1))
    polygons = np.stack([screen_x, screen_y], axis=-1)[order]
    # Opaque layers get a hairline edge in the face colour (hides seams between triangles);
    # translucent layers get none, otherwise the overlapping edges show up as a visible mesh.
    is_opaque = bool(np.all(colours[:, 3] >= 0.999))
    axis.add_collection(PolyCollection(polygons, facecolors=colours[order],
                                       edgecolors=colours[order] if is_opaque else "none",
                                       linewidths=0.2 if is_opaque else 0.0, antialiased=is_opaque,
                                       zorder=zorder))


def draw_molecule(axis, symbols, coordinates, elevation_deg, zorder):
    """Ball-and-stick drawn in depth order: every bond and atom is placed by how near it is to the viewer."""
    from matplotlib.patches import Circle

    screen_x, screen_y, depth = view_projection(coordinates, elevation_deg)
    drawables = []
    count = len(symbols)
    for first in range(count):
        for second in range(first + 1, count):
            limit = 1.2 * (COVALENT_RADII_A[symbols[first]] + COVALENT_RADII_A[symbols[second]])
            if np.linalg.norm(coordinates[first] - coordinates[second]) < limit:
                drawables.append(("bond", (depth[first] + depth[second]) / 2 - 0.01, first, second))
    for index in range(count):
        drawables.append(("atom", depth[index], index, None))
    drawables.sort(key=lambda item: item[1])

    for step, (kind, _, first, second) in enumerate(drawables):
        layer = zorder + step * 1e-3
        if kind == "bond":
            axis.plot([screen_x[first], screen_x[second]], [screen_y[first], screen_y[second]],
                      color="#5d5d5d", linewidth=4.5, solid_capstyle="round", zorder=layer)
        else:
            radius = ATOM_RADII_DRAWN_A[symbols[first]]
            axis.add_patch(Circle((screen_x[first], screen_y[first]), radius, facecolor=ELEMENT_COLOURS[symbols[first]],
                                  edgecolor="#262626", linewidth=1.0, zorder=layer))


ATOM_RADII_DRAWN_A = {"H": 0.16, "C": 0.27, "N": 0.28, "O": 0.28, "S": 0.36, "F": 0.26}


def draw_orbital_panel(axis, grid, symbols, coordinates, centre, rotation, iso_value, label, label_text,
                       elevation_deg=62.0):
    """
    One orbital, drawn so occlusion is right: lobes below the molecular plane, then
    the molecule, then lobes above the plane (slightly see-through so atoms show).
    """
    rotated_atoms = (np.asarray(coordinates) - centre) @ rotation
    below, above = [], []
    for level, colour in ((iso_value, PHASE_POSITIVE), (-iso_value, PHASE_NEGATIVE)):
        triangles = isosurface_mesh(grid, level, centre, rotation)
        if triangles is None:
            continue
        colours = shaded_colours(triangles, colour)
        is_above = triangles[:, :, 2].mean(axis=1) > 0
        below.append((triangles[~is_above], colours[~is_above]))
        above.append((triangles[is_above], colours[is_above]))

    for triangles, colours in below:
        colours = colours.copy(); colours[:, 3] = 1.0
        draw_triangles(axis, triangles, colours, elevation_deg, zorder=1)
    draw_molecule(axis, symbols, rotated_atoms, elevation_deg, zorder=2)
    for triangles, colours in above:
        colours = colours.copy(); colours[:, 3] = 0.72
        draw_triangles(axis, triangles, colours, elevation_deg, zorder=3)

    screen_x, screen_y, _ = view_projection(rotated_atoms, elevation_deg)
    margin = 1.9
    axis.set_xlim(screen_x.min() - margin, screen_x.max() + margin)
    axis.set_ylim(screen_y.min() - margin, screen_y.max() + margin)
    axis.set_aspect("equal")
    axis.set_axis_off()
    axis.text(0.0, 1.06, label, transform=axis.transAxes, fontsize=17, fontweight="bold", color=TEXT_PRIMARY)
    axis.text(0.0, 0.99, label_text, transform=axis.transAxes, fontsize=12.5, color=TEXT_SECONDARY, va="top")


def fig05_orbitals(orbital_data, energies, donor_index=None, acceptor_index=None, centroid_fractions=None,
                   iso_value=0.05, name="fig05_orbitals", atom_labels=None):
    """
    HOMO (left) and LUMO (right) isosurfaces for one molecule (iso-value in a.u.).
    For a push-pull molecule pass the donor and acceptor atom indices: the molecule is
    laid along donor -> acceptor (left -> right), and the density-centre fractions are annotated.
    `atom_labels` ({atom_index: text}) writes e.g. "NH2 donor" under chosen atoms.
    """
    apply_style()
    symbols = orbital_data["symbols"]
    coordinates = np.asarray(orbital_data["coordinates_A"])
    centre, rotation = molecular_frame(coordinates, symbols, donor_index, acceptor_index)

    figure, axes = plt.subplots(1, 2, figsize=(14, 5.2))
    for axis, label in zip(axes, ("HOMO", "LUMO")):
        detail = f"{energies[label]:.2f} eV"
        if centroid_fractions is not None:
            detail += f"   ·   density centre {centroid_fractions[label] * 100:.0f}% of the way donor → acceptor"
        draw_orbital_panel(axis, orbital_data["orbitals"][label], symbols, coordinates, centre, rotation,
                           iso_value, label, detail)
        if atom_labels:
            rotated = (coordinates - centre) @ rotation
            screen_x, screen_y, _ = view_projection(rotated, 62.0)
            for index, text in atom_labels.items():
                axis.text(screen_x[index], screen_y.min() - 1.55, text, ha="center", fontsize=12.5,
                          color=TEXT_SECONDARY)
    figure.subplots_adjust(left=0.02, right=0.98, bottom=0.02, top=0.86, wspace=0.08)
    return save_figure(figure, name)


# ---------------------------------------------------------------------------
# Part 2 -- gaps and geometries (fig03, fig04)
# ---------------------------------------------------------------------------

def fig03_gap_vs_conjugation(molecules, ladders, reference_gaps):
    """
    HOMO-LUMO gap against the number of rings in the conjugated chain, one panel per
    ladder (thiophene, phenyl). Series: HF, B3LYP, and the experimental reference
    (optical gap) where a sourced value exists.

    molecules: {(name, method): result dict};  ladders: {panel title: [names in order]};
    reference_gaps: {name: gap_eV}.
    """
    apply_style()
    figure, axes = plt.subplots(1, len(ladders), figsize=(11, 5.6), sharey=True,
                                gridspec_kw={"width_ratios": [len(names) for names in ladders.values()]})
    axes = np.atleast_1d(axes)
    series = (("HF", "HF/6-31G*"), ("B3LYP", "B3LYP/6-31G*"))
    for axis, (title, names) in zip(axes, ladders.items()):
        rings = [molecules[(name, "B3LYP")]["rings"] for name in names]
        for method, label in series:
            gaps = [molecules[(name, method)]["gap_eV"] for name in names]
            axis.plot(rings, gaps, marker="o", markersize=9, color=METHOD_COLOURS[method], label=label,
                      markeredgecolor="white", markeredgewidth=1.5)
            for ring, gap in zip(rings, gaps):
                axis.annotate(f"{gap:.2f}", (ring, gap), xytext=(9, 4), textcoords="offset points", fontsize=11,
                              color=TEXT_SECONDARY)
        reference_points = [(ring, reference_gaps[name]) for ring, name in zip(rings, names) if name in reference_gaps]
        if reference_points:
            reference_x, reference_y = zip(*reference_points)
            axis.plot(reference_x, reference_y, marker="D", markersize=8, color=METHOD_COLOURS["reference"],
                      linestyle="--", label="Experiment (optical gap)", markeredgecolor="white", markeredgewidth=1.5)
            for ring, gap in reference_points:
                axis.annotate(f"{gap:.2f}", (ring, gap), xytext=(9, -14), textcoords="offset points", fontsize=11,
                              color=TEXT_SECONDARY)
        axis.set_xticks(rings)
        axis.set_xticklabels([f"{ring}\n{name}" for ring, name in zip(rings, names)])
        axis.set_xlim(rings[0] - 0.4, rings[-1] + 0.6)
        axis.set_xlabel(f"Rings in conjugated chain ({title})")
    axes[0].set_ylabel("HOMO–LUMO gap (eV)")
    axes[0].set_ylim(0, None)
    handles, labels = axes[0].get_legend_handles_labels()
    for axis in axes[1:]:
        for handle, label in zip(*axis.get_legend_handles_labels()):
            if label not in labels:
                handles.append(handle)
                labels.append(label)
    figure.legend(handles, labels, loc="upper center", ncol=3, bbox_to_anchor=(0.5, 1.04))
    figure.tight_layout()
    return save_figure(figure, "fig03_gap_vs_conjugation")


def fig04_mmff_vs_quantum(molecules, names, bond_molecule, bond_names=None):
    """
    (a) How much MMFF94 optimisation lowered the force-field energy of each molecule.
    (b) Heavy-atom bond lengths of one molecule: MMFF94 vs HF vs B3LYP.
    `bond_names` maps the automatic labels (e.g. "N1-C2") to chemical names (e.g. "C–NH₂").
    """
    apply_style()
    figure, (energy_axis, bond_axis) = plt.subplots(1, 2, figsize=(14, 5.8), gridspec_kw={"width_ratios": [1, 1.25]})

    drops = [molecules[(name, "B3LYP")]["mmff94_energy_drop_eV"] for name in names]
    positions = np.arange(len(names))
    energy_axis.set_axisbelow(True)
    energy_axis.barh(positions, drops, color=METHOD_COLOURS["MMFF94"], height=0.6)
    for position, drop in zip(positions, drops):
        energy_axis.text(drop, position, f" {drop:.2f}", va="center", fontsize=11, color=TEXT_SECONDARY)
    energy_axis.set_yticks(positions)
    energy_axis.set_yticklabels(names)
    energy_axis.invert_yaxis()
    energy_axis.set_xlabel("MMFF94 energy lowered by\nforce-field optimisation (eV)")
    energy_axis.grid(axis="y", visible=False)
    energy_axis.set_xlim(0, max(drops) * 1.25)
    energy_axis.text(-0.02, 1.03, "a", transform=energy_axis.transAxes, fontsize=16, fontweight="bold")

    hf = molecules[(bond_molecule, "HF")]
    b3lyp = molecules[(bond_molecule, "B3LYP")]
    unique = {}
    for mmff_bond, hf_bond, dft_bond in zip(b3lyp["heavy_atom_bonds_mmff94"], hf["heavy_atom_bonds"],
                                            b3lyp["heavy_atom_bonds"]):
        key = round(dft_bond["length_A"], 3)
        if key not in unique:   # symmetry-equivalent bonds are shown once
            name = (bond_names or {}).get(dft_bond["label"], dft_bond["label"])
            unique[key] = (name, mmff_bond["length_A"], hf_bond["length_A"], dft_bond["length_A"])
    rows = sorted(unique.values(), key=lambda row: row[3])
    x_positions = np.arange(len(rows))
    for offset, (method, column) in zip((-0.18, 0.0, 0.18), (("MMFF94", 1), ("HF", 2), ("B3LYP", 3))):
        bond_axis.plot(x_positions + offset, [row[column] for row in rows], "o", markersize=9,
                       color=METHOD_COLOURS[method], label=method, markeredgecolor="white", markeredgewidth=1.2)
    bond_axis.set_xticks(x_positions)
    bond_axis.set_xticklabels([row[0] for row in rows], rotation=30, ha="right")
    bond_axis.set_ylabel(f"Bond length in {bond_molecule} (Å)")
    bond_axis.legend(loc="upper left", ncol=3)
    bond_axis.text(-0.02, 1.03, "b", transform=bond_axis.transAxes, fontsize=16, fontweight="bold")
    figure.tight_layout()
    return save_figure(figure, "fig04_mmff_vs_quantum")


# ---------------------------------------------------------------------------
# Part 3 -- torsion scan (fig06 PES, fig07 energy + gap)
# ---------------------------------------------------------------------------

def _torsion_arrays(points):
    """Angles (deg), relative energies (meV) and gaps (eV) from the scan points."""
    angles = np.array([point["angle_deg"] for point in points])
    energies_meV = np.array([point["energy_eV"] for point in points]) * 1000.0
    gaps = np.array([point["gap_eV"] for point in points])
    return angles, energies_meV, gaps


def fig06_torsion_pes(points, summary):
    """Relaxed potential energy surface of bithiophene along the S-C-C-S dihedral."""
    apply_style()
    angles, energies_meV, _ = _torsion_arrays(points)
    figure, axis = plt.subplots(figsize=(8.5, 5))
    axis.plot(angles, energies_meV, "-o", color=BLUE, markersize=7, markeredgecolor="white", markeredgewidth=1.2)
    minimum = summary["minimum_angle_deg"]
    axis.plot([minimum], [0.0], "o", markersize=12, color=BLUE, markeredgecolor="white", markeredgewidth=2, zorder=5)
    axis.annotate(f"minimum {minimum:.0f}°", (minimum, 0.0), xytext=(0, 14), textcoords="offset points",
                  ha="center", fontsize=12.5)
    axis.set_xlabel("S–C–C–S dihedral angle (°)")
    axis.set_ylabel("Relative energy (meV)")
    axis.set_xticks(range(0, 181, 30))
    axis.set_xlim(-5, 185)
    top = energies_meV.max() * 1.12
    axis.set_ylim(-energies_meV.max() * 0.05, top)
    for label, x in (("syn-planar", 0), ("perpendicular", 90), ("anti-planar", 180)):
        axis.text(x, top, label, ha="center", va="bottom", fontsize=11, color=TEXT_SECONDARY)
    figure.tight_layout()
    return save_figure(figure, "fig06_torsion_pes")


def fig07_torsion_gap(points, summary):
    """Energy (top) and HOMO-LUMO gap (bottom) vs dihedral, stacked on one shared x-axis."""
    apply_style()
    angles, energies_meV, gaps = _torsion_arrays(points)
    figure, (energy_axis, gap_axis) = plt.subplots(2, 1, sharex=True, figsize=(8.5, 7.5),
                                                   gridspec_kw={"hspace": 0.1})
    energy_axis.plot(angles, energies_meV, "-o", color=BLUE, markersize=6, markeredgecolor="white")
    energy_axis.set_ylabel("Relative energy\n(meV)")
    gap_axis.plot(angles, gaps, "-o", color=ORANGE, markersize=6, markeredgecolor="white")
    gap_axis.set_ylabel("HOMO–LUMO gap\n(eV)")

    minimum = summary["minimum_angle_deg"]
    gap_minimum_angle = summary["gap_minimum_angle_deg"]
    for axis in (energy_axis, gap_axis):
        axis.axvline(minimum, color=BLUE, linewidth=1, linestyle=":")
        axis.axvline(gap_minimum_angle, color=ORANGE, linewidth=1, linestyle=":")
    energy_axis.text(minimum - 3, energies_meV.max() * 0.45, f"preferred\nshape {minimum:.0f}°",
                     ha="right", va="center", fontsize=12, color=TEXT_PRIMARY)
    # Label the smallest gap from clear space under the peak, with a leader line to the point.
    gap_axis.annotate(f"smallest gap: {gap_minimum_angle:.0f}° ({gaps.min():.2f} eV)",
                      xy=(gap_minimum_angle, gaps.min()), xytext=(90, gaps.min() + 0.02), ha="center",
                      va="bottom", fontsize=12, color=TEXT_PRIMARY,
                      arrowprops={"arrowstyle": "-", "color": TEXT_SECONDARY, "linewidth": 1,
                                  "shrinkA": 2, "shrinkB": 6})
    gap_axis.set_xlabel("S–C–C–S dihedral angle (°)")
    gap_axis.set_xticks(range(0, 181, 30))
    gap_axis.set_xlim(-5, 185)
    return save_figure(figure, "fig07_torsion_gap")
