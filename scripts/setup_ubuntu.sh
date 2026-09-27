#!/usr/bin/env bash
# Cosmic Codex: one-shot setup for Ubuntu 22.04 / 24.04 / newer (native or WSL2).
#
#   bash scripts/setup_ubuntu.sh            # web + Python toolkit + firmware tests
#   bash scripts/setup_ubuntu.sh --cad      # also OpenSCAD + KiCad (for experiments/)
#   bash scripts/setup_ubuntu.sh --browser  # also Playwright + Chromium (for scripts/shot.py)
#   bash scripts/setup_ubuntu.sh --all      # everything
#
# Run from the repository root. Safe to run again.
set -euo pipefail

CAD=0; BROWSER=0
for a in "$@"; do
  case "$a" in
    --cad) CAD=1 ;;
    --browser) BROWSER=1 ;;
    --all) CAD=1; BROWSER=1 ;;
    *) echo "unknown option: $a"; exit 1 ;;
  esac
done

cd "$(dirname "$0")/.."
[ -f site/index.html ] || { echo "Run this from inside the cosmic-codex repository."; exit 1; }

say() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }

say "System packages"
sudo apt-get update
sudo apt-get install -y git curl unzip python3 python3-venv python3-pip build-essential nodejs npm

if [ "$CAD" = 1 ]; then
  say "CAD & PCB tools (OpenSCAD, KiCad)"
  sudo apt-get install -y openscad || echo "OpenSCAD not in this release's archive: see https://openscad.org/downloads.html"
  if ! command -v kicad-cli >/dev/null; then
    sudo apt-get install -y software-properties-common
    # Official KiCad PPA; falls back to the distro package if the PPA has no build for this release.
    sudo add-apt-repository -y ppa:kicad/kicad-8.0-releases && sudo apt-get update || true
    sudo apt-get install -y kicad || echo "KiCad install failed: see https://www.kicad.org/download/linux/"
  fi
fi

say "Python virtual environment (.venv)"
python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r simulations/requirements.txt

if [ "$BROWSER" = 1 ]; then
  say "Playwright + Chromium (headless screenshots)"
  pip install playwright
  python -m playwright install --with-deps chromium
fi

say "Running the checks"
python -m pytest simulations/tests -q
node --no-warnings scripts/check_equations.mjs | tail -1
node --no-warnings scripts/test_ephemeris.mjs | tail -1
make -s -C experiments/30-flight-computer-pcb/firmware/test >/dev/null && echo "flight-computer firmware host tests: OK"

cat <<'EOF'

✔ Setup complete.

  Website:      python3 -m http.server 8000 --directory site     → http://localhost:8000
  Simulations:  source .venv/bin/activate && python simulations/run.py --help
  Tests:        python -m pytest simulations/tests -q
EOF
