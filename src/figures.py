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
import matplotlib.colors
import matplotlib.ticker
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
        "svg.hashsalt": "solar-dye",  # fixed element ids, so re-running gives identical SVGs
    })


def save_figure(figure, name):
    """Save a figure as <name>.png (300 dpi) and <name>.svg in results/figures, then close it."""
    FIGURES_DIR.mkdir(parents=True, exist_ok=True)
    png_path = FIGURES_DIR / f"{name}.png"
    figure.savefig(png_path, dpi=300, bbox_inches="tight")
    figure.savefig(FIGURES_DIR / f"{name}.svg", bbox_inches="tight", metadata={"Date": None})
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


# ---------------------------------------------------------------------------
# Part 4 -- descriptors (fig09 distributions, fig10 correlations)
# ---------------------------------------------------------------------------

def _panel_letter(axis, letter):
    """Bold panel letter in the top-left corner, outside the plot area."""
    axis.text(-0.02, 1.03, letter, transform=axis.transAxes, fontsize=16, fontweight="bold")


def fig09_descriptor_distributions(table, gaps, labels):
    """Histogram of every descriptor (and the gap) over the cleaned QM9 set, one small panel each."""
    apply_style()
    names = list(labels)
    columns = 4
    rows = int(np.ceil((len(names) + 1) / columns))
    figure, axes = plt.subplots(rows, columns, figsize=(16, 3.3 * rows))
    axes = axes.ravel()
    series = [(labels[name], table[name].to_numpy(dtype=float), BLUE) for name in names]
    series.append(("HOMO–LUMO gap (eV)", np.asarray(gaps, dtype=float), AQUA))
    for axis, (label, values, colour) in zip(axes, series):
        integer_valued = np.allclose(values, np.round(values)) and values.max() - values.min() <= 40
        if integer_valued:
            bins = np.arange(values.min() - 0.5, values.max() + 1.5, 1.0)
        else:
            bins = 50
        axis.set_axisbelow(True)
        axis.hist(values, bins=bins, color=colour, edgecolor="white", linewidth=0.4)
        axis.set_xlabel(label, fontsize=12)
        axis.grid(axis="x", visible=False)
        axis.tick_params(labelsize=11)
        axis.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(
            lambda value, _: f"{value / 1000:.0f}k" if value >= 1000 else f"{value:.0f}"))
    for axis in axes[len(series):]:
        axis.set_visible(False)
    for axis in axes[::columns]:
        axis.set_ylabel("Molecules", fontsize=12)
    figure.tight_layout()
    return save_figure(figure, "fig09_descriptor_distributions")


def diverging_colourmap():
    """Blue (negative) -> warm grey (zero) -> orange (positive): two hues and a neutral midpoint."""
    from matplotlib.colors import LinearSegmentedColormap
    return LinearSegmentedColormap.from_list("blue_grey_orange", [BLUE, "#f1f0ec", ORANGE])


def fig10_correlation_heatmap(table, gaps, labels):
    """Pearson correlation between every pair of descriptors and the gap (gap is the last row/column)."""
    apply_style()
    names = list(labels)
    frame = table[names].astype(float).copy()
    frame["gap"] = np.asarray(gaps, dtype=float)
    matrix = frame.corr(method="pearson").to_numpy()
    tick_labels = [labels[name].split(" (")[0] for name in names] + ["HOMO–LUMO gap"]

    figure, axis = plt.subplots(figsize=(11.5, 9.5))
    axis.grid(False)
    image = axis.imshow(matrix, cmap=diverging_colourmap(), vmin=-1, vmax=1)
    size = len(tick_labels)
    for row in range(size):
        for column in range(size):
            value = matrix[row, column]
            axis.text(column, row, f"{value:.2f}", ha="center", va="center", fontsize=10,
                      color="white" if abs(value) > 0.6 else TEXT_PRIMARY)
    axis.set_xticks(range(size))
    axis.set_yticks(range(size))
    axis.set_xticklabels(tick_labels, rotation=40, ha="right")
    axis.set_yticklabels(tick_labels)
    # Outline the gap row, which is what Part 5 tries to predict.
    axis.add_patch(plt.Rectangle((-0.5, size - 1.5), size, 1, fill=False, edgecolor=TEXT_PRIMARY, linewidth=1.8))
    for spine in axis.spines.values():
        spine.set_visible(False)
    colourbar = figure.colorbar(image, ax=axis, fraction=0.04, pad=0.02)
    colourbar.set_label("Pearson correlation")
    colourbar.outline.set_visible(False)
    figure.tight_layout()
    return save_figure(figure, "fig10_correlation_heatmap")


# ---------------------------------------------------------------------------
# Part 5 -- the ML surrogate (fig11 parity, fig12 importance, fig13 funnel)
# ---------------------------------------------------------------------------

# The three models keep these colours wherever they appear (distinct from the method colours).
MODEL_COLOURS = {"ridge": YELLOW, "random_forest": GREEN, "gradient_boosting": MAGENTA}


def fig12_feature_importance(bundle, labels, model_order, model_labels, best):
    """
    (a) Ridge coefficients on standardised descriptors: eV of gap per one standard deviation.
    (b) Permutation importance of each descriptor for all three models (test-set MAE increase).
    """
    apply_style()
    names = list(labels)
    short = {name: labels[name].split(" (")[0] for name in names}
    order = sorted(names, key=lambda name: bundle["models"][best]["permutation_importance_eV"][name])
    positions = np.arange(len(order))

    figure, (coefficient_axis, importance_axis) = plt.subplots(
        1, 2, figsize=(15, 6.8), sharey=True, gridspec_kw={"width_ratios": [1, 1.35], "wspace": 0.08})
    coefficients = [bundle["ridge_coefficients_eV_per_std"][name] for name in order]
    coefficient_axis.set_axisbelow(True)
    coefficient_axis.barh(positions, coefficients, color=MODEL_COLOURS["ridge"], height=0.6)
    coefficient_axis.axvline(0, color=TEXT_SECONDARY, linewidth=1)
    coefficient_axis.set_yticks(positions)
    coefficient_axis.set_yticklabels([short[name] for name in order])
    coefficient_axis.set_xlabel("Ridge coefficient\n(eV per standard deviation)")
    coefficient_axis.grid(axis="y", visible=False)
    _panel_letter(coefficient_axis, "a")

    height = 0.26
    importance_axis.set_axisbelow(True)
    for offset, kind in zip((height, 0.0, -height), model_order):
        values = [bundle["models"][kind]["permutation_importance_eV"][name] for name in order]
        importance_axis.barh(positions + offset, values, height=height * 0.92, color=MODEL_COLOURS[kind],
                             label=model_labels[kind])
    importance_axis.set_xlabel("Permutation importance\n(increase in test MAE, eV)")
    importance_axis.grid(axis="y", visible=False)
    importance_axis.set_xlim(left=0)
    handles, legend_labels = importance_axis.get_legend_handles_labels()
    importance_axis.legend(handles, legend_labels, loc="lower right")
    _panel_letter(importance_axis, "b")
    return save_figure(figure, "fig12_feature_importance")


def sequential_colourmap():
    """Single-hue sequential map (light to dark blue) for point density."""
    from matplotlib.colors import LinearSegmentedColormap
    return LinearSegmentedColormap.from_list("blues", ["#dbe8f8", BLUE, "#0c3466"])


def _parity_axes(axis, reference, predicted, low, high):
    """y = x line, equal aspect and shared limits for a parity panel."""
    axis.plot([low, high], [low, high], color=TEXT_SECONDARY, linewidth=1.2, linestyle="--", zorder=1)
    axis.set_xlim(low, high)
    axis.set_ylim(low, high)
    axis.set_aspect("equal")


def _metric_label(axis, text, corner="upper left"):
    """Metrics annotation in one corner of a parity panel."""
    x, y, va, ha = (0.04, 0.96, "top", "left") if corner == "upper left" else (0.96, 0.04, "bottom", "right")
    axis.text(x, y, text, transform=axis.transAxes, va=va, ha=ha, fontsize=12, color=TEXT_PRIMARY,
              bbox={"facecolor": "white", "edgecolor": "none", "alpha": 0.85, "pad": 2})


def fig11_parity(bundle, table, gaps, model_module, best, hopv_reference, hopv_predicted, verified):
    """
    Parity plots: predicted vs DFT gap.
    (a-c) Each model on the held-out QM9 test set (point density, log colour scale), with the
          three DFT-verified screening candidates on the best model's panel.
    (d)   The best model on HOPV15, molecules far larger than anything it was trained on.
    """
    apply_style()
    test_rows = bundle["split"]["test"]
    reference = np.asarray(gaps)[test_rows]
    low, high = 0.0, 14.0
    figure, axes = plt.subplots(1, 4, figsize=(21, 5.9))
    for letter, axis, kind in zip("abc", axes, model_module.MODEL_ORDER):
        predicted = model_module.predict(bundle, kind, table.iloc[test_rows])
        axis.grid(False)
        axis.hexbin(reference, predicted, gridsize=70, extent=(low, high, low, high), bins="log", mincnt=1,
                    cmap=sequential_colourmap(), linewidths=0, zorder=2)
        _parity_axes(axis, reference, predicted, low, high)
        metrics = bundle["models"][kind]["metrics"]["test"]
        _metric_label(axis, f"{model_module.MODEL_LABELS[kind]}\nMAE {metrics['MAE_eV']:.2f} eV\n"
                            f"R² {metrics['R2']:.3f}")
        axis.set_xlabel("QM9 B3LYP gap (eV)")
        _panel_letter(axis, letter)
        if kind == best:
            axis.plot([record["b3lyp_6_31Gs_gap_eV"] for record in verified],
                      [record["predicted_gap_eV"] for record in verified], "*", markersize=17, color=ORANGE,
                      markeredgecolor=TEXT_PRIMARY, markeredgewidth=0.8, zorder=4,
                      label="top-3 candidates\n(vs our B3LYP/6-31G*)")
            axis.legend(loc="lower right", fontsize=11)
    axes[0].set_ylabel("Predicted gap (eV)")

    hopv_axis = axes[3]
    hopv_axis.set_axisbelow(True)
    hopv_axis.plot(hopv_reference, hopv_predicted, "o", markersize=6, color=MODEL_COLOURS[best], alpha=0.75,
                   markeredgecolor="white", markeredgewidth=0.6, zorder=2)
    _parity_axes(hopv_axis, hopv_reference, hopv_predicted, 0.0, 8.0)
    mae = float(np.mean(np.abs(hopv_predicted - hopv_reference)))
    _metric_label(hopv_axis, f"HOPV15, out of domain\n{model_module.MODEL_LABELS[best]}\nMAE {mae:.2f} eV",
                  corner="lower right")
    hopv_axis.set_xlabel("HOPV15 B3LYP gap (eV)")
    _panel_letter(hopv_axis, "d")
    figure.tight_layout()
    return save_figure(figure, "fig11_parity")


def fig13_screening_funnel(funnel):
    """The screening funnel as horizontal bars on a log scale, widest stage at the top."""
    apply_style()
    stages = [stage["stage"] for stage in funnel]
    counts = [stage["count"] for stage in funnel]
    positions = np.arange(len(stages))
    figure, axis = plt.subplots(figsize=(11, 5.2))
    axis.set_axisbelow(True)
    colours = BLUE
    axis.barh(positions, counts, height=0.62, color=colours)
    for position, count in zip(positions, counts):
        axis.text(count * 1.15, position, f"{count:,}", va="center", fontsize=13, color=TEXT_PRIMARY)
    axis.set_xscale("log")
    axis.set_xlim(1, max(counts) * 6)
    axis.xaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda value, _: f"{value:,.0f}"))
    axis.set_yticks(positions)
    axis.set_yticklabels(stages)
    axis.invert_yaxis()
    axis.grid(axis="y", visible=False)
    axis.set_xlabel("Molecules (log scale)")
    figure.tight_layout()
    return save_figure(figure, "fig13_screening_funnel")


# ---------------------------------------------------------------------------
# Part 6 -- quantum dots (fig14 Brus curves, fig15 everything on the SQ curve)
# ---------------------------------------------------------------------------

MATERIAL_COLOURS = {"CdSe": VIOLET, "PbS": YELLOW}
INFRARED_GREY = "#b9b8b3"


def _colour_strip(axis, radii, rgb, label):
    """A strip of emission colours along the radius axis; infrared/ultraviolet drawn grey."""
    colours = [matplotlib.colors.to_rgb(INFRARED_GREY) if value is None else value for value in rgb]
    image = np.array([colours])
    axis.imshow(image, aspect="auto", extent=(radii[0], radii[-1], 0, 1), interpolation="nearest")
    axis.set_yticks([])
    axis.grid(False)
    axis.set_ylabel(label, rotation=0, ha="right", va="center", fontsize=12)
    for spine in axis.spines.values():
        spine.set_visible(False)


def fig14_brus(curves, target_gap, radius_at_optimum):
    """
    Gap vs radius from the Brus equation (solid) and experimental sizing curves (dashed),
    with strips underneath showing the colour of light each dot emits.
    """
    apply_style()
    figure, (gap_axis, cdse_strip, pbs_strip) = plt.subplots(
        3, 1, sharex=True, figsize=(10, 8.2), gridspec_kw={"height_ratios": [5.2, 0.45, 0.45], "hspace": 0.12})
    for material, curve in curves.items():
        colour = MATERIAL_COLOURS[material]
        gap_axis.plot(curve["radius_nm"], curve["gap_eV"], color=colour, linewidth=2.4,
                      label=f"{material}, Brus equation")
        gap_axis.plot(curve["radius_nm"], curve["experimental_gap_eV"], color=colour, linewidth=2.0,
                      linestyle="--", label=f"{material}, experimental sizing curve")
    gap_axis.axhline(target_gap, color=TEXT_SECONDARY, linewidth=1.2, linestyle=":")
    gap_axis.text(5.95, target_gap + 0.04, f"SQ optimum {target_gap:.2f} eV", ha="right", va="bottom",
                  fontsize=12, color=TEXT_SECONDARY)
    pbs = radius_at_optimum["PbS"]
    for key, marker in (("brus_nm", "o"), ("experimental_sizing_curve_nm", "s")):
        gap_axis.plot(pbs[key], target_gap, marker, markersize=10, color=MATERIAL_COLOURS["PbS"],
                      markeredgecolor=TEXT_PRIMARY, markeredgewidth=1.0, zorder=5)
    gap_axis.annotate(f"R = {pbs['brus_nm']:.2f} nm (Brus)", xy=(pbs["brus_nm"], target_gap),
                      xytext=(3.3, 2.6), fontsize=12,
                      arrowprops={"arrowstyle": "-", "color": TEXT_SECONDARY, "linewidth": 1})
    gap_axis.annotate(f"R = {pbs['experimental_sizing_curve_nm']:.2f} nm (experiment)",
                      xy=(pbs["experimental_sizing_curve_nm"], target_gap),
                      xytext=(1.6, 0.3), fontsize=12,
                      arrowprops={"arrowstyle": "-", "color": TEXT_SECONDARY, "linewidth": 1})
    gap_axis.set_ylim(0, 4.0)
    gap_axis.set_xlim(1.0, 6.0)
    gap_axis.set_ylabel("Band gap (eV)")
    gap_axis.legend(loc="upper right", fontsize=11)

    _colour_strip(cdse_strip, curves["CdSe"]["radius_nm"], curves["CdSe"]["rgb"], "CdSe")
    _colour_strip(pbs_strip, curves["PbS"]["radius_nm"], curves["PbS"]["rgb"], "PbS")
    pbs_strip.text(4.5, 0.5, "infrared (grey = not visible)", ha="center", va="center", fontsize=11,
                   color=TEXT_PRIMARY)
    pbs_strip.set_xlabel("Dot radius R (nm)")
    figure.subplots_adjust(left=0.12)
    return save_figure(figure, "fig14_brus")


def fig15_unifying(placement, curves, target_gap):
    """
    The closing figure: molecules, real dyes and quantum dots on one Shockley-Queisser curve.

    Top: the SQ limit vs gap, with Part 2 molecules and the screening candidates (B3LYP gaps)
    and HOPV15 dyes at their measured optical gap; each HOPV15 dye's MEASURED efficiency is
    drawn below its limit. Bottom: the range of gaps each quantum dot covers as its radius
    goes from 6 nm down to 1 nm (tuning by size).
    """
    apply_style()
    figure, (sq_axis, dot_axis) = plt.subplots(
        2, 1, sharex=True, figsize=(13, 9), gridspec_kw={"height_ratios": [4.2, 1.25], "hspace": 0.08})
    curve_gaps = np.array(placement["curve"]["gap_eV"])
    curve_efficiency = np.array(placement["curve"]["efficiency"]) * 100
    sq_axis.plot(curve_gaps, curve_efficiency, color=TEXT_PRIMARY, linewidth=2.2, label="Shockley–Queisser limit",
                 zorder=2)

    hopv = placement["hopv_experimental"]["points"]
    sq_axis.plot([p["gap_eV"] for p in hopv], [p["measured_pce"] * 100 for p in hopv], "o", markersize=6,
                 markerfacecolor="none", markeredgecolor=AQUA, markeredgewidth=1.1,
                 label="HOPV15 dyes: measured efficiency", zorder=3)
    sq_axis.plot([p["gap_eV"] for p in hopv], [p["sq_efficiency"] * 100 for p in hopv], "o", markersize=6,
                 color=AQUA, markeredgecolor="white", markeredgewidth=0.6,
                 label="HOPV15 dyes: limit at measured optical gap", zorder=4)
    part2 = placement["part2_molecules_b3lyp"]
    sq_axis.plot([p["gap_eV"] for p in part2], [p["sq_efficiency"] * 100 for p in part2], "o", markersize=10,
                 color=BLUE, markeredgecolor="white", markeredgewidth=1.0,
                 label="Part 2 molecules (B3LYP gap)", zorder=5)
    candidates = placement["screening_candidates_b3lyp"]
    sq_axis.plot([p["gap_eV"] for p in candidates], [p["sq_efficiency"] * 100 for p in candidates], "*",
                 markersize=16, color=BLUE, markeredgecolor=TEXT_PRIMARY, markeredgewidth=0.8,
                 label="ML screen top 3 (B3LYP gap)", zorder=6)
    for point in part2:
        if point["name"] in ("terthiophene", "benzene", "bithiophene", "azobenzene"):
            sq_axis.annotate(point["name"], xy=(point["gap_eV"], point["sq_efficiency"] * 100),
                             xytext=(0, 14), textcoords="offset points", ha="center", fontsize=11,
                             color=TEXT_PRIMARY, rotation=60)
    sq_axis.axvline(target_gap, color=TEXT_SECONDARY, linewidth=1, linestyle=":")
    sq_axis.text(target_gap + 0.06, 35.2, f"optimum {target_gap:.2f} eV", fontsize=12, color=TEXT_SECONDARY)
    sq_axis.set_ylabel("Power conversion efficiency (%)")
    sq_axis.set_ylim(-1, 38)
    sq_axis.legend(loc="upper right", fontsize=11)

    # Bottom panel: the gap range a dot can reach by changing its radius from 6 nm to 1 nm.
    dot_axis.grid(axis="y", visible=False)
    for row, material in enumerate(("PbS", "CdSe")):
        curve = curves[material]
        gaps = curve["gap_eV"]
        visible = gaps <= curve_gaps.max()
        dot_axis.plot(gaps[visible], np.full(visible.sum(), row), color=MATERIAL_COLOURS[material],
                      linewidth=9, solid_capstyle="butt")
        tick_radii = {"PbS": (6.0, 3.0, 2.0, 1.5), "CdSe": (6.0, 2.0, 1.5, 1.0)}[material]
        for radius in tick_radii:
            gap = float(np.interp(radius, curve["radius_nm"], gaps))
            if gap <= curve_gaps.max():
                dot_axis.plot(gap, row, "|", markersize=18, color=TEXT_PRIMARY, markeredgewidth=1.4)
                dot_axis.text(gap, row + 0.32, f"{radius:g} nm", ha="center", va="bottom", fontsize=10.5,
                              color=TEXT_SECONDARY)
    dot_axis.axvline(target_gap, color=TEXT_SECONDARY, linewidth=1, linestyle=":")
    dot_axis.set_yticks([0, 1])
    dot_axis.set_yticklabels(["PbS dot", "CdSe dot"])
    dot_axis.set_ylim(-0.6, 1.9)
    dot_axis.set_xlim(0.3, curve_gaps.max())
    dot_axis.set_xlabel("Band gap (eV)")
    return save_figure(figure, "fig15_unifying")


# ---------------------------------------------------------------------------
# Part 7 -- cost of the computation (fig16 time per molecule, fig17 extrapolation)
# ---------------------------------------------------------------------------

def _duration_text(seconds):
    """Human-readable duration."""
    if seconds < 1e-3:
        return f"{seconds * 1e6:.1f} µs"
    if seconds < 1:
        return f"{seconds * 1e3:.1f} ms"
    if seconds < 120:
        return f"{seconds:.1f} s"
    if seconds < 7200:
        return f"{seconds / 60:.1f} min"
    if seconds < 3 * 86400:
        return f"{seconds / 3600:.1f} h"
    if seconds < 365.25 * 86400:
        return f"{seconds / 86400:.0f} days"
    return f"{seconds / (365.25 * 86400):.1f} years"


def fig16_time_per_molecule(per_method, hf_seconds, b3lyp_seconds, qm9_size_seconds, model_labels):
    """Wall time per molecule (log scale): HF, B3LYP and ML inference, individual runs as dots."""
    apply_style()
    rows = [
        ("HF/6-31G*\n(Part 2, 9 molecules)", per_method["HF_part2"]["mean_seconds_per_molecule"], hf_seconds,
         METHOD_COLOURS["HF"]),
        ("B3LYP/6-31G*\n(Part 2, 9 molecules)", per_method["B3LYP_part2"]["mean_seconds_per_molecule"],
         b3lyp_seconds, METHOD_COLOURS["B3LYP"]),
        ("B3LYP/6-31G*\n(QM9-sized, 9 heavy atoms)", per_method["B3LYP_9_heavy_atoms"]["mean_seconds_per_molecule"],
         qm9_size_seconds, METHOD_COLOURS["B3LYP"]),
    ]
    for kind in ("ridge", "random_forest", "gradient_boosting"):
        rows.append((f"ML inference\n({model_labels[kind].lower()})",
                     per_method[f"ML_inference_{kind}"]["mean_seconds_per_molecule"], [], MODEL_COLOURS[kind]))
    positions = np.arange(len(rows))
    figure, axis = plt.subplots(figsize=(11, 6.6))
    axis.set_axisbelow(True)
    axis.barh(positions, [row[1] for row in rows], height=0.6, color=[row[3] for row in rows], left=1e-8)
    for position, (_, mean, individual, _) in zip(positions, rows):
        if individual:
            axis.plot(individual, np.full(len(individual), position), "o", markersize=5, color=TEXT_PRIMARY,
                      alpha=0.55, zorder=3)
        axis.text(max([mean] + list(individual)) * 1.6, position, _duration_text(mean), va="center", fontsize=13,
                  color=TEXT_PRIMARY)
    axis.set_xscale("log")
    axis.set_xlim(1e-8, 3e5)
    axis.set_yticks(positions)
    axis.set_yticklabels([row[0] for row in rows], fontsize=12)
    axis.invert_yaxis()
    axis.grid(axis="y", visible=False)
    axis.set_xlabel("Wall time per molecule (s, log scale; bar = mean, dots = individual runs)")
    figure.tight_layout()
    return save_figure(figure, "fig16_time_per_molecule")


def fig17_extrapolation(extrapolation, project_total, all_quantum_seconds, training_seconds):
    """
    What it would cost to treat all of QM9 with DFT vs with the ML surrogate.
    (a) wall time, (b) energy (upper bound, TDP x time), both on log scales.
    """
    apply_style()
    dft = extrapolation["b3lyp_all_qm9"]
    ml = extrapolation["ml_screen_all_qm9"]
    tdp = project_total["energy_J"] / project_total["wall_seconds"]
    rows = [
        ("B3LYP on all of QM9\n(extrapolated)", dft["mean"]["wall_seconds"], BLUE,
         (dft["fastest_measured"]["wall_seconds"], dft["slowest_measured"]["wall_seconds"])),
        ("All HF + DFT run for\nthis project (measured)", all_quantum_seconds, BLUE, None),
        ("ML training, all three\nmodels with grid search", sum(training_seconds.values()), MODEL_COLOURS["random_forest"],
         None),
        ("ML screen of all of QM9\n(measured)", ml["wall_seconds"], MODEL_COLOURS[ml["model"]], None),
    ]
    positions = np.arange(len(rows))
    figure, (time_axis, energy_axis) = plt.subplots(1, 2, sharey=True, figsize=(15, 5.6),
                                                    gridspec_kw={"wspace": 0.14})
    for axis, scale, unit in ((time_axis, 1.0, "s"), (energy_axis, tdp / 3.6e6, "kWh")):
        axis.set_axisbelow(True)
        values = [row[1] * scale for row in rows]
        axis.barh(positions, values, height=0.6, color=[row[2] for row in rows], left=1e-9)
        for position, row in zip(positions, rows):
            if row[3] is not None:
                axis.errorbar(row[1] * scale, position, xerr=[[row[1] * scale - row[3][0] * scale],
                                                                [row[3][1] * scale - row[1] * scale]],
                              fmt="none", ecolor=TEXT_PRIMARY, elinewidth=1.3, capsize=5)
        axis.set_xscale("log")
        axis.grid(axis="y", visible=False)
    for position, row in zip(positions, rows):
        upper = row[3][1] if row[3] is not None else row[1]
        time_axis.text(upper * 2.0, position, _duration_text(row[1]), va="center", fontsize=13)
        kwh = row[1] * tdp / 3.6e6
        energy_axis.text(upper * tdp / 3.6e6 * 2.0, position,
                         f"{kwh:,.0f} kWh" if kwh >= 10 else (f"{kwh:.2g} kWh" if kwh >= 0.01 else f"{kwh * 1000:.2g} Wh"), va="center", fontsize=13)
    time_axis.set_xlim(1e-2, 1e11)
    energy_axis.set_xlim(1e-7, 1e7)
    time_axis.set_yticks(positions)
    time_axis.set_yticklabels([row[0] for row in rows], fontsize=12)
    time_axis.invert_yaxis()
    time_axis.set_xlabel("Wall time (s, log scale)")
    energy_axis.set_xlabel("Energy, upper bound: 45 W × time (kWh, log scale)")
    _panel_letter(time_axis, "a")
    _panel_letter(energy_axis, "b")
    return save_figure(figure, "fig17_extrapolation")
