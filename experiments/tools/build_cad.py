#!/usr/bin/env python3
"""Export, verify and publish every printable part in experiments/.

    python3 experiments/tools/build_cad.py            # export all + verify + copy to site/models
    python3 experiments/tools/build_cad.py --check    # verify existing STLs only

For each part it
  1. runs OpenSCAD (`openscad -o part.stl -D ... part.scad`),
  2. re-saves the mesh as *binary* STL with trimesh (≈ 5× smaller than OpenSCAD's ASCII),
  3. checks the mesh is watertight, winding-consistent, has positive volume and the
     expected bounding-box size (± 0.6 mm),
  4. copies the web-viewer subset to site/models/<folder>/ (each file must be < 1.5 MB).

Requires: OpenSCAD 2021+, `pip install trimesh numpy`.
"""
import argparse, os, shutil, subprocess, sys
import numpy as np
import trimesh

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.dirname(HERE)
SITE_MODELS = os.path.join(EXP, "..", "site", "models")

# (folder, scad, output name, -D defines, expected bbox (x, y, z) or None, publish to web?)
# Expected sizes are computed by hand from the parameters so a silent geometry bug fails loudly.
PARTS = [
    # ---- 21: nose cones (BT-50: OD 24.8, L = 3.5 × 24.8 = 86.8, shoulder 0.9 × 24.8 = 22.32) ----
    ("21-3d-printed-model-rocket", "nosecone.scad", "nose_conical_BT50.stl",   {"profile": "conical",   "tube": "BT-50"}, (24.8, 24.8, 109.12), False),
    ("21-3d-printed-model-rocket", "nosecone.scad", "nose_ogive_BT50.stl",     {"profile": "ogive",     "tube": "BT-50"}, (24.8, 24.8, 109.12), True),
    ("21-3d-printed-model-rocket", "nosecone.scad", "nose_vonkarman_BT50.stl", {"profile": "vonkarman", "tube": "BT-50"}, (24.8, 24.8, 109.12), False),
    ("21-3d-printed-model-rocket", "nosecone.scad", "nose_lvhaack_BT50.stl",   {"profile": "lvhaack",   "tube": "BT-50"}, (24.8, 24.8, 109.12), False),
    ("21-3d-printed-model-rocket", "nosecone.scad", "nose_elliptical_BT50.stl",{"profile": "elliptical","tube": "BT-50", "fineness": 2}, (24.8, 24.8, 71.92), False),
    # BT-60: OD 41.6, L = 3.5 × 41.6 = 145.6, shoulder 37.44
    ("21-3d-printed-model-rocket", "nosecone.scad", "nose_vonkarman_BT60.stl", {"profile": "vonkarman", "tube": "BT-60"}, (41.6, 41.6, 183.04), True),
    ("21-3d-printed-model-rocket", "nosecone.scad", "nose_ogive_BT60.stl",     {"profile": "ogive",     "tube": "BT-60"}, (41.6, 41.6, 183.04), False),
    # ---- 21: fin cans (height = root + 4) ----
    ("21-3d-printed-model-rocket", "fincan.scad", "fincan_BT50.stl", {"tube": "BT-50"}, None, True),
    ("21-3d-printed-model-rocket", "fincan.scad", "fincan_BT60.stl", {"tube": "BT-60"}, None, True),
    ("21-3d-printed-model-rocket", "fincan.scad", "fincan_BT60_4fin.stl", {"tube": "BT-60", "fins": 4}, None, False),
    # ---- 21: motor mounts ----
    ("21-3d-printed-model-rocket", "motor_mount.scad", "ring_18mm_BT50.stl", {"part": "ring", "motor": 18, "tube": "BT-50"}, (23.8, 23.8, 3.0), False),
    ("21-3d-printed-model-rocket", "motor_mount.scad", "ring_18mm_BT60.stl", {"part": "ring", "motor": 18, "tube": "BT-60"}, (40.2, 40.2, 3.0), True),
    ("21-3d-printed-model-rocket", "motor_mount.scad", "ring_24mm_BT60.stl", {"part": "ring", "motor": 24, "tube": "BT-60"}, (40.2, 40.2, 3.0), False),
    ("21-3d-printed-model-rocket", "motor_mount.scad", "engine_block_18mm.stl", {"part": "block", "motor": 18}, (17.8, 17.8, 6.0), False),
    ("21-3d-printed-model-rocket", "motor_mount.scad", "engine_block_24mm.stl", {"part": "block", "motor": 24}, (23.9, 23.9, 6.0), False),
    ("21-3d-printed-model-rocket", "motor_mount.scad", "motor_mount_24mm_BT60.stl", {"part": "mount", "motor": 24, "tube": "BT-60"}, (40.2, 40.2, 66.0), True),
    ("21-3d-printed-model-rocket", "motor_mount.scad", "motor_mount_18mm_BT60.stl", {"part": "mount", "motor": 18, "tube": "BT-60"}, (40.2, 40.2, 66.0), False),
    # ---- 10: water rocket (bottle 110 mm → bore 111, nose OD 114.2, sleeve OD 114.2) ----
    ("10-water-bottle-rocket", "water_rocket.scad", "nose_2L.stl",   {"part": "nose"},   (114.2, 114.2, 174.5), True),  # 140 + 45 minus the 18 mm soft-tip land
    ("10-water-bottle-rocket", "water_rocket.scad", "fincan_2L.stl", {"part": "fincan"}, None, True),
    # ---- 22: avionics sled ----
    ("22-barometric-altimeter-payload", "sled.scad", "sled_BT60.stl", {}, None, True),
]


def dstr(v):
    return '"%s"' % v if isinstance(v, str) else repr(v)


def export(folder, scad, out, defines):
    cad = os.path.join(EXP, folder, "cad")
    stl = os.path.join(EXP, folder, "stl", out)
    os.makedirs(os.path.dirname(stl), exist_ok=True)
    cmd = ["openscad", "-o", stl]
    for k, v in defines.items():
        cmd += ["-D", f"{k}={dstr(v)}"]
    cmd.append(os.path.join(cad, scad))
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 or "ERROR" in r.stderr:
        print(r.stderr)
        raise SystemExit(f"OpenSCAD failed for {out}")
    mesh = trimesh.load(stl, force="mesh")
    mesh.export(stl, file_type="stl")           # binary STL
    return stl


def verify(path, expect):
    m = trimesh.load(path, force="mesh")
    ext = m.bounds[1] - m.bounds[0]
    ok = m.is_watertight and m.is_winding_consistent and m.volume > 0
    msg = []
    if expect is not None:
        diff = np.abs(np.sort(ext) - np.sort(np.array(expect)))
        if diff.max() > 0.6:
            ok = False
            msg.append(f"size {np.round(ext, 2)} ≠ expected {expect}")
    size = os.path.getsize(path)
    print(f"  {'OK ' if ok else 'BAD'} {os.path.relpath(path, EXP):58s} {len(m.faces):7d} tris "
          f"{size/1024:7.0f} KB  bbox {ext[0]:6.1f} × {ext[1]:6.1f} × {ext[2]:6.1f} mm  "
          f"vol {m.volume/1000:6.1f} cm³  watertight={m.is_watertight} {' '.join(msg)}")
    return ok, m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    bad = 0
    for folder, scad, out, defines, expect, web in PARTS:
        path = os.path.join(EXP, folder, "stl", out)
        if not a.check:
            export(folder, scad, out, defines)
        ok, _ = verify(path, expect)
        bad += not ok
        if web:
            dst_dir = os.path.join(SITE_MODELS, folder)
            os.makedirs(dst_dir, exist_ok=True)
            if os.path.getsize(path) > 1.5 * 1024 * 1024:
                print("  !! larger than 1.5 MB, not published"); bad += 1; continue
            shutil.copy2(path, os.path.join(dst_dir, out))
    print("all parts OK" if not bad else f"{bad} part(s) FAILED")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
