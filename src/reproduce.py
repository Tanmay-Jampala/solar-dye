"""
Reproduce every number and figure in the project with one command:

    ./py.sh -m src.reproduce

Steps (each one skips work that is already cached):
  1. Download the raw data and verify every file's SHA-256 checksum.
  2. Run any HF/B3LYP calculation that is not already in cache/quantum or cache/torsion.
     The repository ships these results, so on a fresh clone this step takes seconds;
     without them it takes about 4.5 hours on a 6-core laptop.
  3. Rebuild notebook/solar_dye.ipynb from src/build_notebook.py and execute it top to
     bottom. The notebook recomputes everything else (Shockley-Queisser, descriptors,
     models, quantum dots, energy accounting), writes results/results.json and every
     figure, and fails loudly if any validation check fails.

Exit code 0 means every check passed.
"""

import sys
import time

import nbformat
from nbclient import NotebookClient
from nbclient.exceptions import CellExecutionError

from src import build_notebook, results_io
from src.constants import REPO_ROOT


def execute_notebook(path):
    """Run the notebook in place from the notebook/ directory, with no per-cell time limit."""
    notebook = nbformat.read(path, as_version=4)
    client = NotebookClient(notebook, timeout=None, kernel_name="python3",
                            resources={"metadata": {"path": str(path.parent)}})
    try:
        client.execute()
    finally:
        nbformat.write(notebook, path)  # keep the outputs, including a traceback if a cell failed


def main():
    """Run the three steps and report the validation result."""
    start = time.perf_counter()

    print("[1/3] Downloading and verifying raw data", flush=True)
    from src.download_data import download_all
    download_all()

    print("[2/3] Quantum calculations (cached results are reused)", flush=True)
    from src import run_quantum_jobs
    run_quantum_jobs.main()

    print("[3/3] Building and executing the notebook", flush=True)
    notebook_path = build_notebook.build()
    try:
        execute_notebook(notebook_path)
    except CellExecutionError as error:
        print(f"\nNOTEBOOK FAILED (outputs saved in {notebook_path.relative_to(REPO_ROOT)}):\n{error}")
        return 1

    checks = results_io.load_results()["checks"]
    failed = [check["name"] for check in checks if not check["passed"]]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed "
          f"in {(time.perf_counter() - start) / 60:.1f} min")
    for name in failed:
        print(f"  FAILED: {name}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
