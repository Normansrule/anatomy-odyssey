"""Build the whole-body anatomy bundle (assets/anatomy/body.glb) from BodyParts3D.

BodyParts3D is a full adult male atlas segmented from MRI by the Database
Center for Life Science (DBCLS), Japan, licensed CC BY-SA 2.1 Japan. This
script turns 900-odd of its STL parts into one compact, smooth glTF file the
whole-body scene loads, and writes the landmark positions the procedural
parts (nerves, small vessels, lymph nodes, thyroid) and the dives aim at.

Download the STL files first (they are not committed; about 1.3 GB):

    python3 tools/build_body_meshes.py --fetch          # into tools/sources/bp3d/
    python3 tools/build_body_meshes.py                  # writes the bundle
    npm run manifest                                     # re-hash assets/

Source mirror: https://github.com/Kevin-Mattheus-Moerman/BodyParts3D
(a clone of BodyParts3D release 3.0, https://lifesciencedb.jp/bp3d/).

Per part: weld the STL triangle soup into a mesh, smooth away the MRI voxel
steps (Taubin smoothing, which does not shrink), simplify to a triangle
budget, move into the app's frame (meters, y up, facing +z), and merge
parts that share one clickable label. Vertex positions are stored as 16-bit
integers and normals as 8-bit (glTF KHR_mesh_quantization), so three.js
loads the file with no decoder.

Needs: numpy, fast-simplification (pip install numpy fast-simplification).
"""
import argparse
import concurrent.futures as cf
import csv
import heapq
import json
import os
import re
import struct
import sys
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'tools' / 'sources' / 'bp3d'
OUT = ROOT / 'assets' / 'anatomy' / 'body.glb'
LANDMARKS = ROOT / 'src' / 'data' / 'bodyLandmarks.json'
MIRROR = 'https://raw.githubusercontent.com/Kevin-Mattheus-Moerman/BodyParts3D/main/assets/BodyParts3D_data/'

# BodyParts3D is in millimeters, z up, the body's front toward -y, its left toward +x.
# The app is in meters, y up, facing +z. Z_SHIFT puts the front of the breastbone
# about 12 cm in front of the origin, as in the rest of the app.
Z_SHIFT = -80.0


def to_app(v):
    """BodyParts3D millimeters → app meters: (x, z, -(y) + shift)."""
    out = np.empty_like(v)
    out[:, 0] = v[:, 0] / 1000
    out[:, 1] = v[:, 2] / 1000
    out[:, 2] = (-v[:, 1] + Z_SHIFT) / 1000
    return out


# ── Which part goes where ──────────────────────────────────────────────
# Rules are tried in order; the first whose pattern matches the part's English
# name wins. Fields: system (the body toggle it belongs to), card (what a
# click opens), label (hover text; {name} is the cleaned part name),
# tissue (surface), budget (target triangles, before merging), and
# side=True to keep left and right as separate meshes.
SKIP = re.compile(
    r'hair|eyebrow|ventricle|aqueduct|foramen|choroid|fornix|commissure|stria|habenula|septum pellucidum|lamina terminalis|'
    r'mammillary|tuber cinereum|central canal|interpeduncular|brachium of|colliculus|geniculate|caudate|putamen|globus pallidus|'
    r'thalamus|hypothalamus|amygdala|hippocampus|internal capsule|optic tract|taenia|pancreatic duct|labial part|gingiva|'
    r'penis|glans|testis|epididymis|deferent|seminal|prostate|urethra|anal sphincter|coccygeus|iliococcygeus|pubococcygeus|'
    r'puborectalis|tendinous arch|white matter|levator ani'
)

SKULL = r'frontal bone|parietal bone|occipital bone|temporal bone|sphenoid|ethmoid|maxilla|zygomatic bone|nasal bone|lacrimal|palatine|vomer|inferior nasal concha|mandible|hyoid'
CARPALS = r'scaphoid|lunate|triquetral|pisiform|trapezium|trapezoid|capitate|hamate'
TARSALS = r'talus|calcaneus|navicular|cuboid|cuneiform|sesamoid'
BRAIN = r'gyrus|gyri|lobe$|occipital lobe|insula|lobule|precuneus|cerebellum|pons|medulla oblongata|midbrain|corpus callosum|peduncle of midbrain'

RULES = [
    # Skin
    (r'^skin$', dict(system='skin', card='skin', label='Skin', tissue='skin', budget=110_000)),
    (r'^ear$', dict(system='skin', card='ear', label='Outer ear (auricle)', tissue='skin', budget=6000)),
    # Skeleton
    (r'tooth', dict(system='skeletal', card='skull', label='Teeth (32 in an adult)', tissue='enamel', budget=300)),
    (SKULL, dict(system='skeletal', card='skull', label='{name}', tissue='bone', budget=7000)),
    (r'^(atlas|axis)$', dict(system='skeletal', card='vertebral-column', label='{name} (vertebra)', tissue='bone', budget=2500)),
    (r'vertebra$', dict(system='skeletal', card='vertebral-column', label='{name}', tissue='bone', budget=2500)),
    (r'intervertebral disk', dict(system='skeletal', card='intervertebral-disc', label='Intervertebral discs', tissue='cartilage', budget=500)),
    (r'^sacrum$', dict(system='skeletal', card='pelvis', label='Sacrum (five fused vertebrae)', tissue='bone', budget=5000)),
    (r'hip bone', dict(system='skeletal', card='pelvis', label='Hip bone', tissue='bone', budget=9000)),
    (r'costal cartilage', dict(system='skeletal', card='rib-cage', label='Rib cartilage (costal cartilage)', tissue='cartilage', budget=900)),
    (r' rib$', dict(system='skeletal', card='rib-cage', label='{name}', tissue='bone', budget=1800)),
    (r'manubrium|body of sternum|xiphoid', dict(system='skeletal', card='rib-cage', label='Breastbone (sternum): {name}', tissue='bone', budget=1500)),
    (r'clavicle', dict(system='skeletal', card='shoulder-girdle', label='Collarbone (clavicle)', tissue='bone', budget=2500)),
    (r'scapula', dict(system='skeletal', card='shoulder-girdle', label='Shoulder blade (scapula)', tissue='bone', budget=5000)),
    (r'^femur$', dict(system='skeletal', card='femur', label='Femur (thigh bone)', tissue='bone', budget=7000, side=True)),
    (r'^patella$', dict(system='skeletal', card='skeletal-system', label='Kneecap (patella)', tissue='bone', budget=1500)),
    (r'^(humerus|radius|ulna|tibia|fibula)$', dict(system='skeletal', card='skeletal-system', label='{name}', tissue='bone', budget=5000)),
    (CARPALS, dict(system='skeletal', card='hand-bones', label='Wrist bones (8 carpals)', tissue='bone', budget=500)),
    (r'metacarpal', dict(system='skeletal', card='hand-bones', label='Palm bones (5 metacarpals)', tissue='bone', budget=700)),
    (r'phalanx of .*(finger|thumb)', dict(system='skeletal', card='hand-bones', label='Finger bones (14 phalanges)', tissue='bone', budget=350)),
    (TARSALS, dict(system='skeletal', card='foot-bones', label='Ankle and heel bones (7 tarsals)', tissue='bone', budget=1200)),
    (r'metatarsal', dict(system='skeletal', card='foot-bones', label='Foot bones (5 metatarsals)', tissue='bone', budget=700)),
    (r'phalanx of .*toe', dict(system='skeletal', card='foot-bones', label='Toe bones (14 phalanges)', tissue='bone', budget=300)),
    # Heart and vessels
    (r'wall of heart', dict(system='circulatory', card='heart', label='Heart', tissue='myocardium', budget=28_000)),
    (r'valve', dict(system='circulatory', card='heart-valves', label='{name}', tissue='cartilage', budget=1500)),
    (r'papillary', dict(system='circulatory', card='heart', label='Papillary muscles', tissue='myocardium', budget=600)),
    (r'coronary artery|coronary', dict(system='circulatory', card='coronary-arteries', label='Coronary arteries (the heart’s own blood supply)', tissue='vessel', budget=1500)),
    (r'cardiac vein|coronary sinus|veins of left ventricle', dict(system='circulatory', card='coronary-arteries', label='Cardiac veins', tissue='vein', budget=1200)),
    (r'aorta', dict(system='circulatory', card='aorta', label='Aorta: {name}', tissue='vessel', budget=3000)),
    (r'common carotid', dict(system='circulatory', card='carotid-artery', label='Carotid artery', tissue='vessel', budget=1500)),
    (r'vena cava|pulmonary artery|pulmonary vein', dict(system='circulatory', card='great-vessels', label='{name}', tissue='{vessel}', budget=3000)),
    (r'renal artery|renal vein', dict(system='urinary', card='kidney', label='{name}', tissue='{vessel}', budget=800)),
    (r'artery|arteries|vein', dict(system='circulatory', card='circulatory-system', label='{name}', tissue='{vessel}', budget=1500)),
    # Breathing
    (r'diaphragm', dict(system='respiratory', card='diaphragm', label='Diaphragm (the main breathing muscle)', tissue='muscle', budget=8000)),
    (r'trachea', dict(system='respiratory', card='trachea', label='Windpipe (trachea)', tissue='cartilage', budget=4000)),
    (r'bronchus', dict(system='respiratory', card='bronchi', label='Main bronchi', tissue='cartilage', budget=3000)),
    (r'thyroid cartilage', dict(system='respiratory', card='larynx', label='Voice box (thyroid cartilage, the Adam’s apple)', tissue='cartilage', budget=2000)),
    (r'lobe of lung', dict(system='respiratory', card='lungs', label='{full}', tissue='lung', budget=9000)),
    # Brain and senses
    (r'^cerebellum$', dict(system='nervous', card='cerebellum', label='Cerebellum', tissue='brain', budget=12_000)),
    (r'pons|medulla oblongata|midbrain|peduncle of midbrain', dict(system='nervous', card='brainstem', label='Brainstem: {name}', tissue='brain', budget=2500)),
    (r'corpus callosum', dict(system='nervous', card='corpus-callosum', label='Corpus callosum', tissue='brain', budget=2500)),
    (BRAIN, dict(system='nervous', card='brain', label='{name}', tissue='brain', budget=3500)),
    (r'eyeball', dict(system='nervous', card='eye', label='Eye', tissue='sclera', budget=3000)),
    (r'optic nerve|optic chiasm', dict(system='nervous', card='optic-nerve', label='Optic nerve', tissue='nerve', budget=600)),
    (r'pituitary|pineal', dict(system='endocrine', card='endocrine-system', label='{name}', tissue='organ', budget=600)),
    # Gut
    (r'esophagus', dict(system='digestive', card='digestive-system', label='Esophagus (food pipe)', tissue='organ', budget=3000)),
    (r'^stomach$', dict(system='digestive', card='stomach', label='Stomach', tissue='organ', budget=8000)),
    (r'^liver$', dict(system='digestive', card='liver', label='Liver', tissue='organ', budget=14_000)),
    (r'gallbladder', dict(system='digestive', card='gallbladder', label='Gallbladder (stores bile)', tissue='organ', budget=1500)),
    (r'^pancreas', dict(system='digestive', card='pancreas', label='Pancreas', tissue='organ', budget=4000)),
    (r'duodenum', dict(system='digestive', card='duodenum', label='Duodenum (first part of the small intestine)', tissue='organ', budget=3000)),
    (r'jejunum|ileum', dict(system='digestive', card='small-intestine', label='Small intestine: {name}', tissue='organ', budget=16_000)),
    (r'colon|rectum', dict(system='digestive', card='large-intestine', label='Large intestine: {name}', tissue='organ', budget=9000)),
    (r'appendix', dict(system='digestive', card='large-intestine', label='Appendix', tissue='organ', budget=600)),
    # Immune
    (r'spleen', dict(system='immune', card='spleen', label='Spleen', tissue='organ', budget=3000)),
    (r'thymus', dict(system='immune', card='immune-system', label='Thymus', tissue='organ', budget=1500)),
    # Urinary and endocrine
    (r'kidney', dict(system='urinary', card='kidney', label='{side} kidney', tissue='organ', budget=5000, side=True)),
    (r'ureter', dict(system='urinary', card='urinary-system', label='Ureter (carries urine to the bladder)', tissue='organ', budget=1200)),
    (r'urinary bladder', dict(system='urinary', card='urinary-system', label='Bladder', tissue='organ', budget=3000)),
    (r'adrenal', dict(system='endocrine', card='adrenal-gland', label='Adrenal gland (on top of the kidney)', tissue='organ', budget=1200)),
    # Connective tissue and tendons
    (r'calcaneal tendon', dict(system='muscular', card='tendon', label='Achilles tendon (the strongest tendon)', tissue='tendon', budget=900)),
    (r'ligament|retinaculum|interosseous membrane|iliotibial|linea alba|aponeurosis|intermediate tendon', dict(system='muscular', card='muscular-system', label='{name}', tissue='tendon', budget=1200)),
    # Muscles with their own cards, then every other muscle
    (r'biceps brachii', dict(system='muscular', card='biceps', label='Biceps ({name})', tissue='muscle', budget=3500)),
    (r'rectus femoris|vastus', dict(system='muscular', card='quadriceps', label='Quadriceps: {name}', tissue='muscle', budget=4500)),
    (r'biceps femoris|semitendinosus|semimembranosus', dict(system='muscular', card='hamstrings', label='Hamstrings: {name}', tissue='muscle', budget=3500)),
    (r'.', dict(system='muscular', card='muscular-system', label='{name}', tissue='muscle', budget=2500)),
]

# Systems whose meshes are tinted from one shared surface per tissue; per-part colors in life.
NATURAL = {
    'liver': 0x7a2c28, 'stomach': 0xd99088, 'gallbladder': 0x6f9a3f, 'pancreas': 0xdcb377, 'spleen': 0x6e3550,
    'kidney': 0x8e3f3a, 'urinary bladder': 0xdcae96, 'ureter': 0xe9c79a, 'adrenal': 0xd9a64e, 'thymus': 0xd8a7a0,
    'esophagus': 0xc98580, 'duodenum': 0xd99088, 'jejunum': 0xd98f88, 'ileum': 0xd99088, 'colon': 0xc79574,
    'rectum': 0xc79574, 'appendix': 0xc79574, 'pituitary': 0xd88aa0, 'pineal': 0xd8a0a0,
}
DIVISOR = {'muscular': 60, 'skeletal': 10, 'nervous': 12}
SIDE_RE = re.compile(r'\b(left|right)\b ?')


def clean(name):
    """'left long head of biceps brachii' → 'long head of biceps brachii'; also drops ', nsn'."""
    n = name.replace(', nsn', '').replace('set of ', '')
    n = SIDE_RE.sub('', n).strip()
    n = re.sub(r' of (hand|foot)$', r' of the \1', n)
    return n[:1].upper() + n[1:]


def side_of(name):
    m = SIDE_RE.search(name)
    return m.group(1) if m else ''


def classify(name):
    if SKIP.search(name):
        return None
    bare = SIDE_RE.sub('', name).strip()  # 'left femur' matches '^femur$'
    for pattern, rule in RULES:
        if re.search(pattern, bare):
            r = dict(rule)
            vessel = 'vein' if re.search(r'vein|vena|sinus', name) else 'vessel'
            r['tissue'] = r['tissue'].replace('{vessel}', vessel)
            side = side_of(name)
            full = name.replace('lobe of lung', 'lobe of right lung')  # the middle lobe is on the right
            r['label'] = r['label'].replace('{full}', full[:1].upper() + full[1:]).replace('{name}', clean(name)).replace('{side}', side.capitalize()).strip()
            r['side'] = side if r.get('side') else ''
            key = next((k for k in NATURAL if k in name), None)
            if key:
                r['natural'] = NATURAL[key]
            return r
    return None


# ── Geometry ───────────────────────────────────────────────────────────
def load_stl(path):
    data = path.read_bytes()
    n = struct.unpack_from('<I', data, 80)[0]
    rec = np.frombuffer(data, dtype=np.dtype([('n', '<f4', 3), ('v', '<f4', (3, 3)), ('a', '<u2')]), count=n, offset=84)
    return rec['v'].reshape(-1, 3).astype(np.float64)


def weld(soup):
    """Triangle soup → (vertices, faces), merging corners closer than 1 µm."""
    key = np.round(soup * 1000).astype(np.int64)
    uniq, inverse = np.unique(key, axis=0, return_inverse=True)
    faces = inverse.reshape(-1, 3)
    good = (faces[:, 0] != faces[:, 1]) & (faces[:, 1] != faces[:, 2]) & (faces[:, 0] != faces[:, 2])
    return uniq.astype(np.float64) / 1000, faces[good]


def taubin(v, f, iterations=6, lam=0.5, mu=-0.53):
    """Taubin smoothing: alternating shrink and inflate steps that smooth without shrinking."""
    edges = np.concatenate([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]])
    edges = np.concatenate([edges, edges[:, ::-1]])
    deg = np.bincount(edges[:, 0], minlength=len(v)).astype(np.float64)
    deg[deg == 0] = 1
    for _ in range(iterations):
        for k in (lam, mu):
            acc = np.zeros_like(v)
            np.add.at(acc, edges[:, 0], v[edges[:, 1]])
            v = v + k * (acc / deg[:, None] - v)
    return v


def simplify(v, f, target):
    import fast_simplification
    if len(f) <= target:
        return v, f
    v2, f2 = fast_simplification.simplify(v.astype(np.float32), f.astype(np.int32), target_reduction=1 - target / len(f))
    return v2.astype(np.float64), f2.astype(np.int64)


def vertex_normals(v, f):
    fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])  # area-weighted
    n = np.zeros_like(v)
    for i in range(3):
        np.add.at(n, f[:, i], fn)
    length = np.linalg.norm(n, axis=1)
    # Where faces cancel out (a sheet folded back on itself, a sliver), fall back to
    # the normal of one face the vertex belongs to.
    weak = length < 1e-3 * np.maximum(np.bincount(f.ravel(), weights=np.repeat(np.linalg.norm(fn, axis=1), 3), minlength=len(v)), 1e-30)
    if weak.any():
        own = np.zeros_like(v)
        own[f[:, 0]] = fn
        own[f[:, 1]] = fn
        own[f[:, 2]] = fn
        n[weak] = own[weak]
        length = np.linalg.norm(n, axis=1)
    length[length == 0] = 1
    n = n / length[:, None]
    n[np.linalg.norm(n, axis=1) < 0.5] = [0, 1, 0]  # a vertex only in zero-area slivers
    return n


def process(path, budget):
    v, f = weld(load_stl(path))
    if len(f) == 0:
        return None
    v = taubin(v, f)
    v, f = simplify(v, f, budget)
    used = np.unique(f)  # drop vertices no triangle uses
    remap = np.full(len(v), -1, dtype=np.int64)
    remap[used] = np.arange(len(used))
    v, f = v[used], remap[f]
    v = to_app(v)
    return v, f


# ── glTF writer (KHR_mesh_quantization) ─────────────────────────────────
class Glb:
    def __init__(self):
        self.bin = bytearray()
        self.views, self.accessors, self.meshes, self.nodes = [], [], [], []

    def _view(self, data, target, stride=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        view = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(data), 'target': target}
        if stride:
            view['byteStride'] = stride
        self.bin += data
        self.views.append(view)
        return len(self.views) - 1

    def _accessor(self, view, ctype, count, typ, normalized=False, mn=None, mx=None):
        a = {'bufferView': view, 'componentType': ctype, 'count': count, 'type': typ}
        if normalized:
            a['normalized'] = True
        if mn is not None:
            a['min'], a['max'] = mn, mx
        self.accessors.append(a)
        return len(self.accessors) - 1

    def add(self, name, v, f, extras):
        lo, hi = v.min(0), v.max(0)
        center = (lo + hi) / 2
        half = np.maximum((hi - lo) / 2, 1e-6)
        q = np.round((v - center) / half * 32767).clip(-32767, 32767).astype('<i2')
        pos = np.zeros((len(v), 4), '<i2')
        pos[:, :3] = q
        # Normals are stored in the node's local (quantized) space, so that the
        # node's scale maps them back to true directions: n_local ∝ scale × n_world.
        local = vertex_normals(v, f) * half
        local /= np.maximum(np.linalg.norm(local, axis=1, keepdims=True), 1e-12)
        n = np.round(local * 127).clip(-127, 127).astype('i1')
        nrm = np.zeros((len(v), 4), 'i1')
        nrm[:, :3] = n
        idx = f.astype('<u2' if len(v) < 65536 else '<u4').ravel()
        pa = self._accessor(self._view(pos.tobytes(), 34962, 8), 5122, len(v), 'VEC3', True,
                            [int(x) for x in q.min(0)], [int(x) for x in q.max(0)])
        na = self._accessor(self._view(nrm.tobytes(), 34962, 4), 5120, len(v), 'VEC3', True)
        ia = self._accessor(self._view(idx.tobytes(), 34963), 5123 if idx.dtype == np.dtype('<u2') else 5125, idx.size, 'SCALAR')
        self.meshes.append({'primitives': [{'attributes': {'POSITION': pa, 'NORMAL': na}, 'indices': ia}]})
        self.nodes.append({'name': name, 'mesh': len(self.meshes) - 1, 'translation': [float(x) for x in center],
                           'scale': [float(x) for x in half], 'extras': extras})

    def write(self, path, asset_extras):
        doc = {
            'asset': {'version': '2.0', 'generator': 'tools/build_body_meshes.py', 'extras': asset_extras,
                      'copyright': 'BodyParts3D, © The Database Center for Life Science, licensed CC BY-SA 2.1 Japan'},
            'extensionsUsed': ['KHR_mesh_quantization'], 'extensionsRequired': ['KHR_mesh_quantization'],
            'scene': 0, 'scenes': [{'nodes': list(range(len(self.nodes)))}],
            'nodes': self.nodes, 'meshes': self.meshes, 'accessors': self.accessors, 'bufferViews': self.views,
            'buffers': [{'byteLength': len(self.bin)}],
        }
        js = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode('utf8')
        js += b' ' * (-len(js) % 4)
        binary = bytes(self.bin) + b'\0' * (-len(self.bin) % 4)
        total = 12 + 8 + len(js) + 8 + len(binary)
        out = struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(js), 0x4E4F534A) + js
        out += struct.pack('<II', len(binary), 0x004E4942) + binary
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(out)
        return total


# ── Blood-flow paths: the center line of each large vessel ──────────────
# Each entry: part name, artery or vein, and which end the blood enters by:
# 'heart' (the end nearer the heart), 'top', 'bottom', 'inner' (nearer the
# midline) or 'outer'.
FLOW = [
    ('ascending aorta', 'artery', 'heart'),
    ('arch of aorta', 'artery', 'heart'),
    ('descending aorta', 'artery', 'top'),
    ('brachiocephalic artery, nsn', 'artery', 'bottom'),
    ('left common carotid artery', 'artery', 'bottom'),
    ('right common carotid artery', 'artery', 'bottom'),
    ('left subclavian artery', 'artery', 'inner'),
    ('right subclavian artery', 'artery', 'inner'),
    ('left renal artery', 'artery', 'inner'),
    ('right renal artery', 'artery', 'inner'),
    ('superior mesenteric artery', 'artery', 'top'),
    ('left common iliac artery', 'artery', 'top'),
    ('right common iliac artery', 'artery', 'top'),
    ('left external iliac artery', 'artery', 'top'),
    ('right external iliac artery', 'artery', 'top'),
    ('left internal iliac artery', 'artery', 'top'),
    ('right internal iliac artery', 'artery', 'top'),
    ('superior vena cava', 'vein', 'top'),
    ('inferior vena cava', 'vein', 'bottom'),
    ('left brachiocephalic vein', 'vein', 'outer'),
    ('right brachiocephalic vein', 'vein', 'top'),
    ('left internal jugular vein', 'vein', 'top'),
    ('right internal jugular vein', 'vein', 'top'),
    ('left subclavian vein', 'vein', 'outer'),
    ('right subclavian vein', 'vein', 'outer'),
    ('left renal vein', 'vein', 'outer'),
    ('right renal vein', 'vein', 'outer'),
    ('left common iliac vein', 'vein', 'bottom'),
    ('right common iliac vein', 'vein', 'bottom'),
    ('left external iliac vein', 'vein', 'bottom'),
    ('right external iliac vein', 'vein', 'bottom'),
    ('left internal iliac vein', 'vein', 'bottom'),
    ('right internal iliac vein', 'vein', 'bottom'),
]


def geodesic(v, f, src):
    """Distance from vertex src to every vertex, along the mesh's edges (inf where unreachable)."""
    adj = [[] for _ in range(len(v))]
    for a, b in ((0, 1), (1, 2), (2, 0)):
        for i, j in zip(f[:, a].tolist(), f[:, b].tolist()):
            w = float(np.linalg.norm(v[i] - v[j]))
            adj[i].append((j, w))
            adj[j].append((i, w))
    d = np.full(len(v), np.inf)
    d[src] = 0.0
    heap = [(0.0, src)]
    while heap:
        dd, i = heapq.heappop(heap)
        if dd > d[i]:
            continue
        for j, w in adj[i]:
            if dd + w < d[j]:
                d[j] = dd + w
                heapq.heappush(heap, (d[j], j))
    return d


def centerline(v, f, step=0.01):
    """
    The center line of a tube-shaped mesh and its radius along the way.
    The surface is sliced by distance from one end (the vertex farthest from
    any other along the surface); each slice's centroid is then re-centered,
    three times, in the cross-section its tangent cuts.
    """
    d0 = geodesic(v, f, 0)
    a = int(np.argmax(np.where(np.isfinite(d0), d0, -1)))
    da = geodesic(v, f, a)
    ok = np.isfinite(da)
    length = float(da[ok].max())
    n = max(3, int(round(length / step)))
    pts = []
    for k in range(n):
        m = ok & (da >= length * k / n) & (da <= length * (k + 1) / n)
        if m.sum() >= 3:
            pts.append(v[m].mean(0))
    pts = np.array(pts)
    rad = []
    for _ in range(3):
        new, rad = [], []
        for k, p in enumerate(pts):
            t = pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)]
            t = t / (np.linalg.norm(t) or 1)
            rel = v - p
            along = rel @ t
            off = rel - np.outer(along, t)
            m = (np.abs(along) < step * 0.6) & (np.linalg.norm(off, axis=1) < 0.03)
            if m.sum() < 6:
                new.append(p)
                rad.append(rad[-1] if rad else 0.004)
                continue
            c = p + off[m].mean(0)
            new.append(c)
            r = (v[m] - c) - np.outer((v[m] - c) @ t, t)
            rad.append(float(np.median(np.linalg.norm(r, axis=1))))
        pts = np.array(new)
    return pts, np.array(rad)


def flow_paths(parts, heart):
    """Blood-flow paths for the app (see FLOW), each running the way the blood does."""
    out = []
    for name, kind, enter in FLOW:
        if name not in parts:
            continue
        pts, rad = centerline(*parts[name])
        a, b = pts[0], pts[-1]
        first = {
            'heart': np.linalg.norm(a - heart) <= np.linalg.norm(b - heart),
            'top': a[1] >= b[1],
            'bottom': a[1] <= b[1],
            'inner': abs(a[0]) <= abs(b[0]),
            'outer': abs(a[0]) >= abs(b[0]),
        }[enter]
        if not first:
            pts, rad = pts[::-1], rad[::-1]
        out.append({'name': name, 'kind': kind, 'points': pts.round(4).tolist(), 'radius': rad.round(4).tolist()})
    return out


# ── Landmarks the rest of the app aims at ──────────────────────────────
def landmarks(parts):
    """Centers and axes measured from the meshes (app meters)."""
    def box(name):
        v = parts[name][0]
        return v.min(0), v.max(0)

    def center(name):
        lo, hi = box(name)
        return ((lo + hi) / 2).round(4).tolist()

    def axis(name):
        """End points of a long bone: the extreme points along its main axis."""
        v = parts[name][0]
        c = v.mean(0)
        _, _, vt = np.linalg.svd(v - c, full_matrices=False)
        t = (v - c) @ vt[0]
        a, b = v[t.argmax()], v[t.argmin()]
        if a[1] < b[1]:
            a, b = b, a  # top first
        # Pull the ends onto the axis so routes run down the middle of the bone.
        a = c + vt[0] * ((a - c) @ vt[0])
        b = c + vt[0] * ((b - c) @ vt[0])
        return [a.round(4).tolist(), b.round(4).tolist()]

    def union(names):
        v = np.concatenate([parts[n][0] for n in names])
        return v.min(0), v.max(0)

    def end(name, pick):
        """The end of a vessel: its lowest point ('low') or its point farthest from the midline ('out')."""
        v = parts[name][0]
        i = v[:, 1].argmin() if pick == 'low' else np.abs(v[:, 0]).argmax()
        return v[i].round(4).tolist()

    eye_lo, eye_hi = box('eyeball')
    eye_y, eye_z = (eye_lo[1] + eye_hi[1]) / 2, (eye_lo[2] + eye_hi[2]) / 2
    eye_x = (eye_hi[0] - eye_lo[0]) / 2 - 0.012  # each eye is about 24 mm across
    ear_lo, ear_hi = box('ear')
    trachea = parts['trachea'][0]
    larynx_lo, larynx_hi = box('thyroid cartilage')
    top = trachea[trachea[:, 1] > larynx_lo[1] - 0.045]
    out = {
        'source': 'Measured from BodyParts3D meshes by tools/build_body_meshes.py',
        'height': round(float(parts['skin'][0][:, 1].max()), 4),
        'eyes': {'x': [-round(eye_x, 4), round(eye_x, 4)], 'y': round(float(eye_y), 4), 'z': round(float(eye_z), 4)},
        # The cochlea sits deep in the temporal bone, about 3 cm in from the ear canal.
        'innerEars': {'x': [-round(float(ear_hi[0]) - 0.05, 4), round(float(ear_hi[0]) - 0.05, 4)],
                      'y': round(float(eye_y) - 0.012, 4), 'z': round(float((ear_lo[2] + ear_hi[2]) / 2) + 0.004, 4)},
        # The olfactory patch: the roof of the nasal cavity, between and just behind the eyes.
        'nose': {'y': round(float(eye_y) + 0.004, 4), 'z': round(float(eye_z) - 0.006, 4)},
        # The thyroid wraps the windpipe just below the voice box.
        'thyroid': {'center': [0.0, round(float(larynx_lo[1]) - 0.022, 4), round(float(top[:, 2].max()) + 0.006, 4)],
                    'lobeX': 0.02},
        'kidneys': {'left': center('left kidney'), 'right': center('right kidney')},
        'heart': center('wall of heart'),
        'liver': center('liver'),
        'pancreas': center('pancreas, nsn'),
        'brain': ((lambda b: (b[0] + b[1]) / 2)(union([n for n in parts if re.search(BRAIN, n) and n != 'cerebellum']))).round(4).tolist(),
        'biceps': center('long head of left biceps brachii'),
        'lungs': ((lambda b: (b[0] + b[1]) / 2)(union([n for n in parts if 'lung' in n]))).round(4).tolist(),
        'vessels': {
            'externalIliacArtery': {'left': end('left external iliac artery', 'low'), 'right': end('right external iliac artery', 'low')},
            'externalIliacVein': {'left': end('left external iliac vein', 'low'), 'right': end('right external iliac vein', 'low')},
            'subclavianArtery': {'left': end('left subclavian artery', 'out'), 'right': end('right subclavian artery', 'out')},
            'subclavianVein': {'left': end('left subclavian vein', 'out'), 'right': end('right subclavian vein', 'out')},
        },
        'smallIntestine': center('jejunum'),
        'bones': {k: axis(k) for k in ['left humerus', 'right humerus', 'left radius', 'right radius', 'left femur', 'right femur',
                                         'left tibia', 'right tibia']},
        'femurHead': {'left': box('left femur')[1].round(4).tolist()},
        'spine': [center(n) for n in ['atlas', 'third thoracic vertebra', 'eighth thoracic vertebra', 'first lumbar vertebra',
                                      'fifth lumbar vertebra', 'sacrum']],
    }
    out['flow'] = flow_paths(parts, np.array(out['heart']))
    return out


def fetch():
    SRC.mkdir(parents=True, exist_ok=True)
    for f in ['parts_list_e.txt', 'LICENSE_content']:
        (SRC / f).write_bytes(urllib.request.urlopen(MIRROR + f, timeout=120).read())
    names = list_names()

    def get(fma):
        p = SRC / 'stl' / f'{fma}.stl'
        if p.exists() and p.stat().st_size:
            return
        p.parent.mkdir(exist_ok=True)
        p.write_bytes(urllib.request.urlopen(f'{MIRROR}stl/{fma}.stl', timeout=300).read())

    with cf.ThreadPoolExecutor(16) as ex:
        list(ex.map(get, names))
    print(f'fetched {len(names)} parts into {SRC}')


def list_names():
    """FMA id → English name, for every part in the parts list."""
    names = {}
    for row in csv.reader(open(SRC / 'parts_list_e.txt', encoding='utf8'), delimiter='\t'):
        if len(row) >= 2 and row[0] != '"id"':
            names[row[0]] = row[1]
    return names


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--fetch', action='store_true', help='download the STL files first')
    ap.add_argument('--scale', type=float, default=1.0, help='multiply every triangle budget')
    args = ap.parse_args()
    if args.fetch:
        fetch()
    names = list_names()
    stls = sorted((SRC / 'stl').glob('*.stl'))
    if not stls:
        sys.exit('No STL files. Run: python3 tools/build_body_meshes.py --fetch')
    jobs = []
    for p in stls:
        name = names.get(p.stem)
        rule = classify(name) if name else None
        if rule:
            # Small parts get fewer triangles than the rule's cap: the budget follows
            # the part's original detail, divided per system (muscles are many and
            # mostly hidden under the skin; organs keep their full cap).
            original = struct.unpack_from('<I', p.open('rb').read(84), 80)[0]
            rule['budget'] = min(rule['budget'], max(200, original // DIVISOR.get(rule['system'], 2)))
            jobs.append((p, name, rule))
    print(f'{len(jobs)} of {len(stls)} parts used')

    with cf.ProcessPoolExecutor(max(1, (os.cpu_count() or 2))) as ex:
        results = list(ex.map(process, [j[0] for j in jobs], [int(j[2]['budget'] * args.scale) for j in jobs]))

    parts = {}
    groups = {}
    for (p, name, rule), res in zip(jobs, results):
        if res is None:
            continue
        parts[name] = res
        key = (rule['system'], rule['card'], rule['label'], rule['side'])
        groups.setdefault(key, {'rule': rule, 'pieces': [], 'fma': []})
        groups[key]['pieces'].append(res)
        groups[key]['fma'].append(p.stem)

    glb = Glb()
    tris = 0
    for (system, card, label, side), g in sorted(groups.items()):
        vs, fs, off = [], [], 0
        for v, f in g['pieces']:
            vs.append(v)
            fs.append(f + off)
            off += len(v)
        v, f = np.concatenate(vs), np.concatenate(fs)
        rule = g['rule']
        extras = {'system': system, 'card': card, 'label': label, 'tissue': rule['tissue'], 'fma': sorted(g['fma'])}
        if side:
            extras['side'] = side
        if 'natural' in rule:
            extras['natural'] = rule['natural']
        glb.add(f'{card}:{label}{":" + side if side else ""}', v, f, extras)
        tris += len(f)
    marks = landmarks(parts)
    size = glb.write(OUT, {'license': 'CC BY-SA 2.1 JP', 'parts': len(parts)})
    LANDMARKS.write_text(json.dumps(marks, indent=2) + '\n')
    print(f'wrote {OUT.relative_to(ROOT)}: {len(glb.nodes)} meshes, {tris:,} triangles, {size / 1e6:.1f} MB')
    print(f'wrote {LANDMARKS.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
