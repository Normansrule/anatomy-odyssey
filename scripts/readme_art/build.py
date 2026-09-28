#!/usr/bin/env python3
"""Regenerate the README motion graphics in media/readme/.

    python scripts/readme_art/build.py            # writes hero.svg + tiles/*.svg
    python scripts/readme_art/shoot.py            # screenshots preview.html (needs Playwright)

Pure standard library. Random stars use fixed seeds, so the output is reproducible.
"""
import os
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import hero  # noqa: E402
import tiles  # noqa: E402

OUT = os.path.normpath(os.path.join(HERE, "..", "..", "media", "readme"))


def write(path, svg):
    ET.fromstring(svg)  # must be valid XML
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(svg)
    return os.path.getsize(path)


def main():
    only = set(sys.argv[1:])
    rows = []
    if not only or "hero" in only:
        rows.append(("hero.svg", write(os.path.join(OUT, "hero.svg"), hero.build())))
    for pid, svg in tiles.build_all(only):
        rows.append((f"tiles/{pid}.svg", write(os.path.join(OUT, "tiles", f"{pid}.svg"), svg)))
    for name, size in rows:
        limit = 150_000 if name == "hero.svg" else 40_000
        flag = "" if size <= limit else "  <-- OVER LIMIT"
        print(f"{name:28s} {size / 1024:6.1f} KB{flag}")


if __name__ == "__main__":
    main()
