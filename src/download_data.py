"""
Download every raw dataset the project uses into data/raw/.

Re-runnable: a file that is already present is NOT downloaded again, but it
IS verified every time -- first against a SHA-256 checksum, then against an
expected row count. If either check fails the script raises, because a
silently corrupted dataset would poison every number downstream.

Run from the repository root:
    python -m src.download_data
"""

import hashlib
import tarfile
import urllib.request
from datetime import date

from src.constants import RAW_DIR

# Each entry: local file name -> where it comes from, what it is, and how to verify it.
# The SHA-256 values were recorded on the first successful download (2026-11-11).
DATASETS = {
    "qm9.csv": {
        "url": "https://deepchemdata.s3-us-west-1.amazonaws.com/datasets/qm9.csv",
        "description": "QM9 (Ramakrishnan et al. 2014), DeepChem/MoleculeNet CSV mirror. "
                       "HOMO/LUMO/gap in Hartree at B3LYP/6-31G(2df,p).",
        "licence": "CC0 1.0 (original figshare deposit)",
        "sha256": "3e668f8c34e4bc392a90d417a50a5eed3b64b842a817a633024bdc054c68ccb4",
        "expected_lines": 133886,  # 133,885 molecules + 1 header line
    },
    "qm9_uncharacterized.txt": {
        "url": "https://ndownloader.figshare.com/files/3195404",
        "description": "List of 3,054 QM9 molecules whose relaxed B3LYP geometry no longer "
                       "matches the original GDB SMILES (Ramakrishnan et al. 2014).",
        "licence": "CC0 1.0",
        "sha256": "3aa5115d540b356de94791d4a74c3bf1ed91c469ecf52a4f5d7cc0506fe02e24",
        "expected_lines": 3064,  # 9 header lines + 3054 molecules + 1 footer rule
    },
    "HOPV_15_revised_2.data": {
        "url": "https://ndownloader.figshare.com/files/4513735",
        "description": "Harvard Organic Photovoltaic Dataset HOPV15 (Lopez et al. 2016), revision 2. "
                       "Experimental HOMO/LUMO/PCE plus per-conformer DFT at four functionals.",
        "licence": "CC BY 4.0",
        "sha256": "595bb107fa52804d8df1b730bfb2dcd35509475e48e521ffe8661ca04e1e02d7",
        "expected_lines": None,  # verified by molecule count when parsed (350 molecules)
    },
    "hopv.tar.gz": {
        "url": "https://deepchemdata.s3-us-west-1.amazonaws.com/datasets/hopv.tar.gz",
        "description": "DeepChem CSV mirror of HOPV15 experimental columns (used as a cross-check).",
        "licence": "CC BY 4.0",
        "sha256": "e88ef45efc1be0d80a241b8f0cdd7d18755206c519e8b3b15c3db849970c9dfa",
        "expected_lines": None,
    },
    "ASTMG173.csv": {
        "url": "https://raw.githubusercontent.com/pvlib/pvlib-python/v0.11.0/pvlib/data/ASTMG173.csv",
        "description": "ASTM G173-03 reference solar spectra (AM0, AM1.5 global tilt, AM1.5 direct), "
                       "280-4000 nm, W m^-2 nm^-1. Tabulated by NREL from SMARTS 2.9.2; copy bundled "
                       "with pvlib-python v0.11.0 (NREL's own host was unreachable at download time).",
        "licence": "ASTM standard reference data, redistributed by NREL / pvlib (BSD-3)",
        "sha256": "91964ac23c0ec82dbbda4a7f160a5f5faf551dfe18ffae7e2446d74b57ee7859",
        "expected_lines": 2004,  # 2 header lines + 2002 wavelengths
    },
}


def sha256_of_file(path):
    """Return the hex SHA-256 digest of a file, reading it in 1 MB chunks."""
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def count_lines(path):
    """Count newline-terminated lines in a text file."""
    with open(path, "rb") as handle:
        return sum(1 for _ in handle)


def download_one(file_name, info):
    """Download a single dataset if missing, then verify it. Returns a provenance dict."""
    target = RAW_DIR / file_name
    if not target.exists():
        print(f"Downloading {file_name} from {info['url']}")
        urllib.request.urlretrieve(info["url"], target)
    else:
        print(f"{file_name} already present, verifying")

    actual_sha = sha256_of_file(target)
    if info["sha256"] and actual_sha != info["sha256"]:
        raise RuntimeError(f"Checksum mismatch for {file_name}: {actual_sha} != {info['sha256']}")

    if info["expected_lines"] is not None:
        line_count = count_lines(target)
        if line_count != info["expected_lines"]:
            raise RuntimeError(f"{file_name}: expected {info['expected_lines']} lines, got {line_count}")

    return {
        "file": file_name,
        "url": info["url"],
        "description": info["description"],
        "licence": info["licence"],
        "sha256": actual_sha,
        "size_bytes": target.stat().st_size,
    }


def download_all():
    """Download and verify every dataset; unpack the HOPV tarball. Returns provenance records."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    records = []
    for file_name, info in DATASETS.items():
        records.append(download_one(file_name, info))

    hopv_dir = RAW_DIR / "hopv"
    if not (hopv_dir / "hopv.csv").exists():
        hopv_dir.mkdir(exist_ok=True)
        with tarfile.open(RAW_DIR / "hopv.tar.gz") as archive:
            archive.extractall(hopv_dir, filter="data")
    return records


if __name__ == "__main__":
    for record in download_all():
        print(record["file"], record["sha256"][:16], record["size_bytes"])
    print("Verified on", date.today().isoformat())
