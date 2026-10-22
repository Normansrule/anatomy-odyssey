"""Export the Z-Anatomy skeleton for the whole-body bundle, with baked shading.

Z-Anatomy (Lluís Vinent and Gauthier Kervyn, CC BY-SA 4.0) is an open 3D
atlas built on BodyParts3D, the same measured body the app uses, with every
bone remodeled into clean, detailed surfaces: sutures, foramina, ridges and
joint faces that the smoothed MRI meshes lose. This script reads its Blender
file, keeps the bones and teeth, moves them into the app's frame, and bakes
ambient occlusion into each vertex (how much of the sky a point on a bone
sees, with all the other bones in the way), so eye sockets, the gaps between
vertebrae and the inside of the pelvis darken the way real bone does.

    python3 -m pip install bpy==4.2.0            # Blender as a Python module (Python 3.11)
    python3 tools/zanatomy_skeleton.py --fetch   # downloads Z-Anatomy (87 MB) into tools/sources/zanatomy/
    python3 tools/zanatomy_skeleton.py           # writes tools/sources/zanatomy/skeleton.npz
    python3 tools/build_body_meshes.py --skeleton tools/sources/zanatomy/skeleton.npz --from-bundle

The bones are placed by fitting Z-Anatomy onto the bundle's own BodyParts3D
bones (a similarity fit on matched bone centers: about 0.97 scale and a few
centimeters' shift, with a mean error near 1 mm), so they sit exactly where
the organs expect them.
"""
import argparse
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'tools' / 'sources' / 'zanatomy'
ZIP_URL = 'https://raw.githubusercontent.com/Z-Anatomy/Models-of-human-anatomy/master/Z-Anatomy.zip'
BLEND = SRC / 'Z-Anatomy' / 'Startup.blend'
OUT = SRC / 'skeleton.npz'
BUNDLE = ROOT / 'assets' / 'anatomy' / 'body.glb'

sys.path.insert(0, str(ROOT / 'tools'))
from build_body_meshes import classify  # noqa: E402  (the same rules as the rest of the body)
from glb_read import read_glb  # noqa: E402

ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth']
SPINE = {'C': 'cervical', 'T': 'thoracic', 'L': 'lumbar'}
SKIP = re.compile(r'sinus|arytenoid|corniculate|cricoid|thyroid cartilage|septal cartilage|alar cartilage|malleus|incus|stapes')
# How many triangles each kind of bone keeps at most (the source has up to ~37,000).
BUDGET = {'skull': 9000, 'femur': 8000, 'pelvis': 8000, 'skeletal-system': 6000, 'vertebral-column': 3500, 'rib-cage': 2600,
          'shoulder-girdle': 5000, 'hand-bones': 900, 'foot-bones': 1400}
AO_RAYS = 24
AO_REACH = 0.04  # meters: how far a neighbor can be and still shade


def bp3d_name(name):
    """Z-Anatomy's object name → the BodyParts3D-style name the build rules expect."""
    side = {'.l': 'left ', '.r': 'right '}.get(name[-2:], '')
    n = (name[:-2] if side else name).lower()
    m = re.fullmatch(r'vertebra ([ctl])(\d+)', n)
    if m:
        n = f'{ORDINAL[int(m.group(2)) - 1]} {SPINE[m.group(1).upper()]} vertebra'
    n = re.sub(r'^atlas \(c1\)$', 'atlas', n)
    n = re.sub(r'^axis \(c2\)$', 'axis', n)
    n = n.replace('finger of foot', 'toe')
    n = re.sub(r'^(anterior|middle|posterior) cells of ethmoid bone$', 'ethmoid', n)
    n = {'manubrium of sternum': 'manubrium', 'inferior nasal concha bone': 'inferior nasal concha', 'ethmoid bone': 'ethmoid'}.get(n, n)
    if re.search(r'incisor|canine|premolar|molar', n) and 'tooth' not in n:
        n += ' tooth'
    return side + n


def fetch():
    SRC.mkdir(parents=True, exist_ok=True)
    zpath = SRC / 'Z-Anatomy.zip'
    if not zpath.exists():
        zpath.write_bytes(urllib.request.urlopen(ZIP_URL, timeout=900).read())
    with zipfile.ZipFile(zpath) as z:
        z.extractall(SRC)
    print(f'unpacked {BLEND.relative_to(ROOT)}')


def fit_similarity(a, b):
    """Scale s, rotation R and shift t with b ≈ s·R·a + t (Umeyama), for matched rows."""
    ma, mb = a.mean(0), b.mean(0)
    x, y = a - ma, b - mb
    u, sv, vt = np.linalg.svd(y.T @ x / len(a))
    d = np.eye(3)
    d[2, 2] = np.sign(np.linalg.det(u @ vt))
    r = u @ d @ vt
    s = np.trace(np.diag(sv) @ d) / (x ** 2).sum(1).mean()
    return s, r, mb - s * r @ ma


def area_center(v, f):
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    w = np.linalg.norm(np.cross(b - a, c - a), axis=1)
    return ((a + b + c) / 3 * w[:, None]).sum(0) / w.sum()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--fetch', action='store_true', help='download and unpack Z-Anatomy first')
    args = ap.parse_args()
    if args.fetch:
        fetch()
    if not BLEND.exists():
        sys.exit('No Z-Anatomy file. Run: python3 tools/zanatomy_skeleton.py --fetch')
    import bpy  # first: it makes bmesh and mathutils importable
    import bmesh
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree

    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    dg = bpy.context.evaluated_depsgraph_get()
    bones = {}
    # Names first: removing the scratch objects below would invalidate a live iterator.
    for o in [bpy.data.objects[n] for n in sorted(o.name for o in bpy.data.collections['1: Skeletal system'].all_objects)]:
        # Objects ending in .i, .j, .g and so on are labels and groups, not bones.
        if o.type != 'MESH' or (re.search(r'\.[a-z]$', o.name) and o.name[-2:] not in ('.l', '.r')):
            continue
        name = bp3d_name(o.name)
        rule = None if SKIP.search(name) else classify(name)
        if not rule or rule['system'] != 'skeletal':
            continue
        e = o.evaluated_get(dg)
        mesh = e.to_mesh()
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        target = BUDGET.get(rule['card'], 3000)
        if len(bm.faces) > target:
            # Collapse edges until the bone is within its budget, keeping its outline.
            bmesh.ops.dissolve_degenerate(bm, dist=1e-7, edges=bm.edges[:])
            data = bpy.data.meshes.new('_tmp')  # the evaluated mesh cannot carry a modifier
            bm.to_mesh(data)
            bm.free()
            mod_obj = bpy.data.objects.new('_tmp', data)
            bpy.context.scene.collection.objects.link(mod_obj)
            mod = mod_obj.modifiers.new('d', 'DECIMATE')
            mod.ratio = target / max(1, len(mesh.polygons))
            mod.use_collapse_triangulate = True
            dg2 = bpy.context.evaluated_depsgraph_get()
            low = mod_obj.evaluated_get(dg2).to_mesh()
            bm = bmesh.new()
            bm.from_mesh(low)
            mod_obj.evaluated_get(dg2).to_mesh_clear()
            bpy.data.objects.remove(mod_obj)
            bpy.data.meshes.remove(data)
            bmesh.ops.triangulate(bm, faces=bm.faces[:])
        mw = e.matrix_world
        v = np.array([tuple(mw @ x.co) for x in bm.verts], dtype=np.float64)
        bm.verts.index_update()
        f = np.array([[x.index for x in face.verts] for face in bm.faces], dtype=np.int64)
        bm.free()
        e.to_mesh_clear()
        # Z-Anatomy: meters, z up, the front toward -y. The app: y up, facing +z.
        v = np.stack([v[:, 0], v[:, 2], -v[:, 1]], 1)
        # One side of the body is a mirror image, which turns its triangles inside out:
        # wind every bone so that its volume is positive and its surface faces outward.
        a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
        if np.einsum('ij,ij->i', a, np.cross(b, c)).sum() < 0:
            f = f[:, [0, 2, 1]]
        bones[o.name] = {'name': name, 'v': v, 'f': f}
    print(f'{len(bones)} bones, {sum(len(b["f"]) for b in bones.values()):,} triangles')

    # Fit onto the bundle's BodyParts3D bones by matching bone centers.
    _, ours = read_glb(BUNDLE)
    ours = {p['label'] + (':' + p['side'] if p.get('side') else ''): p for p in ours if p['extras'].get('system') == 'skeletal'}
    groups = {}
    for b in bones.values():
        rule = classify(b['name'])
        key = rule['label'] + (':' + rule['side'] if rule['side'] else '')
        groups.setdefault(key, []).append(b)
    a, t = [], []
    for key, members in groups.items():
        if key in ours and members:
            off, fs = 0, []
            for m in members:
                fs.append(m['f'] + off)
                off += len(m['v'])
            a.append(area_center(np.concatenate([m['v'] for m in members]), np.concatenate(fs)))
            t.append(area_center(ours[key]['pos'], ours[key]['idx'].reshape(-1, 3)))
    s, r, shift = fit_similarity(np.array(a), np.array(t))
    err = np.linalg.norm((s * (r @ np.array(a).T)).T + shift - np.array(t), axis=1)
    print(f'fit on {len(a)} bones: scale {s:.4f}, mean error {err.mean() * 1000:.1f} mm, worst {err.max() * 1000:.1f} mm')
    for b in bones.values():
        b['v'] = (s * (r @ b['v'].T)).T + shift

    # Ambient occlusion: from each vertex, rays over the half of the sky its surface faces.
    allv = np.concatenate([b['v'] for b in bones.values()])
    allf, off = [], 0
    for b in bones.values():
        allf.append(b['f'] + off)
        off += len(b['v'])
    allf = np.concatenate(allf)
    tree = BVHTree.FromPolygons([Vector(p) for p in allv], allf.tolist(), all_triangles=True)
    rng = np.random.default_rng(1)
    # Cosine-weighted directions about +z, rotated onto each normal below.
    u1, u2 = rng.random(AO_RAYS), rng.random(AO_RAYS)
    dirs = np.stack([np.sqrt(u1) * np.cos(2 * np.pi * u2), np.sqrt(u1) * np.sin(2 * np.pi * u2), np.sqrt(1 - u1)], 1)
    for b in bones.values():
        v, f = b['v'], b['f']
        fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
        n = np.zeros_like(v)
        for k in range(3):
            np.add.at(n, f[:, k], fn)
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
        ao = np.empty(len(v))
        for i, (p, nn) in enumerate(zip(v, n)):
            if np.linalg.norm(nn) < 0.5:
                ao[i] = 1  # a vertex only on zero-area slivers has no side to face
                continue
            # A frame with nn as its z axis.
            helper = np.array([1.0, 0, 0]) if abs(nn[0]) < 0.9 else np.array([0, 1.0, 0])
            tx = np.cross(nn, helper)
            tx /= np.linalg.norm(tx)
            ty = np.cross(nn, tx)
            origin = Vector(p + nn * 2e-4)
            hit = 0
            for d in dirs:
                w = tx * d[0] + ty * d[1] + nn * d[2]
                if tree.ray_cast(origin, Vector(w), AO_REACH)[0] is not None:
                    hit += 1
            ao[i] = 1 - hit / AO_RAYS
        # One pass of averaging with neighbors takes the speckle out of the rays.
        acc = ao.copy()
        cnt = np.ones(len(v))
        for a_, b_ in ((0, 1), (1, 2), (2, 0)):
            np.add.at(acc, f[:, a_], ao[f[:, b_]])
            np.add.at(cnt, f[:, a_], 1)
            np.add.at(acc, f[:, b_], ao[f[:, a_]])
            np.add.at(cnt, f[:, b_], 1)
        b['ao'] = (acc / cnt).astype(np.float32)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {}
    for i, b in enumerate(bones.values()):
        payload[f'{i}|name'] = np.array(b['name'])
        payload[f'{i}|v'] = b['v'].astype(np.float32)
        payload[f'{i}|f'] = b['f'].astype(np.int32)
        payload[f'{i}|ao'] = b['ao']
    np.savez_compressed(OUT, **payload)
    print(f'wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
