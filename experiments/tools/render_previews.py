#!/usr/bin/env python3
"""Render PNG previews of every STL (and a few assemblies) for the experiment READMEs.

    python3 experiments/tools/render_previews.py

Pure matplotlib (no OpenGL needed): each triangle is Lambert-shaded against a key light
and a cool rim light, then drawn with Poly3DCollection. Output: <folder>/images/*.png
"""
import os
import numpy as np
import trimesh
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

from build_cad import PARTS, EXP

BG = "#070a14"
PALETTE = {"ice": (0.49, 0.78, 1.0), "flame": (1.0, 0.48, 0.24), "nebula": (0.69, 0.55, 1.0),
           "aurora": (0.31, 0.94, 0.72), "sol": (1.0, 0.76, 0.29), "paper": (0.86, 0.84, 0.80),
           "bottle": (0.55, 0.80, 0.95)}


def shade(mesh, base, alpha=1.0):
    n = mesh.face_normals
    key = np.array([0.45, -0.55, 0.70]); key /= np.linalg.norm(key)
    rim = np.array([-0.6, 0.7, 0.2]); rim /= np.linalg.norm(rim)
    k = np.clip(n @ key, 0, 1)
    r = np.clip(n @ rim, 0, 1) ** 2
    lum = 0.22 + 0.70 * k
    col = np.outer(lum, base) + np.outer(0.35 * r, np.array([0.55, 0.75, 1.0]))
    col = np.clip(col, 0, 1)
    return np.column_stack([col, np.full(len(col), alpha)])


def draw(meshes, out, elev=18, azim=-58, size=(6, 6), title=None, zoom=1.0):
    fig = plt.figure(figsize=size, dpi=140, facecolor=BG)
    ax = fig.add_subplot(111, projection="3d", facecolor=BG)
    allv = np.vstack([m.vertices for m, _, _ in meshes])
    lo, hi = allv.min(0), allv.max(0)
    c = (lo + hi) / 2
    half = np.maximum((hi - lo) / 2, (hi - lo).max() * 0.18) * 1.04 / zoom
    e, a = np.radians(elev), np.radians(azim)
    eye = np.array([np.cos(e) * np.cos(a), np.cos(e) * np.sin(a), np.sin(e)])
    ext = (hi - lo).max()
    for m, colr, alpha in meshes:
        # split long triangles so the painter's-algorithm depth sort behaves, then cull back faces
        v, f = trimesh.remesh.subdivide_to_size(m.vertices, m.faces, max_edge=ext / 30, max_iter=6)
        m = trimesh.Trimesh(v, f, process=False)
        if alpha >= 1.0:
            m.update_faces(m.face_normals @ eye > -0.02)
        fcol = shade(m, np.array(PALETTE[colr]), alpha)
        pc = Poly3DCollection(m.vertices[m.faces], facecolors=fcol, edgecolors=fcol, linewidths=0.25)
        ax.add_collection3d(pc)
    ax.set_xlim(c[0] - half[0], c[0] + half[0]); ax.set_ylim(c[1] - half[1], c[1] + half[1]); ax.set_zlim(c[2] - half[2], c[2] + half[2])
    ax.set_box_aspect(tuple(half), zoom=1.12)
    ax.view_init(elev=elev, azim=azim)
    ax.set_axis_off()
    if title:
        fig.text(0.5, 0.04, title, ha="center", color="#c3cae6", fontsize=10, family="monospace")
    plt.subplots_adjust(0, 0, 1, 1)
    fig.savefig(out, facecolor=BG)
    plt.close(fig)
    # crop empty background, keep a margin
    from PIL import Image
    im = Image.open(out).convert("RGB")
    arr = np.asarray(im).astype(int)
    bg = np.array([int(BG[i:i + 2], 16) for i in (1, 3, 5)])
    ys, xs = np.nonzero(np.abs(arr - bg).sum(2) > 24)
    if len(xs):
        pad = 28
        box = (max(xs.min() - pad, 0), max(ys.min() - pad, 0), min(xs.max() + pad, im.width), min(ys.max() + pad, im.height))
        im.crop(box).save(out)
    print("wrote", os.path.relpath(out, EXP))


def load(folder, name):
    return trimesh.load(os.path.join(EXP, folder, "stl", name), force="mesh")


def tube(od, id_, length, z0, sections=96):
    outer = trimesh.creation.cylinder(radius=od / 2, height=length, sections=sections)
    outer.apply_translation([0, 0, z0 + length / 2])
    return outer


def main():
    colours = {"nose": "ice", "fincan": "flame", "ring": "sol", "engine": "sol", "motor": "aurora", "sled": "nebula"}
    for folder, _, name, _, _, _ in PARTS:
        m = load(folder, name)
        key = next((v for k, v in colours.items() if name.startswith(k)), "ice")
        img = os.path.join(EXP, folder, "images", name.replace(".stl", ".png"))
        os.makedirs(os.path.dirname(img), exist_ok=True)
        elev = 28 if name.startswith(("ring", "engine", "sled", "fincan")) else 12
        draw([(m, key, 1.0)], img, elev=elev, size=(4.2, 4.2), title=name)

    # ---- nose-cone family (21) -------------------------------------------------------------
    f = "21-3d-printed-model-rocket"
    names = ["conical", "ogive", "vonkarman", "lvhaack", "elliptical"]
    meshes = []
    for i, n in enumerate(names):
        m = load(f, f"nose_{n}_BT50.stl").copy()
        m.apply_translation([i * 36 - 72, 0, 0])
        meshes.append((m, ["ice", "nebula", "aurora", "sol", "flame"][i], 1.0))
    draw(meshes, os.path.join(EXP, f, "images", "nosecone_family.png"), elev=6, azim=-90, size=(9, 4.2), zoom=1.0,
         title="conical · tangent ogive · von Kármán · LV-Haack · elliptical  (BT-50)")

    # ---- assembled BT-60 rocket (21) ---------------------------------------------------------
    nose = load(f, "nose_vonkarman_BT60.stl").copy()
    fc = load(f, "fincan_BT60.stl").copy()
    body_len = 300
    fc_h = fc.bounds[1][2]
    body = tube(41.6, 40.5, body_len, 0)
    nose.apply_translation([0, 0, body_len + 40])        # exploded gap
    fc.apply_translation([0, 0, -30])
    mount = load(f, "motor_mount_24mm_BT60.stl").copy(); mount.apply_translation([0, 0, -120])
    draw([(mount, "aurora", 1.0), (fc, "flame", 1.0), (body, "paper", 1.0), (nose, "ice", 1.0)],
         os.path.join(EXP, f, "images", "assembly_BT60.png"), elev=10, azim=-60, size=(4.5, 8), zoom=1.0,
         title="exploded: motor mount · fin can · BT-60 tube · nose")

    # ---- water rocket on a bottle (10) --------------------------------------------------------
    f = "10-water-bottle-rocket"
    nose = load(f, "nose_2L.stl").copy()
    fc = load(f, "fincan_2L.stl").copy()
    # simplified 2 L bottle, neck down: neck 0–25, shoulder cone 25–85, body 85–285
    neck = trimesh.creation.cylinder(radius=13.7, height=25, sections=64); neck.apply_translation([0, 0, 12.5])
    sh = trimesh.creation.cone(radius=55, height=80, sections=96)
    sh.apply_transform(trimesh.transformations.rotation_matrix(np.pi, [1, 0, 0])); sh.apply_translation([0, 0, 85])
    body = trimesh.creation.cylinder(radius=55, height=200, sections=96); body.apply_translation([0, 0, 85 + 100])
    fc.apply_translation([0, 0, 78])
    nose.apply_translation([0, 0, 285 - 45 + 30])
    draw([(neck, "bottle", 0.5), (sh, "bottle", 0.5), (body, "bottle", 0.5), (fc, "flame", 1.0), (nose, "ice", 1.0)],
         os.path.join(EXP, f, "images", "assembly_2L.png"), elev=12, azim=-60, size=(5, 7.5), zoom=1.0,
         title="fin can + nose on a 2 L bottle (neck = nozzle, down)")


if __name__ == "__main__":
    main()
