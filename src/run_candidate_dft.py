"""
Run B3LYP/6-31G* (same protocol as Part 2) on screening candidates given as SMILES.

    ./py.sh -m src.run_candidate_dft "SMILES1" "SMILES2" ...

The pipeline calls the same function and finds the results in the cache, so this
script only exists to run the slow part in the background.
"""

import sys

from src import quantum

if __name__ == "__main__":
    for smiles in sys.argv[1:]:
        quantum.run_molecule(quantum.candidate_name(smiles), "B3LYP", spec=quantum.candidate_spec(smiles))
