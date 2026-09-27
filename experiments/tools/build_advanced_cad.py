#!/usr/bin/env python3
"""Export, verify, preview and publish the printable parts of the level 3-4 experiments (30-44).

    python3 experiments/tools/build_advanced_cad.py            # export + verify + render + publish
    python3 experiments/tools/build_advanced_cad.py --check    # verify the existing STLs only

For every part it
  1. runs OpenSCAD (`openscad -o part.stl -D ... part.scad`),
  2. re-saves the mesh as binary STL with trimesh (about 5x smaller than OpenSCAD's ASCII),
  3. checks: watertight, consistent winding, positive volume, one body (unless stated),
     and the bounding box against a size computed by hand from the parameters (+-0.6 mm),
  4. renders a shaded PNG preview into <folder>/images/,
  5. copies the web subset to site/models/<folder>/ (each file must be < 1.5 MB).

Requires OpenSCAD 2021+ and `pip install trimesh numpy matplotlib`.
Companion of build_cad.py (levels 0-2); kept separate so the two can evolve independently.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys

import numpy as np
import trimesh

HERE = os.path.dirname(os.path.abspath(__file__))
EXP = os.path.dirname(HERE)
SITE_MODELS = os.path.normpath(os.path.join(EXP, "..", "site", "models"))

# (folder, scad (relative to folder/cad), stl name, -D defines, expected bbox or None, bodies, publish?, colour)
PARTS = [
    # 30: sled for a 38 mm tube: X = -4 (tail bulkhead) .. 83 (pegs), Y/Z = tube_id - fit = 37.5
    ("30-flight-computer-pcb", "avionics_sled.scad", "avionics_sled.stl", {"PART": "sled"}, (87.0, 37.5, 37.5), 1, True, "ice"),
    ("30-flight-computer-pcb", "avionics_sled.scad", "nose_bulkhead.stl", {"PART": "nose"}, (4.0, 37.5, 37.5), 1, True, "flame"),
    # 32: barn-door tracker parts
    ("32-barn-door-star-tracker", "barn_door_parts.scad", "motor_mount.stl", {"PART": "motor_mount"}, (60.0, 44.0, 34.0), 1, True, "ice"),
    ("32-barn-door-star-tracker", "barn_door_parts.scad", "coupler.stl", {"PART": "coupler"}, (16.0, 16.0, 24.0), 1, True, "flame"),
    ("32-barn-door-star-tracker", "barn_door_parts.scad", "carriage.stl", {"PART": "carriage"}, (18.0, 38.0, 14.9), 1, True, "sol"),
    ("32-barn-door-star-tracker", "barn_door_parts.scad", "contact_plate.stl", {"PART": "contact_plate"}, (76.0, 30.0, 3.0), 1, False, "paper"),
    ("32-barn-door-star-tracker", "barn_door_parts.scad", "polar_sight.stl", {"PART": "polar_sight"}, (80.0, 32.0, 14.0), 1, False, "nebula"),
    # 42: 1U CubeSat-style structure: 100 x 100 x 113.5; panels 100 x 113.5 x 2
    ("42-near-space-balloon-cubesat", "cubesat_1u.scad", "cubesat_1u_frame.stl", {"PART": "frame"}, (100.0, 100.0, 113.5), 1, True, "ice"),
    ("42-near-space-balloon-cubesat", "cubesat_1u.scad", "cubesat_panel.stl", {"PART": "panel"}, (100.0, 113.5, 2.0), 1, False, "paper"),
    ("42-near-space-balloon-cubesat", "cubesat_1u.scad", "cubesat_panel_cam.stl", {"PART": "panel_cam"}, (100.0, 113.5, 2.0), 1, True, "flame"),
    # 43: horn preview (a1 + 2t, b1 + 2t, guide + t + pe) and the probe jig (two pieces)
    ("43-hydrogen-line-radio-telescope", "horn.scad", "horn_preview.stl", {"PART": "horn"}, (680.97, 520.45, 757.47), 1, True, "metal"),
    ("43-hydrogen-line-radio-telescope", "horn.scad", "probe_jig.stl", {"PART": "probe_jig"}, (87.61, 39.0, 12.0), 2, False, "sol"),
]


def scad_define(k, v):
    if isinstance(v, str):
        return ["-D", f'{k}="{v}"']
    return ["-D", f"{k}={v}"]


def export(folder, scad, out, defines):
    src = os.path.join(EXP, folder, "cad", scad)
    dst_dir = os.path.join(EXP, folder, "stl")
    os.makedirs(dst_dir, exist_ok=True)
    dst = os.path.join(dst_dir, out)
    cmd = ["openscad", "-o", dst]
    for k, v in defines.items():
        cmd += scad_define(k, v)
    cmd.append(src)
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(dst):
        print(r.stderr[-2000:])
        raise SystemExit(f"OpenSCAD failed for {folder}/{scad}")
    mesh = trimesh.load(dst, force="mesh")
    mesh.export(dst)  # binary STL
    return dst


def verify(path, bbox, bodies):
    m = trimesh.load(path, force="mesh")
    ext = m.bounds[1] - m.bounds[0]
    problems = []
    if not m.is_watertight:
        problems.append("not watertight")
    if not m.is_winding_consistent:
        problems.append("inconsistent winding")
    if m.volume <= 0:
        problems.append(f"volume {m.volume:.1f} <= 0")
    n = len(m.split(only_watertight=False))
    if bodies is not None and n != bodies:
        problems.append(f"{n} bodies, expected {bodies}")
    if bbox is not None:
        got = sorted(ext)
        want = sorted(bbox)
        if any(abs(g - w) > 0.6 for g, w in zip(got, want)):
            problems.append(f"bbox {np.round(ext, 2).tolist()} != expected {list(bbox)}")
    size = os.path.getsize(path)
    status = "OK " if not problems else "BAD"
    print(f"  {status} {os.path.relpath(path, EXP):60s} {ext[0]:7.2f} x {ext[1]:7.2f} x {ext[2]:7.2f} mm "
          f"vol {m.volume / 1000:8.2f} cm3  {size / 1024:6.0f} KiB  {'; '.join(problems)}")
    return not problems, m


# ------------------------------------------------------------------ previews
BG = "#070a14"
PALETTE = {"ice": (0.49, 0.78, 1.0), "flame": (1.0, 0.48, 0.24), "nebula": (0.69, 0.55, 1.0),
           "aurora": (0.31, 0.94, 0.72), "sol": (1.0, 0.76, 0.29), "paper": (0.86, 0.84, 0.80),
           "pcb": (0.10, 0.55, 0.28), "metal": (0.75, 0.77, 0.80)}


def shade(mesh, base):
    n = mesh.face_normals
    key = np.array([0.45, -0.55, 0.70]); key /= np.linalg.norm(key)
    rim = np.array([-0.6, 0.7, 0.2]); rim /= np.linalg.norm(rim)
    k = np.clip(n @ key, 0, 1)
    r = np.clip(n @ rim, 0, 1) ** 2
    col = np.outer(0.22 + 0.70 * k, base) + np.outer(0.35 * r, np.array([0.55, 0.75, 1.0]))
    return np.column_stack([np.clip(col, 0, 1), np.ones(len(col))])


def _view_matrix(elev, azim):
    """Rotation that maps model coordinates to camera coordinates (x right, y up, z towards viewer)."""
    a, e = np.radians(azim), np.radians(elev)
    rz = np.array([[np.cos(a), -np.sin(a), 0], [np.sin(a), np.cos(a), 0], [0, 0, 1]])
    rx = np.array([[1, 0, 0], [0, np.cos(e - np.pi / 2), -np.sin(e - np.pi / 2)], [0, np.sin(e - np.pi / 2), np.cos(e - np.pi / 2)]])
    return rx @ rz


def rasterize(meshes, elev=24, azim=-58, width=1400, height=1000, margin=0.06):
    """Tiny z-buffer renderer (orthographic, flat Lambert shading + depth-edge outlines).

    Pure NumPy so it runs anywhere (no OpenGL). Returns an RGB float image.
    """
    R = _view_matrix(elev, azim)
    verts = [m.vertices @ R.T for m, _ in meshes]
    allv = np.vstack(verts)
    lo, hi = allv.min(0), allv.max(0)
    span = max((hi[0] - lo[0]) / width, (hi[1] - lo[1]) / height) * (1 + 2 * margin)
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    img = np.zeros((height, width, 3)); img[:] = np.array([7, 10, 20]) / 255.0
    zbuf = np.full((height, width), -np.inf)
    light = np.array([-0.35, 0.55, 0.76]); light /= np.linalg.norm(light)
    rim = np.array([0.7, -0.2, 0.3]); rim /= np.linalg.norm(rim)
    for (mesh, colour), v in zip(meshes, verts):
        base = np.array(PALETTE.get(colour, colour) if isinstance(colour, str) else colour)
        px = (v[:, 0] - cx) / span + width / 2
        py = height / 2 - (v[:, 1] - cy) / span
        pz = v[:, 2]
        n = mesh.face_normals @ R.T
        lam = np.clip(n @ light, 0, 1)
        rr = np.clip(n @ rim, 0, 1) ** 3
        cols = np.clip(np.outer(0.18 + 0.78 * lam, base) + np.outer(0.30 * rr, [0.55, 0.75, 1.0]), 0, 1)
        for f, col in zip(mesh.faces, cols):
            x0, x1, x2 = px[f]; y0, y1, y2 = py[f]; z0, z1, z2 = pz[f]
            xmin, xmax = int(max(min(x0, x1, x2), 0)), int(min(max(x0, x1, x2) + 1, width))
            ymin, ymax = int(max(min(y0, y1, y2), 0)), int(min(max(y0, y1, y2) + 1, height))
            if xmin >= xmax or ymin >= ymax:
                continue
            den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
            if abs(den) < 1e-12:
                continue
            xs, ys = np.meshgrid(np.arange(xmin, xmax) + 0.5, np.arange(ymin, ymax) + 0.5)
            w0 = ((y1 - y2) * (xs - x2) + (x2 - x1) * (ys - y2)) / den
            w1 = ((y2 - y0) * (xs - x2) + (x0 - x2) * (ys - y2)) / den
            w2 = 1 - w0 - w1
            inside = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
            if not inside.any():
                continue
            z = w0 * z0 + w1 * z1 + w2 * z2
            zb = zbuf[ymin:ymax, xmin:xmax]
            upd = inside & (z > zb)
            zb[upd] = z[upd]
            img[ymin:ymax, xmin:xmax][upd] = col
    # outline where depth jumps (silhouettes and creases facing away)
    finite = np.isfinite(zbuf)
    zf = np.where(finite, zbuf, lo[2] - (hi[2] - lo[2]))
    # second difference is ~0 on any plane however steeply it is tilted, large at depth steps
    lap = np.abs(np.roll(zf, 1, 0) + np.roll(zf, -1, 0) + np.roll(zf, 1, 1) + np.roll(zf, -1, 1) - 4 * zf)
    edge = lap > span * 3.0
    img[edge] = img[edge] * 0.35
    return img


def render(meshes, out, title, elev=24, azim=-58):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    img = rasterize(meshes, elev, azim)
    # 2x2 box filter = cheap anti-aliasing
    h, w, _ = img.shape
    img = img[: h // 2 * 2, : w // 2 * 2].reshape(h // 2, 2, w // 2, 2, 3).mean(axis=(1, 3))
    fig = plt.figure(figsize=(img.shape[1] / 100, img.shape[0] / 100 + 0.45), facecolor=BG)
    ax = fig.add_axes([0, 0, 1, img.shape[0] / (img.shape[0] + 45)])
    ax.imshow(img, interpolation="lanczos")
    ax.set_axis_off()
    fig.text(0.015, 0.985, title, color="white", fontsize=10, va="top")
    allv = np.vstack([m.vertices for m, _ in meshes])
    ext = allv.max(0) - allv.min(0)
    fig.text(0.015, 0.012, f"bounding box {ext[0]:.1f} x {ext[1]:.1f} x {ext[2]:.1f} mm", color="#9aa4b2", fontsize=8)
    fig.savefig(out, dpi=100, facecolor=BG)
    plt.close(fig)


def box(x0, x1, y0, y1, z0, z1):
    b = trimesh.creation.box(extents=(x1 - x0, y1 - y0, z1 - z0))
    b.apply_translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    return b


# extra context meshes for assembly previews (not printed)
def assemblies():
    out = []
    f30 = os.path.join(EXP, "30-flight-computer-pcb", "stl")
    if os.path.exists(os.path.join(f30, "avionics_sled.stl")):
        sled = trimesh.load(os.path.join(f30, "avionics_sled.stl"), force="mesh")
        nose = trimesh.load(os.path.join(f30, "nose_bulkhead.stl"), force="mesh")
        nose.apply_translation((80.0 - nose.bounds[0][0], 0, 0))
        pcb = box(0, 80, -15, 15, -0.8, 0.8)
        pico = box(0, 51, -10.5, 10.5, 0.8, 1.8)
        batt = box(2, 42, -12.5, 12.5, -5.9 - 8, -5.9)
        out.append(("30-flight-computer-pcb", "sled-assembly.png",
                    "CC-FL1 in its 38 mm sled (PCB green, Pico, 802540 Li-Po)",
                    [(sled, "ice"), (nose, "flame"), (pcb, "pcb"), (pico, "paper"), (batt, "sol")]))
    f42 = os.path.join(EXP, "42-near-space-balloon-cubesat", "stl")
    if os.path.exists(os.path.join(f42, "cubesat_1u_frame.stl")):
        fr = trimesh.load(os.path.join(f42, "cubesat_1u_frame.stl"), force="mesh")
        pc = trimesh.load(os.path.join(f42, "cubesat_panel_cam.stl"), force="mesh")
        pc.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
        pc.apply_translation((0, 0, 0) - pc.bounds[0] + np.array([0, -2.0, 0]))
        pn = trimesh.load(os.path.join(f42, "cubesat_panel.stl"), force="mesh")
        pn.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
        pn.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 0, 1]))
        pn.apply_translation(np.array([100.0, 0, 0]) - pn.bounds[0])
        boards = [box(9, 91, 9, 91, z, z + 1.6) for z in (20, 45, 80)]
        meshes = [(fr, "ice"), (pc, "flame"), (pn, "paper")] + [(b, "pcb") for b in boards]
        out.append(("42-near-space-balloon-cubesat", "cubesat-assembly.png",
                    "1U structure with two side panels and three 82 x 82 mm boards on M3 rods", meshes))
    f32 = os.path.join(EXP, "32-barn-door-star-tracker", "stl")
    if os.path.exists(os.path.join(f32, "carriage.stl")):
        import math
        R, theta = 228.6, math.radians(8.0)
        ld = lambda n: trimesh.load(os.path.join(f32, n), force="mesh")
        base = box(-20, 300, -50, 50, 0, 12)
        top = box(-20, 300, -50, 50, 12, 24)
        top.apply_transform(trimesh.transformations.rotation_matrix(-theta, [0, 1, 0], [0, 0, 12]))
        hinge = trimesh.creation.cylinder(radius=3, height=100, sections=24)
        hinge.apply_transform(trimesh.transformations.rotation_matrix(math.pi / 2, [1, 0, 0]))
        hinge.apply_translation((0, 0, 12))
        mount = ld("motor_mount.stl"); mount.apply_translation((R, 0, -34))
        motor = trimesh.creation.cylinder(radius=14, height=19, sections=40)
        motor.apply_translation((R, -8, -34 - 9.5))
        d = R * math.tan(theta)
        rod = trimesh.creation.cylinder(radius=3, height=110, sections=20); rod.apply_translation((R, 0, 45))
        car = ld("carriage.stl"); car.apply_translation((R, 0, 12 + d - 14.9))
        guide = trimesh.creation.cylinder(radius=3, height=70, sections=20); guide.apply_translation((R, 20, 12 + 35))
        sight = ld("polar_sight.stl")
        sight.apply_translation((60, 0, 24))
        sight.apply_transform(trimesh.transformations.rotation_matrix(-theta, [0, 1, 0], [0, 0, 12]))
        out.append(("32-barn-door-star-tracker", "tracker-assembly.png",
                    "Barn-door tracker opened 8 degrees: R = 228.6 mm, M6 rod, printed parts",
                    [(base, "paper"), (top, "paper"), (hinge, "metal"), (mount, "ice"), (motor, "metal"),
                     (rod, "metal"), (guide, "metal"), (car, "sol"), (sight, "nebula")]))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify existing STLs only")
    ap.add_argument("--only", default="", help="substring filter on folder name")
    args = ap.parse_args()
    ok_all = True
    for folder, scad, out, defines, bbox, bodies, publish, colour in PARTS:
        if args.only and args.only not in folder:
            continue
        path = os.path.join(EXP, folder, "stl", out)
        if not args.check:
            export(folder, scad, out, defines)
        ok, mesh = verify(path, bbox, bodies)
        ok_all &= ok
        if args.check:
            continue
        img_dir = os.path.join(EXP, folder, "images")
        os.makedirs(img_dir, exist_ok=True)
        render([(mesh, colour)], os.path.join(img_dir, out.replace(".stl", ".png")), f"{folder}  /  {out}")
        if publish:
            d = os.path.join(SITE_MODELS, folder)
            os.makedirs(d, exist_ok=True)
            if os.path.getsize(path) >= 1.5 * 1024 * 1024:
                print(f"  !! {out} is larger than 1.5 MB - not published")
                ok_all = False
            else:
                shutil.copy2(path, os.path.join(d, out))
    if not args.check:
        for folder, name, title, meshes in assemblies():
            if args.only and args.only not in folder:
                continue
            render(meshes, os.path.join(EXP, folder, "images", name), title)
            print(f"  rendered {folder}/images/{name}")
    print("ALL OK" if ok_all else "SOME PARTS FAILED")
    sys.exit(0 if ok_all else 1)


if __name__ == "__main__":
    main()
