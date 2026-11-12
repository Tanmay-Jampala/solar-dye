#!/usr/bin/env bash
# Run Python inside the solar-dye conda environment without needing `conda activate`.
# Usage:  ./py.sh -m src.download_data      ./py.sh script.py
# Override the environment location with SOLAR_DYE_ENV=/path/to/env.
ENV_DIR="${SOLAR_DYE_ENV:-$HOME/micromamba/envs/solar-dye}"
export PATH="$ENV_DIR:$ENV_DIR/Library/mingw-w64/bin:$ENV_DIR/Library/usr/bin:$ENV_DIR/Library/bin:$ENV_DIR/Scripts:$ENV_DIR/bin:$PATH"
# PySCF on this laptop: 6 physical cores. More threads oversubscribe and multiply JK buffer memory.
export OMP_NUM_THREADS="${OMP_NUM_THREADS:-6}"
export PYTHONIOENCODING=utf-8
cd "$(dirname "$0")"
exec "$ENV_DIR/python.exe" -u "$@"
