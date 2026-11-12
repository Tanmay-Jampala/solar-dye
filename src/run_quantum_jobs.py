"""
Run every Part 2 and Part 3 quantum calculation once, in the background, and cache them.

    ./py.sh -m src.run_quantum_jobs

Order: bithiophene/B3LYP first (the torsion scan starts from it), then the
torsion scan, then every other molecule x method from the smallest to the
largest. A failure in one job is logged and the rest continue. Already-cached
jobs return instantly, so this script is safe to re-run after an interruption.
"""

import time
import traceback

from src import quantum, torsion


def job_order():
    """(molecule, method) pairs, smallest molecules first so early results arrive quickly."""
    from rdkit import Chem
    by_size = sorted(quantum.MOLECULES, key=lambda name: Chem.MolFromSmiles(quantum.MOLECULES[name]["smiles"]).GetNumHeavyAtoms())
    jobs = []
    for name in by_size:
        for method in ("HF", "B3LYP"):
            if (name, method) != ("bithiophene", "B3LYP"):
                jobs.append((name, method))
    return jobs


def main():
    """Run all jobs, printing one line per job with its outcome."""
    start = time.perf_counter()
    quantum.run_molecule("bithiophene", "B3LYP")

    try:
        torsion.run_scan()
    except Exception:
        print("TORSION SCAN FAILED")
        traceback.print_exc()

    for name, method in job_order():
        try:
            quantum.run_molecule(name, method)
        except Exception:
            print(f"FAILED: {name} {method}")
            traceback.print_exc()

    print(f"ALL QUANTUM JOBS FINISHED in {(time.perf_counter() - start) / 60:.1f} min", flush=True)


if __name__ == "__main__":
    main()
