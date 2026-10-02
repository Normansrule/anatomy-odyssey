"""Export Z-Anatomy structures to compressed glTF for Anatomy Odyssey (Milestone 2).

Run inside Blender (4.x) with the Z-Anatomy .blend open:

    blender Z-Anatomy.blend --background --python tools/zanatomy_export_blender.py -- \
        --out assets/anatomy --tier organ --objects "Femur.r" "Femur.l"

Source: https://github.com/Z-Anatomy/The-blend  (download the .blend yourself into
tools/sources/, which is git-ignored; the atlas is several gigabytes).

License duty: Z-Anatomy is CC BY-SA 4.0 and derives from BodyParts3D (CC BY-SA 2.1 Japan).
Every exported file is a derivative, so it stays CC BY-SA, lives under assets/anatomy/,
and gets a line in assets/CREDITS.md. This script appends that line for you.
Never mix a NonCommercial (NC) asset into this folder.

What it does per object:
  1. duplicates it (the source file is never modified)
  2. applies modifiers, then decimates to the tier's triangle budget
  3. exports a GLB with Draco mesh compression
  4. records the SHA-256 and size so tools/build-asset-manifest.mjs can verify it
"""
import argparse
import datetime
import hashlib
import sys
from pathlib import Path

import bpy  # type: ignore  # provided by Blender

# Triangle budgets per tier: whole body is many structures at low detail;
# a single organ gets more detail because it fills the screen.
TIER_BUDGETS = {"body": 8_000, "system": 20_000, "organ": 120_000}


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--tier", choices=TIER_BUDGETS.keys(), required=True)
    ap.add_argument("--objects", nargs="+", required=True, help="Z-Anatomy object names")
    return ap.parse_args(argv)


def triangle_count(obj):
    mesh = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    n = sum(len(p.vertices) - 2 for p in mesh.polygons)
    obj.to_mesh_clear()
    return n


def export(name, tier, out_dir):
    src = bpy.data.objects.get(name)
    if src is None or src.type != "MESH":
        print(f"skip {name}: not found or not a mesh")
        return None
    bpy.ops.object.select_all(action="DESELECT")
    dup = src.copy()
    dup.data = src.data.copy()
    bpy.context.collection.objects.link(dup)
    bpy.context.view_layer.objects.active = dup
    dup.select_set(True)
    for mod in list(dup.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    budget = TIER_BUDGETS[tier]
    tris = triangle_count(dup)
    if tris > budget:
        dec = dup.modifiers.new("decimate", "DECIMATE")
        dec.ratio = budget / tris
        bpy.ops.object.modifier_apply(modifier=dec.name)
    slug = name.lower().replace(".", "-").replace(" ", "-")
    path = out_dir / f"{tier}-{slug}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_apply=True,
        export_extras=False,
    )
    bpy.data.objects.remove(dup, do_unlink=True)
    data = path.read_bytes()
    return path, hashlib.sha256(data).hexdigest(), len(data)


def main():
    args = parse_args()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    credits = Path("assets/CREDITS.md")
    today = datetime.date.today().isoformat()
    for name in args.objects:
        result = export(name, args.tier, out_dir)
        if not result:
            continue
        path, digest, size = result
        print(f"{path}  {size} bytes  sha256={digest}")
        with credits.open("a", encoding="utf-8") as f:
            f.write(
                f"| {path.as_posix()} | Z-Anatomy object \"{name}\", decimated for the {args.tier} tier ({today}) "
                f"| Z-Anatomy project, derived from BodyParts3D (DBCLS) | CC BY-SA 4.0 "
                f"| https://github.com/Z-Anatomy/The-blend |\n"
            )
    print("Now run: npm run manifest")


if __name__ == "__main__":
    main()
