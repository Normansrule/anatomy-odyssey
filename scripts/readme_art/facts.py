"""Counts shown in the README art, read from the repository at build time.

Nothing here is typed in by hand when the repository can answer it, so the art
stays right as pages, equations, photographs and builds are added:

    pages        entries in the PAGES list of site/assets/js/codex.js (Home included)
    equations    len(site/data/equations.json["equations"])
    photographs  len(site/data/gallery.json["items"])
    milestones   len(site/data/timeline.json["events"])
    documents    len(site/data/library.json["entries"])
    builds       experiments/NN-*/ folders
    simulations  physics modules in simulations/cosmic/ (not helpers)
"""
import json
import os
import re

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
_HELPERS = {"__init__", "_cli", "constants", "style"}


def _json(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        return json.load(fh)


def _codex_pages():
    with open(os.path.join(ROOT, "site", "assets", "js", "codex.js"), encoding="utf-8") as fh:
        src = fh.read()
    block = src[src.index("var PAGES"):]
    block = block[:block.index("];")]
    return re.findall(r'\[\s*"([^"]+)",\s*"([^"]*)",\s*"([^"]*)",\s*"([^"]*)",\s*"([^"]*)"\s*\]', block)


def counts():
    pages = _codex_pages()
    groups = {}
    for pid, _t, _f, grp, _d in pages:
        if grp:
            groups[grp] = groups.get(grp, 0) + 1
    exp_dir = os.path.join(ROOT, "experiments")
    sim_dir = os.path.join(ROOT, "simulations", "cosmic")
    return {
        "pages": len(pages),
        "groups": groups,
        "equations": len(_json("site/data/equations.json")["equations"]),
        "photographs": len(_json("site/data/gallery.json")["items"]),
        "milestones": len(_json("site/data/timeline.json")["events"]),
        "documents": len(_json("site/data/library.json")["entries"]),
        "builds": sum(1 for d in os.listdir(exp_dir) if re.match(r"\d\d-", d) and os.path.isdir(os.path.join(exp_dir, d))),
        "simulations": sum(1 for fn in os.listdir(sim_dir) if fn.endswith(".py") and fn[:-3] not in _HELPERS),
    }


if __name__ == "__main__":
    print(counts())
