# Contributing to Cosmic Codex

Thanks for helping. Corrections to a fact matter as much as new features.

## Ground rules

1. **Source every number.** If a value appears on screen or in a tutorial, cite where it came from, in a code comment or the page's data file.
2. **Safety first in `experiments/`.** Only commercially certified rocket motors. No instructions for propellants, motors, igniters, ejection charges or anything pyrotechnic. Follow [`experiments/SAFETY.md`](experiments/SAFETY.md).
3. **No logos or insignia.** Don't draw agency insignia or company logos on models or pages.
4. **Write for learners.** Spell out acronyms on first use, e.g. "Low Earth Orbit (LEO)". Prefer English-language videos and resources.
5. **Follow the design system.** Read [`docs/DEVELOPING.md`](docs/DEVELOPING.md) before touching `site/`.

## Before you open a pull request

```bash
# website: screenshot the page you changed, headless, fails on uncaught errors
pip install playwright && python -m playwright install chromium
python scripts/shot.py <page>.html /tmp/out.png

# data and physics checks
node --no-warnings scripts/check_equations.mjs
node --no-warnings scripts/test_ephemeris.mjs
python -m pytest simulations/tests -q
```

If you edit `site/data/equations.json`, regenerate the Markdown with `node scripts/build_equations_md.mjs`.

## Adding an experiment

Create `experiments/<NN>-<slug>/README.md` with the standard sections (What you'll learn, cost/time/difficulty, bill of materials, steps, the science, data, troubleshooting, going further). Then add an entry to `site/data/experiments.json` (levels 0–2) or `experiments-advanced.json` (levels 3–4) following [`experiments/SCHEMA.md`](experiments/SCHEMA.md).

## Reporting a factual error

Open an issue with the page, the claim, and a primary source for the correct value.
