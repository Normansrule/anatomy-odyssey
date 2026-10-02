#!/usr/bin/env python3
"""Regenerate every README motion graphic in media/readme/.

    python3 scripts/readme_art/build.py                 # everything
    python3 scripts/readme_art/build.py tiles sections  # only some groups
    python3 scripts/readme_art/build.py launch surveys  # single tiles / banners by id
    python3 scripts/readme_art/shoot.py                 # screenshots preview.html (needs Playwright)

Groups (output folder, size budget):
    hero       hero.svg                      150 KB
    tiles      tiles/<page>.svg              40 KB   (tiles.py, tiles_extra.py)
    sections   sections/<name>.svg           60 KB   (sections.py)  1000 x 150 section banners
    dividers   dividers/<name>.svg           15 KB   (dividers.py)  1000 x 40
    stats      stats.svg                     50 KB   (stats.py)     counts read from the repo (facts.py)
    sub        sub/<name>.svg                70 KB   (sub.py)       1000 x 220 sub-README banners
    concepts   concepts/<name>.svg           60 KB   (concepts/fig_*.py)
    buttons    buttons/<name>.svg            20 KB   (buttons.py)   560 x 120 call-to-action buttons
               buttons/small/<name>.svg                             380 x 90 compact twins
    howto      howto/<name>.svg              60 KB   (howto.py)     gestures strip, devices strip

Tiles that the site itself shows (any already in site/assets/img/tiles/, plus SITE_TILES)
are copied there too, so the site and the README always carry the same card.

Pure standard library. Random stars use fixed seeds, so the output is reproducible.
"""
import importlib
import os
import shutil
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import buttons  # noqa: E402
import dividers  # noqa: E402
import hero  # noqa: E402
import howto  # noqa: E402
import sections  # noqa: E402
import stats  # noqa: E402
import sub  # noqa: E402
import tiles  # noqa: E402

OUT = os.path.normpath(os.path.join(HERE, "..", "..", "media", "readme"))
SITE_TILES_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "site", "assets", "img", "tiles"))
SITE_TILES = {"eyepiece"}          # always mirrored into the site, even before the site references them
GROUPS = ["hero", "tiles", "sections", "dividers", "stats", "sub", "concepts", "buttons", "howto"]
LIMITS = {"hero": 150_000, "tiles": 40_000, "sections": 60_000, "dividers": 15_000, "stats": 50_000, "sub": 70_000,
          "buttons": 20_000, "howto": 60_000}


def write(path, svg):
    ET.fromstring(svg)  # must be valid XML
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(svg)
    return os.path.getsize(path)


def main():
    args = set(sys.argv[1:])
    groups = {g for g in GROUPS if g in args} or (set(GROUPS) if not args else set())
    ids = args - set(GROUPS)
    rows, over = [], 0

    def want(group, item):
        return group in groups or item in ids

    if want("hero", "hero"):
        rows.append(("hero", "hero.svg", write(os.path.join(OUT, "hero.svg"), hero.build())))
    for pid, svg in tiles.build_all():
        if want("tiles", pid):
            dst = os.path.join(OUT, "tiles", f"{pid}.svg")
            rows.append(("tiles", f"tiles/{pid}.svg", write(dst, svg)))
            if pid in SITE_TILES or os.path.exists(os.path.join(SITE_TILES_DIR, f"{pid}.svg")):
                os.makedirs(SITE_TILES_DIR, exist_ok=True)
                shutil.copyfile(dst, os.path.join(SITE_TILES_DIR, f"{pid}.svg"))
    for grp, mod in (("sections", sections), ("dividers", dividers), ("sub", sub), ("buttons", buttons), ("howto", howto)):
        for key, svg in mod.build_all():
            if want(grp, key):
                rows.append((grp, f"{grp}/{key}.svg", write(os.path.join(OUT, grp, f"{key}.svg"), svg)))
    if want("stats", "stats"):
        rows.append(("stats", "stats.svg", write(os.path.join(OUT, "stats.svg"), stats.build())))
    for grp, name, size in rows:
        flag = "" if size <= LIMITS[grp] else "  <-- OVER LIMIT"
        over += bool(flag)
        print(f"{name:34s} {size / 1024:6.1f} KB{flag}")
    if "concepts" in groups:
        import importlib.util
        cdir = os.path.join(HERE, "concepts")
        sys.path.insert(0, cdir)
        spec = importlib.util.spec_from_file_location("concepts_build", os.path.join(cdir, "build.py"))
        cb = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cb)
        for name in cb.FIGS:
            importlib.import_module(name).build()    # each checks XML + 60 KB itself
    if over:
        sys.exit(f"{over} file(s) over their size budget")


if __name__ == "__main__":
    main()
