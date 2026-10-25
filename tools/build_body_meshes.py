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

SKULL = r'frontal bone|parietal bone|occipital bone|temporal bone|sphenoid|ethmoid|maxilla|zygomatic bone|nasal bone|lacrimal|palatine|vomer|inferior nasal concha|mandible|hyoid bone'
CARPALS = r'scaphoid|lunate|triquetral|triquetrum|pisiform|trapezium|trapezoid|capitate|hamate'
TARSALS = r'talus|calcaneus|navicular|cuboid|cuneiform|sesamoid'
BRAIN = r'gyrus|gyri|lobe$|occipital lobe|insula|lobule|precuneus|cerebellum|pons|medulla oblongata|midbrain|corpus callosum|peduncle of midbrain'

RULES = [
    # Skin
    (r'^skin$', dict(system='skin', card='skin', label='Skin', tissue='skin', budget=110_000)),
    (r'^ear$', dict(system='skin', card='ear', label='Outer ear (auricle)', tissue='skin', budget=6000)),
    # Skeleton
    (r'tooth', dict(system='skeletal', card='skull', label='Teeth (32 in an adult)', tissue='enamel', budget=300)),
    (r'nasal cartilage', dict(system='skeletal', card='skull', label='Nose cartilages (the nose past its bones)', tissue='cartilage', budget=2500)),
    (r'^mandible$', dict(system='skeletal', card='mandible', label='Lower jaw (mandible)', tissue='bone', budget=7000)),
    (SKULL, dict(system='skeletal', card='skull', label='{name}', tissue='bone', budget=7000)),
    (r'intervertebral disk', dict(system='skeletal', card='intervertebral-disc', label='Intervertebral discs', tissue='cartilage', budget=500)),
    (r'^(atlas|axis)$', dict(system='skeletal', card='vertebral-column', label='{name} (vertebra)', tissue='bone', budget=2500)),
    (r'vertebra$', dict(system='skeletal', card='vertebral-column', label='{name}', tissue='bone', budget=2500)),
    (r'^sacrum$', dict(system='skeletal', card='pelvis', label='Sacrum (five fused vertebrae)', tissue='bone', budget=5000)),
    (r'^coccyx$', dict(system='skeletal', card='pelvis', label='Tailbone (coccyx)', tissue='bone', budget=1500)),
    (r'hip bone', dict(system='skeletal', card='pelvis', label='Hip bone', tissue='bone', budget=9000)),
    (r'costal cartilage', dict(system='skeletal', card='rib-cage', label='Rib cartilage (costal cartilage)', tissue='cartilage', budget=900)),
    (r' rib$', dict(system='skeletal', card='rib-cage', label='{name}', tissue='bone', budget=1800)),
    (r'manubrium|body of sternum|xiphoid', dict(system='skeletal', card='sternum', label='Breastbone (sternum): {name}', tissue='bone', budget=1500)),
    (r'clavicle', dict(system='skeletal', card='shoulder-girdle', label='Collarbone (clavicle)', tissue='bone', budget=2500)),
    (r'scapula', dict(system='skeletal', card='shoulder-girdle', label='Shoulder blade (scapula)', tissue='bone', budget=5000)),
    (r'^femur$', dict(system='skeletal', card='femur', label='Femur (thigh bone)', tissue='bone', budget=7000, side=True)),
    (r'^patella$', dict(system='skeletal', card='patella', label='Kneecap (patella)', tissue='bone', budget=1500)),
    # The long bones of the limbs each open their own card, as a classroom skeleton labels them.
    (r'^humerus$', dict(system='skeletal', card='humerus', label='Humerus (upper arm bone)', tissue='bone', budget=5000)),
    (r'^radius$', dict(system='skeletal', card='radius', label='Radius', tissue='bone', budget=5000)),
    (r'^ulna$', dict(system='skeletal', card='ulna', label='Ulna', tissue='bone', budget=5000)),
    (r'^tibia$', dict(system='skeletal', card='tibia', label='Tibia (shin bone)', tissue='bone', budget=5000)),
    (r'^fibula$', dict(system='skeletal', card='fibula', label='Fibula', tissue='bone', budget=5000)),
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
    # The big superficial muscles each open their own card, as a muscle chart labels them.
    (r'deltoid$', dict(system='muscular', card='deltoid', label='{name}', tissue='muscle', budget=2500)),
    (r'pectoralis major$', dict(system='muscular', card='pectoralis-major', label='{name}', tissue='muscle', budget=2500)),
    (r'trapezius$', dict(system='muscular', card='trapezius', label='{name}', tissue='muscle', budget=2500)),
    (r'^latissimus dorsi$', dict(system='muscular', card='latissimus-dorsi', label='{name}', tissue='muscle', budget=2500)),
    (r'^rectus abdominis$', dict(system='muscular', card='rectus-abdominis', label='{name}', tissue='muscle', budget=2500)),
    (r'^external oblique$', dict(system='muscular', card='external-oblique', label='{name}', tissue='muscle', budget=2500)),
    (r'^gluteus maximus$', dict(system='muscular', card='gluteus-maximus', label='{name}', tissue='muscle', budget=2500)),
    (r'^sartorius$', dict(system='muscular', card='sartorius', label='{name}', tissue='muscle', budget=2500)),
    (r'gastrocnemius$|^soleus$', dict(system='muscular', card='calf-muscles', label='{name}', tissue='muscle', budget=2500)),
    (r'^tibialis anterior$', dict(system='muscular', card='tibialis-anterior', label='{name}', tissue='muscle', budget=2500)),
    (r'^sternocleidomastoid$', dict(system='muscular', card='sternocleidomastoid', label='{name}', tissue='muscle', budget=2500)),
    (r'triceps brachii$', dict(system='muscular', card='triceps', label='{name}', tissue='muscle', budget=2500)),
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
COPYRIGHT = 'BodyParts3D, © The Database Center for Life Science, licensed CC BY-SA 2.1 Japan'
COPYRIGHT_ZA = (COPYRIGHT + '; skeleton from Z-Anatomy (Lluís Vinent, Gauthier Kervyn), built on BodyParts3D, '
                'licensed CC BY-SA 4.0. The bundle as a whole: CC BY-SA 4.0')
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

    def add(self, name, v, f, extras, shade=None):
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
        attributes = {'POSITION': pa, 'NORMAL': na}
        if shade is not None:
            # Baked ambient occlusion as a gray vertex color (1 = open sky, 0 = fully shut in).
            rgba = np.full((len(v), 4), 255, 'u1')
            rgba[:, :3] = np.round(np.clip(shade, 0, 1) * 255).astype('u1')[:, None]
            attributes['COLOR_0'] = self._accessor(self._view(rgba.tobytes(), 34962, 4), 5121, len(v), 'VEC4', True)
        self.meshes.append({'primitives': [{'attributes': attributes, 'indices': ia}]})
        self.nodes.append({'name': name, 'mesh': len(self.meshes) - 1, 'translation': [float(x) for x in center],
                           'scale': [float(x) for x in half], 'extras': extras})

    def write(self, path, asset_extras, copyright=COPYRIGHT):
        doc = {
            'asset': {'version': '2.0', 'generator': 'tools/build_body_meshes.py', 'extras': asset_extras,
                      'copyright': copyright},
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


def nearest_pair(a, b):
    """The closest pair of points between point sets a and b: (point of a, point of b)."""
    best, pair = np.inf, None
    for i in range(0, len(a), 2000):
        d = ((a[i:i + 2000, None, :] - b[None, :, :]) ** 2).sum(-1)
        k = np.unravel_index(d.argmin(), d.shape)
        if d[k] < best:
            best, pair = d[k], (a[i + k[0]], b[k[1]])
    return pair


def digestive_marks(parts):
    """Where the liver, gallbladder, pancreas and duodenum meet (for the organ close-ups)."""
    pancreas = parts.get('pancreas, nsn') or parts['pancreas']
    duct, _ = centerline(*pancreas, step=0.008)
    if np.linalg.norm(duct[0] - parts['spleen'][0].mean(0)) > np.linalg.norm(duct[-1] - parts['spleen'][0].mean(0)):
        duct = duct[::-1]  # from the tail (at the spleen) to the head, the way the juice flows
    duo = parts['duodenum'][0]
    ampulla = duo[np.linalg.norm(duo - duct[-1], axis=1).argmin()]
    porta, _ = nearest_pair(parts['liver'][0], parts['common hepatic artery'][0])
    gb = parts['gallbladder'][0]
    neck = gb[np.linalg.norm(gb - porta, axis=1).argmin()]
    portal_start = np.mean(nearest_pair(parts['splenic vein'][0], parts['superior mesenteric vein'][0]), axis=0)
    r = lambda v: np.asarray(v).round(4).tolist()
    return {'pancreaticDuct': r(duct), 'ampulla': r(ampulla), 'porta': r(porta), 'gallbladderNeck': r(neck),
            'portalVeinStart': r(portal_start)}


def axis_crossings(tri, axes, a):
    """For a voxel grid (cell centers `axes`), how many triangles of `tri` (T×3×3)
    a ray from each cell crosses going down and up axis a."""
    b, c = [i for i in range(3) if i != a]
    shape = tuple(len(x) for x in axes)
    step = axes[0][1] - axes[0][0]
    below = np.zeros(shape, np.int16)
    above = np.zeros(shape, np.int16)
    P, Z = tri[:, :, [b, c]], tri[:, :, a]
    lo = np.ceil((P.min(1) - [axes[b][0], axes[c][0]]) / step).astype(int).clip(0)
    hi = np.floor((P.max(1) - [axes[b][0], axes[c][0]]) / step).astype(int).clip(None, [shape[b] - 1, shape[c] - 1])
    hits = {}
    for t in range(len(tri)):
        (x0, y0), (x1, y1), (x2, y2) = P[t]
        den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(den) < 1e-14:
            continue
        for i in range(lo[t, 0], hi[t, 0] + 1):
            for j in range(lo[t, 1], hi[t, 1] + 1):
                px, py = axes[b][i], axes[c][j]
                l0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / den
                l1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / den
                if l0 >= 0 and l1 >= 0 and l0 + l1 <= 1:
                    hits.setdefault((i, j), []).append(l0 * Z[t, 0] + l1 * Z[t, 1] + (1 - l0 - l1) * Z[t, 2])
    for (i, j), zs in hits.items():
        zs = np.sort(zs)
        n = np.searchsorted(zs, axes[a])
        idx = [slice(None)] * 3
        idx[b], idx[c] = i, j
        below[tuple(idx)] = n
        above[tuple(idx)] = len(zs) - n
    return below, above


N6 = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]


def flood(labels, mask):
    """Grow the nonzero labels through mask, breadth first (a simple watershed)."""
    from collections import deque
    lab = labels.copy()
    q = deque(map(tuple, np.argwhere(lab > 0)))
    while q:
        p = q.popleft()
        for d in N6:
            n = (p[0] + d[0], p[1] + d[1], p[2] + d[2])
            if all(0 <= n[k] < mask.shape[k] for k in range(3)) and mask[n] and not lab[n]:
                lab[n] = lab[p]
                q.append(n)
    return lab


def components(mask):
    """Connected pieces of a voxel mask, largest first, as boolean masks."""
    lab = np.zeros(mask.shape, int)
    out = []
    for start in map(tuple, np.argwhere(mask)):
        if lab[start]:
            continue
        seed = np.zeros(mask.shape, int)
        seed[start] = len(out) + 1
        grown = flood(seed, mask & (lab == 0))
        lab[grown > 0] = len(out) + 1
        out.append(grown > 0)
    return sorted(out, key=lambda m: -m.sum())


def heart_marks(parts, step=0.003, samples=300):
    """The four chambers of the measured heart, found as the hollows inside its wall.

    Voxels enclosed by the wall and valves in all six directions are the cavity.
    Eroding it splits the right side from the left (the septum); each side is
    then split at its atrioventricular valve, across the long axis from the
    valve to the apex.
    """
    wall_v, wall_f = parts['wall of heart']
    valves = {n: parts[n][0] for n in ['tricuspid valve', 'mitral valve', 'pulmonary valve']}
    tri = np.concatenate([wall_v[wall_f]] + [parts[n][0][parts[n][1]] for n in valves])
    lo, hi = wall_v.min(0) - step, wall_v.max(0) + step
    axes = [np.arange(lo[i] + step / 2, hi[i], step) for i in range(3)]
    cross = [axis_crossings(tri, axes, a) for a in range(3)]
    enclosed = np.all([(b > 0) & (u > 0) for b, u in cross], axis=0)
    even = np.sum([b % 2 == 0 for b, _ in cross], axis=0) >= 2
    cavity = components(enclosed & even)[0]

    def erode(m):
        o = m.copy()
        for a in range(3):
            for sgn in (1, -1):
                r = np.roll(m, sgn, a)
                idx = [slice(None)] * 3
                idx[a] = 0 if sgn == 1 else -1
                r[tuple(idx)] = False
                o &= r
        return o

    grid = np.stack(np.meshgrid(*axes, indexing='ij'), -1)
    sides = components(erode(erode(cavity)))[:2]
    seed = np.zeros(cavity.shape, int)
    for k, m in enumerate(sides):
        seed[m] = k + 1
    side = flood(seed, cavity)
    apex = wall_v[np.argmax(wall_v @ np.array([0.55, -0.6, 0.55]))]  # the tip: left, low and forward
    tricuspid, mitral = valves['tricuspid valve'].mean(0), valves['mitral valve'].mean(0)

    def near(lab, p):
        idx = np.argwhere(lab > 0)
        return lab[tuple(idx[np.linalg.norm(grid[tuple(idx.T)] - p, axis=1).argmin()])]

    right = near(side, tricuspid)
    chambers = np.zeros(cavity.shape, int)
    for label, valve, (atrium, ventricle) in [(right, 'tricuspid valve', (1, 2)), (3 - right, 'mitral valve', (3, 4))]:
        v = valves[valve]
        c = v.mean(0)
        axis = (apex - c) / np.linalg.norm(apex - c)
        radius = np.linalg.norm((v - c) - np.outer((v - c) @ axis, axis), axis=1).max()
        mask = side == label
        d = (grid - c) @ axis
        radial = np.linalg.norm((grid - c) - d[..., None] * axis, axis=-1)
        open_ = mask & ~((np.abs(d) < 0.0035) & (radial < radius * 1.15))  # the valve's opening, closed
        s = np.zeros(cavity.shape, int)
        s[open_ & (d < -0.012)] = atrium
        s[open_ & (d > 0.012)] = ventricle
        g = flood(flood(s, open_), mask)
        chambers[g > 0] = g[g > 0]
    rng = np.random.default_rng(7)
    r = lambda v: np.asarray(v).round(4).tolist()
    out = {'apex': r(apex), 'tricuspid': r(tricuspid), 'mitral': r(mitral), 'pulmonaryValve': r(valves['pulmonary valve'].mean(0)),
           'chambers': {}}
    for k, name in enumerate(['rightAtrium', 'rightVentricle', 'leftAtrium', 'leftVentricle'], 1):
        pts = grid[chambers == k]
        pick = rng.choice(len(pts), min(samples, len(pts)), replace=False)
        out['chambers'][name] = {'center': r(pts.mean(0)), 'volumeMl': round(len(pts) * (step * 100) ** 3), 'points': r(pts[np.sort(pick)])}
    return out


def inside_points(v, f, step, rng, n):
    """Up to n points inside a closed mesh, one per voxel cell of the given size, picked at random."""
    lo, hi = v.min(0), v.max(0)
    axes = [np.arange(lo[i] + step / 2, hi[i], step) for i in range(3)]
    below, _ = axis_crossings(v[f], axes, 1)
    grid = np.stack(np.meshgrid(*axes, indexing='ij'), -1)
    pts = grid[below % 2 == 1]
    return pts[rng.choice(len(pts), min(n, len(pts)), replace=False)] if len(pts) else pts


def meander(pts, start, end):
    """A route from start to end through every point, always to the nearest unvisited one (a winding path)."""
    left = list(range(len(pts)))
    route, cur = [], np.asarray(start)
    while left:
        # Lean toward the end as the route runs out of points, so it finishes there.
        d = np.linalg.norm(pts[left] - cur, axis=1) + 0.3 * np.linalg.norm(pts[left] - end, axis=1) / max(1, len(left) / 8)
        k = left.pop(int(np.argmin(d)))
        cur = pts[k]
        route.append(cur)
    return np.array(route)


def gut_route(parts):
    """The path food takes from the throat to the rectum, through the measured digestive organs.

    The esophagus, stomach, duodenum, colon and rectum are tubes (or bags), so
    their center lines are traced. The atlas models the jejunum and ileum as two
    packed masses rather than one long coiled tube, so the route through them
    is a winding path through points inside each mass (drawn, not traced).
    """
    rng = np.random.default_rng(23)

    def line(name, start_near):
        pts, _ = centerline(*parts[name], step=0.01)
        if np.linalg.norm(pts[0] - start_near) > np.linalg.norm(pts[-1] - start_near):
            pts = pts[::-1]
        return pts

    eso = centerline(*parts['esophagus'], step=0.01)[0]
    if eso[0][1] < eso[-1][1]:
        eso = eso[::-1]  # from the throat down
    cardia = nearest_pair(parts['esophagus'][0], parts['stomach'][0])[1]
    pylorus = np.mean(nearest_pair(parts['stomach'][0], parts['duodenum'][0]), axis=0)
    body = line('stomach', cardia)  # from the fundus, beside the cardia, round to the pylorus
    body = body[np.linalg.norm(body - cardia, axis=1).argmin():]
    duo = line('duodenum', pylorus)
    flexure = np.mean(nearest_pair(parts['duodenum'][0], parts['jejunum'][0]), axis=0)
    turn = np.mean(nearest_pair(parts['jejunum'][0], parts['ileum'][0]), axis=0)
    colon = centerline(*parts['colon, nsn'], step=0.01)[0]
    if colon[0][0] > colon[-1][0]:
        colon = colon[::-1]  # from the cecum (low on the body's right, −x) round to the sigmoid
    ile_v = parts['ileum'][0]
    ileocecal = (ile_v[np.linalg.norm(ile_v - colon[0], axis=1).argmin()] + colon[0]) / 2
    jej = meander(inside_points(*parts['jejunum'], 0.012, rng, 28), flexure, turn)
    ile = meander(inside_points(*parts['ileum'], 0.012, rng, 22), turn, ileocecal)
    rectum = line('rectum', colon[-1])
    r = lambda v: np.asarray(v).round(4).tolist()
    return {
        'esophagus': r(eso),
        'stomach': r([cardia, *body, pylorus]),
        'duodenum': r([pylorus, *duo, flexure]),
        'smallIntestine': r([flexure, *jej, turn, *ile, ileocecal]),
        'largeIntestine': r([ileocecal, *colon, *rectum]),
    }


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
def bone_marks(parts):
    """The long bones' axes, the femur's head and points down the spine (from whichever skeleton is in use)."""
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

    def center(name):
        v = parts[name][0]
        return ((v.min(0) + v.max(0)) / 2).round(4).tolist()

    return {
        'bones': {k: axis(k) for k in ['left humerus', 'right humerus', 'left radius', 'right radius', 'left femur', 'right femur',
                                         'left tibia', 'right tibia']},
        'femurHead': {'left': parts['left femur'][0].max(0).round(4).tolist()},
        'spine': [center(n) for n in ['atlas', 'third thoracic vertebra', 'eighth thoracic vertebra', 'first lumbar vertebra',
                                      'fifth lumbar vertebra', 'sacrum']],
    }


def landmarks(parts):
    """Centers and axes measured from the meshes (app meters)."""
    def box(name):
        v = parts[name][0]
        return v.min(0), v.max(0)

    def center(name):
        lo, hi = box(name)
        return ((lo + hi) / 2).round(4).tolist()

    def union(names):
        v = np.concatenate([parts[n][0] for n in names])
        return v.min(0), v.max(0)

    def end(name, pick):
        """The end of a vessel: its lowest point ('low') or its point farthest from the midline ('out')."""
        v = parts[name][0]
        i = v[:, 1].argmin() if pick == 'low' else np.abs(v[:, 0]).argmax()
        return v[i].round(4).tolist()

    eyes = eye_marks(parts['eyeball'][0])
    eye_y, eye_z = eyes['y'], eyes['z']
    ear_lo, ear_hi = box('ear')
    trachea = parts['trachea'][0]
    larynx_lo, larynx_hi = box('thyroid cartilage')
    top = trachea[trachea[:, 1] > larynx_lo[1] - 0.045]
    out = {
        'source': 'Measured from BodyParts3D meshes by tools/build_body_meshes.py',
        'height': round(float(parts['skin'][0][:, 1].max()), 4),
        'eyes': eyes,
        # The cochlea sits deep in the temporal bone, about 3 cm in from the ear canal.
        'innerEars': {'x': [-round(float(ear_hi[0]) - 0.05, 4), round(float(ear_hi[0]) - 0.05, 4)],
                      'y': round(float(eye_y) - 0.012, 4), 'z': round(float((ear_lo[2] + ear_hi[2]) / 2) + 0.004, 4)},
        # The olfactory patch: the roof of the nasal cavity, between and just behind the eyes.
        'nose': nose_marks(eyes),
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
        **bone_marks(parts),
    }
    out['flow'] = flow_paths(parts, np.array(out['heart']))
    out['digestive'] = digestive_marks(parts)
    out['heartChambers'] = heart_marks(parts)
    out['gut'] = gut_route(parts)
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


# ── The Z-Anatomy skeleton (tools/zanatomy_skeleton.py) ─────────────────
def replaced_by_skeleton(extras):
    """Whether a BodyParts3D part gives way to the Z-Anatomy skeleton: bones, teeth and rib cartilage."""
    return extras.get('system') == 'skeletal' and (extras.get('tissue') in ('bone', 'enamel') or extras.get('card') == 'rib-cage')


def skeleton_pieces(path):
    """→ [(name, rule, v, f, shade)] for every bone in the exported skeleton."""
    z = np.load(path)
    count = len({k.split('|')[0] for k in z.files})
    out = []
    for i in range(count):
        name = str(z[f'{i}|name'])
        rule = classify(name)
        if rule and rule['system'] == 'skeletal':
            out.append((name, rule, z[f'{i}|v'].astype(np.float64), z[f'{i}|f'].astype(np.int64), z[f'{i}|ao'].astype(np.float64)))
    return out


def add_groups(glb, groups):
    """Write each group of pieces (same system, card, label and side) as one mesh. → triangles written."""
    tris = 0
    for (system, card, label, side), g in sorted(groups.items()):
        vs, fs, shades, off = [], [], [], 0
        for piece in g['pieces']:
            v, f = piece[0], piece[1]
            vs.append(v)
            fs.append(f + off)
            shades.append(piece[2] if len(piece) > 2 else None)
            off += len(v)
        v, f = np.concatenate(vs), np.concatenate(fs)
        shade = np.concatenate(shades) if all(x is not None for x in shades) else None
        rule = g['rule']
        extras = {'system': system, 'card': card, 'label': label, 'tissue': rule['tissue'], **g.get('extras', {})}
        if g.get('fma'):
            extras['fma'] = sorted(g['fma'])
        if side:
            extras['side'] = side
        if 'natural' in rule:
            extras['natural'] = rule['natural']
        if card == 'eye':
            v = true_size_eyes(v)
        glb.add(f'{card}:{label}{":" + side if side else ""}', v, f, extras, shade)
        tris += len(f)
    return tris


def group_skeleton(groups, pieces):
    for name, rule, v, f, shade in pieces:
        key = (rule['system'], rule['card'], rule['label'], rule['side'])
        groups.setdefault(key, {'rule': rule, 'pieces': [], 'fma': [], 'extras': {'source': 'Z-Anatomy'}})
        groups[key]['pieces'].append((v, f, shade))


EYE_DIAMETER = 0.024  # an adult eyeball is about 24 mm across (Bekerman et al., 2014)


def true_size_eyes(v):
    """BodyParts3D's eyeballs are 31 mm across, which pushes them out of their sockets;
    shrink each one about its own center to an adult eye's 24 mm. Already true-sized
    eyes are left as they are."""
    v = v.copy()
    for side in (v[:, 0] > 0, v[:, 0] <= 0):
        lo, hi = v[side].min(0), v[side].max(0)
        k = EYE_DIAMETER / (hi - lo).mean()
        if k < 0.98:
            c = (lo + hi) / 2
            v[side] = c + (v[side] - c) * k
    return v


def eye_marks(v):
    """Where the eyes are: the middle of each eyeball, and how far forward the corneas reach."""
    right = v[v[:, 0] > 0]
    c = (right.min(0) + right.max(0)) / 2
    left = v[v[:, 0] <= 0]
    cl = (left.min(0) + left.max(0)) / 2
    return {'x': [round(float(cl[0]), 4), round(float(c[0]), 4)], 'y': round(float((c[1] + cl[1]) / 2), 4),
            'z': round(float((c[2] + cl[2]) / 2), 4), 'radius': EYE_DIAMETER / 2,
            'front': round(float((right[:, 2].max() + left[:, 2].max()) / 2), 4)}


def nose_marks(eyes):
    """The smell patch lines the roof of the nose, just under the ethmoid's cribriform plate:
    level with the top of the eyes' middle and about 12 mm behind it (measured on the ethmoid)."""
    return {'y': round(eyes['y'] + 0.002, 4), 'z': round(eyes['z'] - 0.012, 4)}


def from_bundle(skeleton):
    """Rebuild the bundle from itself with the Z-Anatomy skeleton, without the BodyParts3D sources."""
    sys.path.insert(0, str(ROOT / 'tools'))
    from glb_read import read_glb
    asset, old = read_glb(OUT)
    glb = Glb()
    discs = []
    for p in old:
        label = p['extras'].get('label', '')
        # Older bundles filed the spinal discs and the hyoid's muscles as bone, and the nose's cartilage as
        # muscle; file them as the rules now do.
        if label.startswith(('Intervertebral disk', 'Intervertebral discs')):
            discs.append((p['pos'], p['idx'].reshape(-1, 3)))
            continue
        if re.fullmatch(r'(Genio|Mylo|Omo|Sterno|Stylo|Thyro)hyoid', label):
            extras = {**p['extras'], 'system': 'muscular', 'card': 'muscular-system', 'tissue': 'muscle'}
            glb.add(f'muscular-system:{label}', p['pos'], p['idx'].reshape(-1, 3), extras)
            continue
        if label in ('Nasal cartilages', 'Nose cartilages (the nose past its bones)'):
            rule = classify('nasal cartilages')
            extras = {**p['extras'], **{k: rule[k] for k in ('system', 'card', 'label', 'tissue')}}
            glb.add(f"skull:{rule['label']}", p['pos'], p['idx'].reshape(-1, 3), extras)
            continue
        if p['extras'].get('card') == 'muscular-system':
            # Older bundles filed every muscle under one card; give the named ones their own, as the rules now do.
            rule = classify(label.lower())
            if rule and rule['card'] != 'muscular-system':
                p['extras'] = {**p['extras'], 'card': rule['card']}
                p['name'] = f"{rule['card']}:{label}"
        if replaced_by_skeleton(p['extras']):
            continue
        if p['extras'].get('card') == 'eye':
            p['pos'] = true_size_eyes(p['pos'])
            eyes = eye_marks(p['pos'])
        glb.add(p['name'], p['pos'], p['idx'].reshape(-1, 3), p['extras'])
    groups = {}
    if discs:
        rule = classify('intervertebral disk')
        groups[(rule['system'], rule['card'], rule['label'], '')] = {'rule': rule, 'pieces': discs}
    pieces = skeleton_pieces(skeleton)
    group_skeleton(groups, pieces)
    tris = add_groups(glb, groups)
    size = glb.write(OUT, {**asset, 'license': 'CC BY-SA 4.0', 'skeleton': 'Z-Anatomy'}, COPYRIGHT_ZA)
    marks = json.loads(LANDMARKS.read_text())
    marks.update(bone_marks({name: (v, f) for name, _, v, f, _ in pieces}))
    marks['eyes'] = eyes
    marks['nose'] = nose_marks(eyes)
    LANDMARKS.write_text(json.dumps(marks, indent=2) + '\n')
    print(f'wrote {OUT.relative_to(ROOT)}: {len(glb.nodes)} meshes, the skeleton {tris:,} triangles from Z-Anatomy, {size / 1e6:.1f} MB')
    print(f'updated the bone landmarks in {LANDMARKS.relative_to(ROOT)}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--fetch', action='store_true', help='download the STL files first')
    ap.add_argument('--scale', type=float, default=1.0, help='multiply every triangle budget')
    ap.add_argument('--skeleton', type=Path, help='use the Z-Anatomy bones exported by tools/zanatomy_skeleton.py')
    ap.add_argument('--from-bundle', action='store_true', help='with --skeleton: swap the bones in the existing bundle, no BodyParts3D download needed')
    args = ap.parse_args()
    if args.from_bundle:
        if not args.skeleton:
            sys.exit('--from-bundle needs --skeleton')
        return from_bundle(args.skeleton)
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

    license = 'CC BY-SA 2.1 JP'
    if args.skeleton:
        groups = {k: g for k, g in groups.items() if not replaced_by_skeleton({'system': k[0], 'card': k[1], 'tissue': g['rule']['tissue']})}
        pieces = skeleton_pieces(args.skeleton)
        group_skeleton(groups, pieces)
        parts.update({name: (v, f) for name, _, v, f, _ in pieces})
        license = 'CC BY-SA 4.0'
    glb = Glb()
    tris = add_groups(glb, groups)
    marks = landmarks(parts)
    size = glb.write(OUT, {'license': license, 'parts': len(parts)}, COPYRIGHT_ZA if args.skeleton else COPYRIGHT)
    LANDMARKS.write_text(json.dumps(marks, indent=2) + '\n')
    print(f'wrote {OUT.relative_to(ROOT)}: {len(glb.nodes)} meshes, {tris:,} triangles, {size / 1e6:.1f} MB')
    print(f'wrote {LANDMARKS.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
