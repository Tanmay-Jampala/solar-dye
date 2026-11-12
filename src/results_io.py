"""
Read and write results/results.json -- the single source of truth.

Every part of the pipeline stores its numbers here under a stable, dotted key
path (e.g. "sq.optimum_gap_eV"). The report, slides and website are written
from this file, so nothing may be quoted anywhere that is not stored here.

Checks live in a list under "checks"; each is {name, expected, actual, passed}.
Re-running a part replaces its own checks (matched by name) instead of
appending duplicates.
"""

import json
import math

import numpy as np

from src.constants import RESULTS_JSON


def _to_plain_python(value):
    """Convert numpy scalars/arrays (and nested containers) into JSON-safe Python types."""
    if isinstance(value, dict):
        return {str(key): _to_plain_python(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_to_plain_python(item) for item in value]
    if isinstance(value, np.ndarray):
        return [_to_plain_python(item) for item in value.tolist()]
    if isinstance(value, np.bool_):
        return bool(value)
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return float(value)
    return value


def load_results():
    """Return the current results dictionary (empty if the file does not exist yet)."""
    if not RESULTS_JSON.exists():
        return {}
    with open(RESULTS_JSON, encoding="utf-8") as handle:
        return json.load(handle)


def save_results(results):
    """Write the results dictionary to disk, pretty-printed and with sorted top-level keys."""
    RESULTS_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(RESULTS_JSON, "w", encoding="utf-8") as handle:
        json.dump(_to_plain_python(results), handle, indent=2, allow_nan=False)


def set_value(key_path, value):
    """Store `value` at a dotted key path such as 'sq.optimum_gap_eV', creating parents as needed."""
    results = load_results()
    keys = key_path.split(".")
    node = results
    for key in keys[:-1]:
        node = node.setdefault(key, {})
    node[keys[-1]] = _to_plain_python(value)
    save_results(results)


def get_value(key_path):
    """Read the value stored at a dotted key path (raises KeyError if missing)."""
    node = load_results()
    for key in key_path.split("."):
        node = node[key]
    return node


def record_check(name, expected, actual, passed):
    """Add or replace a named validation check and print its outcome."""
    results = load_results()
    checks = [check for check in results.get("checks", []) if check["name"] != name]
    checks.append({
        "name": name,
        "expected": _to_plain_python(expected),
        "actual": _to_plain_python(actual),
        "passed": bool(passed),
    })
    results["checks"] = checks
    save_results(results)
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {name}: expected {expected}, got {actual}")
    return bool(passed)


def environment_versions():
    """Return the resolved versions of Python and every key library, for the reproducibility section."""
    import platform
    import sys
    from importlib.metadata import PackageNotFoundError, version

    packages = ["numpy", "scipy", "pandas", "matplotlib", "scikit-learn", "scikit-image",
                "rdkit", "pyscf", "geometric", "tqdm", "joblib", "pillow"]
    versions = {"python": sys.version.split()[0], "platform": platform.platform()}
    for package in packages:
        try:
            versions[package] = version(package)
        except PackageNotFoundError:
            versions[package] = "not installed"
    return versions


def find_nans(node, path="root"):
    """Return the key paths of every NaN or infinity anywhere inside a nested structure."""
    bad_paths = []
    if isinstance(node, dict):
        for key, item in node.items():
            bad_paths.extend(find_nans(item, f"{path}.{key}"))
    elif isinstance(node, list):
        for index, item in enumerate(node):
            bad_paths.extend(find_nans(item, f"{path}[{index}]"))
    elif isinstance(node, float) and not math.isfinite(node):
        bad_paths.append(path)
    return bad_paths
