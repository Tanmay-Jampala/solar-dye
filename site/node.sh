#!/usr/bin/env bash
# Run node / npm / npx from the solar-dye-site micromamba environment (no system-wide Node needed).
# Usage:  ./node.sh npm run build      ./node.sh npx playwright test
# Override the environment location with SOLAR_DYE_SITE_ENV=/path/to/env.
ENV_DIR="${SOLAR_DYE_SITE_ENV:-$HOME/micromamba/envs/solar-dye-site}"
export PATH="$ENV_DIR:$PATH"
cd "$(dirname "$0")"
exec "$@"
