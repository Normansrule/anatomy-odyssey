#!/usr/bin/env python3
"""Build the procedural Moon textures for moon.html (no downloaded imagery).

    python3 scripts/build_moon_textures.py        # writes site/assets/img/moon/*.png

Outputs (equirectangular, longitude -180..180 left to right, latitude +90..-90 top to bottom,
selenographic longitudes positive EAST as in the International Astronomical Union convention):
    moon-albedo.png  2048 x 1024 grey  normal albedo: maria, highlands, craters and ray systems
    moon-height.png  2048 x 1024 grey  relief, 8-bit over the range in moon-height.json
                                       (the shader derives normals from it; colour tints are in the shader)

The maps are painted from a hand-authored list of real features whose centres and
diameters come from the International Astronomical Union (IAU) Gazetteer of Planetary
Nomenclature (planetarynames.wr.usgs.gov) and the Lunar and Planetary Institute (LPI)
lunar atlases, plus random craters drawn from a power-law size distribution, value noise
and simple morphometry:
    rim height   h_r = 0.036 D^1.014 km          (Pike 1977)
    depth        d = 0.196 D (simple, D < 15 km); d = 1.044 D^0.301 km (complex)   (Pike 1977)
The random craters are illustrative; only named features are placed where they really are.
"""
import os
import numpy as np
from PIL import Image

W, H = 2048, 1024
R_MOON = 1737.4
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "site", "assets", "img", "moon")
rng = np.random.default_rng(1969)

lon = (np.arange(W) + 0.5) / W * 2 * np.pi - np.pi
lat = np.pi / 2 - (np.arange(H) + 0.5) / H * np.pi
LON, LAT = np.meshgrid(lon, lat)
CL = np.cos(LAT)
X, Y, Z = CL * np.cos(LON), CL * np.sin(LON), np.sin(LAT)   # x -> lon 0, y -> 90E, z -> north


def vec(la, lo):
    la, lo = np.radians(la), np.radians(lo)
    return np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])


def ang_dist(v, Xs=X, Ys=Y, Zs=Z):
    """Angular distance (radians) of every pixel from unit vector v."""
    return np.arccos(np.clip(Xs * v[0] + Ys * v[1] + Zs * v[2], -1, 1))


def bearing(v, Xs=X, Ys=Y, Zs=Z):
    """Bearing (radians, from north through east) of each pixel as seen from v."""
    la0 = np.arcsin(v[2]); lo0 = np.arctan2(v[1], v[0])
    la = np.arcsin(np.clip(Zs, -1, 1)); lo = np.arctan2(Ys, Xs)
    dl = lo - lo0
    return np.arctan2(np.sin(dl) * np.cos(la), np.cos(la0) * np.sin(la) - np.sin(la0) * np.cos(la) * np.cos(dl))


# ---------------------------------------------------------------- noise ---
_perm = rng.permutation(4096)


def _hash(ix, iy, iz):
    return _perm[(_perm[(_perm[ix & 4095] + iy) & 4095] + iz) & 4095] / 4095.0


def value_noise(x, y, z):
    ix, iy, iz = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64), np.floor(z).astype(np.int64)
    fx, fy, fz = x - ix, y - iy, z - iz
    ux, uy, uz = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy), fz * fz * (3 - 2 * fz)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (ux if dx else 1 - ux) * (uy if dy else 1 - uy) * (uz if dz else 1 - uz)
                out = out + w * _hash(ix + dx, iy + dy, iz + dz)
    return out * 2 - 1


def fbm(freq, octaves, gain=0.5, Xs=X, Ys=Y, Zs=Z, seed=0.0):
    tot, amp, norm = 0, 1.0, 0
    for o in range(octaves):
        f = freq * 2 ** o
        tot = tot + amp * value_noise(Xs * f + seed + 17.3 * o, Ys * f - seed * 0.7, Zs * f + 3.1 * o)
        norm += amp; amp *= gain
    return tot / norm


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


print("noise ...")
N_large = fbm(2.2, 5)
N_mid = fbm(9.0, 5, seed=4.0)
N_fine = fbm(40.0, 4, seed=9.0)
N_edge = fbm(5.0, 4, seed=21.0)
N_20 = fbm(20.0, 3, seed=33.0)

# ------------------------------------------------------------------ maria ---
# (name, lat, lon, diameter km, albedo) - IAU Gazetteer centres; large irregular maria are built
# from several lobes so their outlines follow the real shapes.
MARIA = [
    ("Oceanus Procellarum", 18.4, -57.4, 0, 0.29),
    ("Procellarum a", 3.0, -53.0, 780, 0.29), ("Procellarum b", 15.0, -58.0, 760, 0.28),
    ("Procellarum c", 27.0, -55.0, 700, 0.29), ("Procellarum d", 38.0, -52.0, 520, 0.30),
    ("Procellarum e", 47.0, -48.0, 360, 0.31), ("Procellarum f", -4.0, -44.0, 480, 0.30),
    ("Procellarum g", 10.0, -43.0, 500, 0.30), ("Procellarum h", 20.0, -68.0, 420, 0.28),
    ("Procellarum i", 5.0, -66.0, 360, 0.29), ("Sinus Roris", 52.0, -52.0, 380, 0.31),
    ("Mare Imbrium", 34.5, -18.0, 1000, 0.315), ("Imbrium SE", 26.5, -5.0, 300, 0.32),
    ("Palus Putredinis", 26.0, 1.5, 200, 0.33),
    ("Mare Serenitatis", 28.0, 17.5, 660, 0.345), ("Serenitatis-Tranquillitatis", 17.5, 24.5, 230, 0.30),
    ("Mare Tranquillitatis", 8.5, 31.4, 720, 0.265), ("Tranquillitatis N", 14.0, 26.0, 380, 0.27),
    ("Tranquillitatis E", 4.0, 36.5, 400, 0.265), ("Tranquillitatis S", 1.0, 27.0, 300, 0.275),
    ("Sinus Asperitatis", -5.0, 26.5, 220, 0.30), ("Tranquillitatis-Fecunditatis", -1.0, 44.0, 160, 0.29),
    ("Mare Crisium", 17.0, 59.5, 470, 0.28),
    ("Mare Fecunditatis", -7.8, 51.3, 560, 0.30), ("Fecunditatis S", -14.0, 51.5, 420, 0.30),
    ("Fecunditatis N", 0.5, 54.0, 300, 0.30),
    ("Mare Nectaris", -15.2, 35.5, 333, 0.31),
    ("Mare Nubium", -21.3, -16.6, 700, 0.33),
    ("Mare Cognitum", -10.0, -23.1, 376, 0.32),
    ("Mare Humorum", -24.4, -38.6, 389, 0.30),
    ("Mare Insularum", 7.5, -30.9, 513, 0.32),
    ("Mare Vaporum", 13.3, 3.6, 220, 0.32),
    ("Sinus Medii", 2.4, 1.7, 220, 0.35),
    ("Sinus Aestuum", 11.5, -8.8, 230, 0.31),
    ("Sinus Iridum", 44.1, -31.5, 236, 0.31),
    ("Lacus Somniorum", 38.0, 29.2, 360, 0.36), ("Lacus Mortis", 45.0, 27.2, 151, 0.36),
] + [("Mare Frigoris", 56.5 + 0.03 * lo_, float(lo_), 270, 0.345) for lo_ in range(-48, 50, 9)] + [
    ("Mare Spumans", 1.1, 65.1, 139, 0.31), ("Mare Undarum", 6.8, 68.4, 243, 0.31),
    ("Mare Smythii", 1.3, 87.5, 373, 0.31), ("Mare Marginis", 13.3, 86.1, 358, 0.34),
    ("Mare Humboldtianum", 56.8, 81.5, 273, 0.33),
    ("Mare Australe a", -38.9, 93.0, 300, 0.37), ("Mare Australe b", -46.0, 84.0, 220, 0.38),
    ("Mare Australe c", -34.0, 100.0, 200, 0.38),
    ("Mare Orientale", -19.9, -94.7, 294, 0.30), ("Lacus Veris", -16.5, -87.0, 140, 0.33),
    ("Lacus Autumni", -9.9, -83.9, 120, 0.34),
    ("Mare Moscoviense", 27.3, 147.9, 277, 0.30),
    ("Mare Ingenii", -33.7, 163.5, 250, 0.37),
    ("Tsiolkovskiy floor", -20.4, 129.1, 120, 0.28),
    ("Grimaldi floor", -5.2, -68.6, 150, 0.27),
    ("Plato floor", 51.6, -9.4, 92, 0.25),
    ("Endymion floor", 53.6, 57.0, 110, 0.30),
    ("Riccioli floor", -3.3, -74.6, 120, 0.33),
    ("Crüger", -16.7, -66.8, 45, 0.28),
    ("Apollo basin mare", -36.0, -151.0, 150, 0.36), ("Apollo basin mare 2", -42.0, -155.0, 90, 0.36),
    ("Von Kármán floor", -44.8, 175.9, 150, 0.45),
]

print("maria ...")
albedo = 0.60 + 0.10 * N_large + 0.09 * N_mid + 0.07 * N_20 + 0.05 * N_fine       # highlands
height = 1.6 * N_large + 0.6 * N_mid                                  # km (fine relief is added in the shader)
# Metaball field: each lobe contributes exp(-ln2 (d/r)^3) (0.5 at its nominal radius); lobes merge
# where they overlap and a noise-warped threshold gives the ragged outlines of real maria.
F = np.zeros_like(albedo); FA = np.zeros_like(albedo)
# domain warp (about +-40 km) so outlines wander like real lava fronts rather than circles
Wx, Wy, Wz = X + 0.045 * fbm(7.0, 4, seed=51.0), Y + 0.045 * fbm(7.0, 4, seed=61.0), Z + 0.045 * fbm(7.0, 4, seed=71.0)
Wn = np.sqrt(Wx * Wx + Wy * Wy + Wz * Wz); Wx, Wy, Wz = Wx / Wn, Wy / Wn, Wz / Wn
for name, la, lo, dkm, alb in MARIA:
    if dkm == 0:
        continue
    r = dkm / 2 / R_MOON
    f = np.exp(-0.693 * (ang_dist(vec(la, lo), Wx, Wy, Wz) / r) ** 5)
    F += f; FA += f * alb
mare_alb = FA / np.maximum(F, 1e-6)
Fw = F + 0.5 * N_edge + 0.3 * N_mid + 0.22 * N_20
mare = smoothstep(0.40, 0.56, Fw)
mare_soft = smoothstep(0.15, 0.9, Fw)
mare_alb = mare_alb + 0.045 * N_mid + 0.03 * N_20 + 0.015 * N_fine
albedo = albedo * (1 - mare) + mare_alb * mare
# (mare colour tints, bluish titanium-rich basalts, are applied in the shader)
height -= 1.6 * mare_soft * (1 + 0.2 * N_mid)

# large basins: topography (South Pole-Aitken is the deepest place on the Moon, ~2500 km across)
print("basins ...")
for la, lo, dkm, depth, dark in [(-53.0, -169.0, 2500, 5.5, 0.07), (32.8, -15.6, 1160, 2.5, 0), (28.0, 17.5, 740, 2.0, 0),
                                  (17.0, 59.1, 740, 3.0, 0), (-15.2, 35.5, 860, 2.5, 0), (-24.4, -38.6, 820, 2.0, 0),
                                  (-19.9, -94.7, 930, 3.5, 0), (2.6, -128.7, 570, 2.5, 0), (-36.1, -151.8, 524, 3.0, 0),
                                  (-4.4, -157.4, 437, 2.0, 0), (27.3, 147.9, 445, 2.5, 0), (-75.0, 132.4, 312, 2.0, 0),
                                  (-20.4, 129.1, 185, 1.2, 0)]:
    r = dkm / 2 / R_MOON
    d = ang_dist(vec(la, lo)); x = d / r
    height -= depth * np.exp(-(x / 0.75) ** 4) * (1 + 0.15 * N_mid)
    height += 0.25 * depth * np.exp(-((x - 1.0) / 0.1) ** 2) * (1 + 0.8 * N_mid)       # main ring
    if dkm < 1200:
        height += 0.12 * depth * np.exp(-((x - 1.45) / 0.08) ** 2) * (1 + N_mid)          # outer ring
    if dark:
        albedo -= dark * smoothstep(1.0, 0.3, x) * (1 + 0.5 * N_mid)                      # SPA is iron-rich, darker

# Montes Apenninus / Carpathus / Caucasus: the Imbrium rim, strongest on the south-east
v_imb = vec(32.8, -15.6); d_imb = ang_dist(v_imb) / (1160 / 2 / R_MOON); b_imb = bearing(v_imb)
arc = np.clip(np.cos(b_imb - np.radians(125)), 0, 1) ** 1.5 + 0.35 * np.clip(np.cos(b_imb - np.radians(200)), 0, 1)
height += 3.2 * arc * np.exp(-((d_imb - 1.0) / 0.07) ** 2) * (1 + 0.6 * N_mid)
albedo += 0.05 * arc * np.exp(-((d_imb - 1.02) / 0.08) ** 2)

# ---------------------------------------------------------------- craters ---
# (lat, lon, diameter km, freshness 0..1, extra albedo, dark floor albedo or None)
NAMED = [
    (-43.31, -11.36, 85, 1.0, 0.22, None),     # Tycho (about 108 Myr, brilliant rays)
    (9.62, -20.08, 96, 0.9, 0.15, None),       # Copernicus
    (8.12, -38.01, 31, 0.9, 0.18, None),       # Kepler
    (23.73, -47.49, 40, 1.0, 0.36, None),      # Aristarchus: the brightest large feature
    (51.62, -9.38, 101, 0.4, 0.0, 0.24),       # Plato (dark lava floor)
    (-58.62, -14.73, 231, 0.3, 0.0, None),     # Clavius
    (-5.2, -68.6, 173, 0.25, 0.0, 0.27),       # Grimaldi
    (-8.86, 61.04, 132, 0.75, 0.08, None),     # Langrenus
    (-25.3, 60.4, 188, 0.5, 0.03, None),       # Petavius
    (-11.4, 26.4, 100, 0.75, 0.05, None),      # Theophilus
    (-13.2, 24.0, 98, 0.3, 0.0, None),         # Cyrillus
    (-18.1, 23.4, 99, 0.3, 0.0, None),         # Catharina
    (-9.16, -1.84, 153, 0.2, 0.0, None),       # Ptolemaeus
    (-13.39, -3.22, 108, 0.3, 0.0, None),      # Alphonsus
    (-18.2, -1.9, 97, 0.4, 0.0, None),         # Arzachel
    (29.72, -3.99, 83, 0.4, 0.0, 0.33),        # Archimedes
    (33.9, 1.2, 55, 0.8, 0.07, None),          # Aristillus
    (30.7, 1.5, 39, 0.8, 0.06, None),          # Autolycus
    (14.47, -11.32, 58, 0.7, 0.03, None),      # Eratosthenes
    (16.1, 46.8, 28, 1.0, 0.25, None),         # Proclus
    (31.8, 29.9, 95, 0.35, 0.0, None),         # Posidonius
    (-44.3, -55.3, 206, 0.2, 0.0, None),       # Schickard
    (-50.0, -6.2, 194, 0.2, 0.0, None),        # Maginus
    (-49.6, -21.8, 145, 0.3, 0.0, None),       # Longomontanus
    (-17.5, -39.9, 110, 0.4, 0.0, None),       # Gassendi
    (-20.7, -22.2, 61, 0.7, 0.04, None),       # Bullialdus
    (-5.1, 5.2, 138, 0.15, 0.0, None),         # Hipparchus
    (-11.2, 4.0, 136, 0.25, 0.0, None),        # Albategnius
    (46.7, 44.4, 87, 0.6, 0.03, None),         # Atlas
    (46.7, 39.1, 69, 0.6, 0.03, None),         # Hercules
    (53.6, 57.0, 123, 0.3, 0.0, None),         # Endymion
    (50.2, 17.4, 87, 0.7, 0.04, None),         # Aristoteles
    (44.3, 16.3, 67, 0.7, 0.03, None),         # Eudoxus
    (40.2, 4.6, 57, 0.4, 0.0, None),           # Cassini
    (-45.4, 40.3, 190, 0.15, 0.0, None),       # Janssen
    (-41.1, 6.0, 126, 0.2, 0.0, None),         # Stöfler
    (-32.5, -5.2, 256, 0.1, 0.0, None),        # Deslandres
    (-3.3, -74.6, 146, 0.2, 0.0, None),        # Riccioli
    (-32.8, 51.9, 74, 0.8, 0.06, None),        # Stevinus
    (-36.0, 60.6, 125, 0.3, 0.0, None),        # Furnerius
    (-29.2, -26.3, 20, 0.5, 0.0, None),        # Pitatus region small
    (73.4, -10.1, 51, 0.9, 0.12, None),        # Anaxagoras (rayed)
    (8.1, -77.6, 43, 0.9, 0.12, None),         # Glushko (rayed)
    (-20.4, 129.1, 185, 0.5, 0.0, None),       # Tsiolkovskiy rim + peak
    (-4.4, -157.4, 437, 0.15, 0.0, None),      # Korolev
    (2.6, -128.7, 570, 0.1, 0.0, None),        # Hertzsprung
    (-36.1, -151.8, 524, 0.15, 0.0, None),     # Apollo
    (5.7, 140.9, 313, 0.2, 0.0, None),         # Mendeleev
    (-5.9, 179.4, 93, 0.6, 0.0, None),         # Daedalus
    (-44.8, 175.9, 186, 0.15, 0.0, None),      # Von Kármán
    (-56.7, 163.6, 312, 0.15, 0.0, None),      # Poincaré
    (-75.0, 132.4, 312, 0.35, 0.0, None),      # Schrödinger
    (58.7, -146.1, 345, 0.15, 0.0, None),      # Birkhoff
    (-20.2, 149.2, 265, 0.2, 0.0, None),       # Gagarin
    (35.9, 102.8, 22, 1.0, 0.30, None),        # Giordano Bruno (youngest large crater, rays)
    (22.4, -163.1, 71, 1.0, 0.18, None),       # Jackson (rays)
    (18.4, -113.5, 64, 0.9, 0.12, None),       # Ohm (rays)
    (-89.67, 129.78, 21, 0.6, 0.0, None),      # Shackleton (south pole)
    (-80.0, 36.0, 69, 0.3, 0.0, None),         # region of Malapert/Leibnitz
    (-86.0, -40.0, 50, 0.4, 0.0, None),        # Cabeus region
    (-72.8, -44.8, 114, 0.3, 0.0, None),       # Moretus-region crater
    (-69.8, 13.5, 180, 0.2, 0.0, None),        # Maurolycus-scale highland crater
]
# Ray systems: (lat, lon, rays, max length km, strength)
RAYS = [(-43.31, -11.36, 52, 1900, 0.30), (9.62, -20.08, 36, 800, 0.17), (8.12, -38.01, 22, 330, 0.12),
        (23.73, -47.49, 18, 260, 0.14), (16.1, 46.8, 16, 650, 0.12), (35.9, 102.8, 20, 350, 0.18),
        (22.4, -163.1, 20, 600, 0.12), (18.4, -113.5, 12, 300, 0.08), (73.4, -10.1, 14, 700, 0.08),
        (8.1, -77.6, 14, 350, 0.08), (-32.8, 51.9, 10, 450, 0.06), (-8.86, 61.04, 8, 300, 0.04)]

print("craters ...")
# random crater population, cumulative N(>D) ~ D^-1.9 between 5 and 140 km
craters = []
n_rand = 16000
u = rng.random(n_rand)
Dmin, Dmax, a = 9.0, 160.0, 1.75
Ds = (Dmin ** -a - u * (Dmin ** -a - Dmax ** -a)) ** (-1 / a)
zz = rng.uniform(-1, 1, n_rand); phi = rng.uniform(-np.pi, np.pi, n_rand)
las, los = np.degrees(np.arcsin(zz)), np.degrees(phi)
iy = np.clip(((90 - las) / 180 * H).astype(int), 0, H - 1); ix = np.clip(((los + 180) / 360 * W).astype(int), 0, W - 1)
mare_at = mare[iy, ix]
keep = rng.random(n_rand) > mare_at * 0.85                    # maria are younger: fewer craters
for la, lo, D, k in zip(las[keep], los[keep], Ds[keep], keep[keep]):
    fresh = rng.random() ** 3.0
    craters.append((la, lo, D, fresh, 0.07 * fresh - 0.015, None))
craters = NAMED + craters


def patch(la, lo, rad_deg):
    """Index arrays (rows, cols) of the pixel box around (la, lo) of angular radius rad_deg."""
    r0 = max(0, int((90 - la - rad_deg) / 180 * H) - 1); r1 = min(H, int((90 - la + rad_deg) / 180 * H) + 2)
    top, bot = 90 - r0 / H * 180, 90 - r1 / H * 180
    if top > 89 or bot < -89 or rad_deg / max(np.cos(np.radians(max(abs(la) - rad_deg, 0))), 1e-3) > 170:
        cols = np.arange(W)
    else:
        dlon = rad_deg / max(np.cos(np.radians(min(89.0, abs(la) + rad_deg))), 0.02)
        c0 = int((lo - dlon + 180) / 360 * W) - 1; c1 = int((lo + dlon + 180) / 360 * W) + 2
        cols = np.arange(c0, c1) % W
    return np.arange(r0, r1), cols


for la, lo, D, fresh, bright, floor in craters:
    R = D / 2
    rad = R * 3.2 / R_MOON * 180 / np.pi
    rows, cols = patch(la, lo, rad)
    sub = np.ix_(rows, cols)
    v = vec(la, lo)
    d = ang_dist(v, X[sub], Y[sub], Z[sub]) * R_MOON           # km
    x = d / R
    depth = 0.196 * D if D < 15 else 1.044 * D ** 0.301
    rim = 0.036 * D ** 1.014
    age = 0.25 + 0.75 * fresh
    nz = N_mid[sub]
    xr = x * (1 + 0.04 * nz)
    inner = np.where(xr < 1, (xr ** 2 - 1) * depth + rim, 0)
    if D > 22:                                                  # complex: flat floor + central peak
        fl = 0.45 if D < 150 else 0.6
        inner = np.where(xr < fl, -depth + rim + 0.0 * xr, inner)
        inner = np.where((xr >= fl) & (xr < 1), -depth + rim + (depth) * smoothstep(fl, 1.0, xr) ** 1.6, inner)
        if D < 200:
            inner += np.where(xr < 0.3, 0.45 * depth * np.exp(-(xr / 0.12) ** 2) * (1 + 0.5 * nz), 0)
    outer = np.where(xr >= 1, rim * np.power(np.maximum(xr, 1), -3.0), 0)
    height[sub] += (inner + outer) * age
    # albedo: fresh craters have bright interiors and ejecta; dark floored craters get mare lava
    alb = albedo[sub]
    ej = np.where(xr < 1, 1.0, np.exp(-(xr - 1) * 2.2))
    alb = alb + bright * ej * (1 + 0.4 * N_fine[sub])
    alb = alb + (0.004 + 0.05 * fresh * fresh) * np.exp(-((xr - 1) / 0.15) ** 2) * (1 + nz)
    alb = alb - 0.03 * (1 - fresh) * smoothstep(0.85, 0.3, xr) * (1 + nz)
    if floor is not None:
        alb = np.where(xr < 0.85, floor + 0.02 * nz, alb)
    albedo[sub] = alb

print("fresh spots ...")
# small, young craters (a few km) are unresolved here but their bright ejecta halos speckle the full Moon
for i in range(900):
    zz_ = rng.uniform(-1, 1); la_ = np.degrees(np.arcsin(zz_)); lo_ = rng.uniform(-180, 180)
    Rk = rng.uniform(4, 16); rad = Rk * 4 / R_MOON * 180 / np.pi
    rows, cols = patch(la_, lo_, rad); sub = np.ix_(rows, cols)
    d = ang_dist(vec(la_, lo_), X[sub], Y[sub], Z[sub]) * R_MOON
    albedo[sub] += rng.uniform(0.04, 0.16) * np.exp(-(d / Rk) ** 1.5)

print("rays ...")
for la, lo, n, Lkm, s in RAYS:
    v = vec(la, lo)
    d = ang_dist(v) * R_MOON
    b = bearing(v)
    ray = np.zeros_like(albedo)
    for i in range(n):
        th = rng.uniform(-np.pi, np.pi)
        L = Lkm * rng.uniform(0.35, 1.0) * (1.25 if i == 0 and Lkm > 1500 else 1)
        w = rng.uniform(6, 20)                                     # km half-width
        db = np.angle(np.exp(1j * (b - th)))
        perp = np.abs(np.sin(db)) * d
        along = np.cos(db) * d
        g = np.exp(-(perp / (w * (1 + along / L))) ** 2) * (along > 0) * np.exp(-along / (L * 0.45))
        ray += g * rng.uniform(0.5, 1.0)
    mott = 0.55 + 0.45 * np.clip(N_fine * 2 + 0.5, 0, 1)
    halo = np.exp(-d / (Lkm * 0.02))
    albedo += s * np.clip(ray * mott + 0.5 * halo, 0, 1.2)

albedo = np.clip(albedo, 0.06, 1.0)

# ------------------------------------------------------------------ write ---
os.makedirs(OUT, exist_ok=True)
gamma = 1 / 1.6                                                   # store roughly perceptual values
base = np.clip(np.power(albedo / np.percentile(albedo, 99.7), gamma), 0, 1)
gray = np.clip(base * 255, 0, 255).astype(np.uint8)
Image.fromarray(gray, "L").save(os.path.join(OUT, "moon-albedo.png"), optimize=True)

print("height ...")
# 8-bit height (km, clipped to the 0.05..99.95 percentiles); the shader takes finite-difference
# normals from it, smoothed by bilinear filtering, and adds its own fine procedural relief.
hmin, hmax = (float(v) for v in np.percentile(height, [0.05, 99.95]))
g = np.round((np.clip(height, hmin, hmax) - hmin) / (hmax - hmin) * 255).astype(np.uint8)
Image.fromarray(g, "L").save(os.path.join(OUT, "moon-height.png"), optimize=True)
with open(os.path.join(OUT, "moon-height.json"), "w") as fh:
    fh.write('{"minKm": %.4f, "maxKm": %.4f, "note": "grey level 0..255 maps linearly to minKm..maxKm (procedural relief, illustrative)"}\n' % (hmin, hmax))

for f in ("moon-albedo.png", "moon-height.png"):
    print(f, round(os.path.getsize(os.path.join(OUT, f)) / 1024), "KiB")
