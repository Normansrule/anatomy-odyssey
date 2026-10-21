"""Read back the whole-body bundle (assets/anatomy/body.glb) into numpy arrays.

Used by tools/zanatomy_skeleton.py (to fit its bones onto ours) and by
tools/build_body_meshes.py --from-bundle (to rebuild the bundle from itself
without the 1.3 GB of BodyParts3D source files). Undoes the quantization the
writer applies: each node's translation and scale give positions in meters.
"""
import json
import struct

import numpy as np

COMPONENTS = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def read_glb(path):
    """→ (asset extras, parts): each part {name, label, side, extras, pos (n×3 meters), idx (flat), color (n×4 or None)}."""
    data = open(path, 'rb').read()
    jl = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + jl])
    start = 20 + jl + 8
    binary = data[start:start + struct.unpack_from('<I', data, 20 + jl)[0]]

    def accessor(i):
        a = doc['accessors'][i]
        view = doc['bufferViews'][a['bufferView']]
        t = np.dtype(COMPONENTS[a['componentType']])
        w = WIDTH[a['type']]
        stride = view.get('byteStride', w * t.itemsize) // t.itemsize
        flat = np.frombuffer(binary, dtype=t, count=(a['count'] - 1) * stride + w, offset=view.get('byteOffset', 0) + a.get('byteOffset', 0))
        out = np.stack([flat[k::stride][:a['count']] for k in range(w)], 1).astype(np.float64)
        if a.get('normalized'):
            out = np.maximum(out / np.iinfo(t).max, -1)
        return out

    parts = []
    for node in doc['nodes']:
        prim = doc['meshes'][node['mesh']]['primitives'][0]
        pos = accessor(prim['attributes']['POSITION']) * np.array(node.get('scale', [1, 1, 1])) + np.array(node.get('translation', [0, 0, 0]))
        idx = accessor(prim['indices'])[:, 0].astype(np.int64)
        color = accessor(prim['attributes']['COLOR_0']) if 'COLOR_0' in prim['attributes'] else None
        extras = node.get('extras', {})
        parts.append({'name': node['name'], 'label': extras.get('label', ''), 'side': extras.get('side', ''), 'extras': extras,
                      'pos': pos, 'idx': idx, 'color': color})
    return doc['asset'].get('extras', {}), parts
