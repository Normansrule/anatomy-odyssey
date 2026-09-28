#!/usr/bin/env python3
"""Build the stylised Earth textures used by site/earth.html.

    python3 scripts/build_earth_textures.py

Input : simulations/cosmic/data/land_mask_025deg.npz  (Natural Earth land mask,
        public domain, 0.25 degree grid, row 0 = 90 N)
Output: site/assets/img/earth/
        earth-albedo.jpg  stylised true-colour surface (biomes, ice, ocean shelves)
        earth-data.png    R = land (soft coast), G = city lights (stylised), B = height proxy
        earth-normal.jpg  R/G = east/north surface slope (0.5 = flat), B = ice mask
        earth-clouds.jpg  cloud cover (stylised, periodic in longitude)

Everything except the coastline is *stylised*: biomes come from latitude,
distance-to-coast and a hand-drawn list of deserts, rainforests and mountain
ranges; night lights come from a list of large metropolitan areas plus
regional density blobs. It is an impression of Earth, not a map.
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "site" / "assets" / "img" / "earth"
W, H = 2048, 1024
rng = np.random.default_rng(1969)

# ---------------------------------------------------------------- grids
lat = 90 - (np.arange(H) + 0.5) * 180 / H          # deg, row 0 = north
lon = -180 + (np.arange(W) + 0.5) * 360 / W        # deg
LON, LAT = np.meshgrid(lon, lat)
ALAT = np.abs(LAT)
COSL = np.cos(np.radians(LAT))


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def fbm(beta, seed, lo=1.0):
    """Periodic spectral noise, power ~ 1/f^beta, normalised to 0..1."""
    r = np.random.default_rng(seed)
    wn = r.standard_normal((H, W))
    F = np.fft.rfft2(wn)
    fy = np.fft.fftfreq(H)[:, None] * H
    fx = np.fft.rfftfreq(W)[None, :] * W / 2      # x spans 360 deg, y 180 deg
    f = np.sqrt(fx ** 2 + fy ** 2)
    f[0, 0] = 1
    F *= 1.0 / np.maximum(f, lo) ** (beta / 2)
    n = np.fft.irfft2(F, s=(H, W))
    n = (n - n.mean()) / n.std()
    return 0.5 + 0.18 * n


def ellipse(clat, clon, rlat, rlon):
    """Soft elliptical blob (1 at centre, 0 outside), longitude wraps."""
    dl = (LON - clon + 180) % 360 - 180
    d = np.sqrt(((LAT - clat) / rlat) ** 2 + (dl / rlon) ** 2)
    return smoothstep(1.0, 0.35, d)


def polyline_dist(pts):
    """Distance in degrees (longitude scaled by cos lat) to a (lat, lon) polyline."""
    d = np.full((H, W), 1e9)
    for (a_lat, a_lon), (b_lat, b_lon) in zip(pts[:-1], pts[1:]):
        pad = 8
        la0, la1 = min(a_lat, b_lat) - pad, max(a_lat, b_lat) + pad
        lo0, lo1 = min(a_lon, b_lon) - pad, max(a_lon, b_lon) + pad
        r0, r1 = int((90 - la1) * H / 180), int((90 - la0) * H / 180) + 1
        c0, c1 = int((lo0 + 180) * W / 360), int((lo1 + 180) * W / 360) + 1
        r0, c0 = max(r0, 0), max(c0, 0)
        sl = (slice(r0, r1), slice(c0, c1))
        c = np.cos(np.radians(0.5 * (a_lat + b_lat)))
        px, py = (LON[sl] - a_lon) * c, LAT[sl] - a_lat
        bx, by = (b_lon - a_lon) * c, b_lat - a_lat
        t = np.clip((px * bx + py * by) / max(bx * bx + by * by, 1e-9), 0, 1)
        dd = np.hypot(px - t * bx, py - t * by)
        d[sl] = np.minimum(d[sl], dd)
    return d


# ---------------------------------------------------------------- land mask
d = np.load(ROOT / "simulations" / "cosmic" / "data" / "land_mask_025deg.npz")
shape = tuple(d["shape"])
mask = np.unpackbits(d["bits"])[: shape[0] * shape[1]].reshape(shape).astype(np.float32)
m = ndimage.zoom(mask, (H / shape[0], W / shape[1]), order=1)
m = ndimage.gaussian_filter(m, 0.8, mode=("nearest", "wrap"))
land = smoothstep(0.35, 0.65, m)
landb = land > 0.5

# distance to coast (km-ish), wrapping in longitude
pad = W // 8
lp = np.concatenate([landb[:, -pad:], landb, landb[:, :pad]], axis=1)
px_km = 40030 / W
d_in = ndimage.distance_transform_edt(lp)[:, pad:-pad] * px_km
d_out = ndimage.distance_transform_edt(~lp)[:, pad:-pad] * px_km

# ---------------------------------------------------------------- noise
n_lo = fbm(3.2, 1)
n_mid = fbm(2.4, 2)
n_hi = fbm(1.6, 3)
n_ridge = 1 - np.abs(fbm(2.2, 4) - 0.5) * 2

# ---------------------------------------------------------------- relief (hand-drawn ranges, stylised)
RANGES = [  # (points, half-width deg, peak height 0..1)
    ([(35.5, 72), (34, 77), (30.5, 81), (28, 86), (27.5, 92), (28.5, 97)], 2.2, 1.0),       # Himalaya
    ([(34.5, 69), (36.5, 71), (38.5, 73.5), (36, 76)], 2.0, 0.9),                            # Hindu Kush, Pamir
    ([(42, 70), (42.5, 78), (43, 86), (43.5, 94)], 1.8, 0.75),                               # Tian Shan
    ([(36, 77), (35.8, 85), (35.5, 95), (34, 101)], 1.6, 0.8),                               # Kunlun
    ([(50, 85), (47, 92), (46, 97)], 1.8, 0.55),                                             # Altai
    ([(37, 44), (33, 47), (29, 52), (27, 57)], 1.6, 0.55),                                   # Zagros
    ([(43.5, 40), (42, 46)], 1.0, 0.65),                                                     # Caucasus
    ([(44, 7), (46, 8), (46.5, 11), (47, 14)], 1.0, 0.7),                                    # Alps
    ([(43, -1.5), (42.5, 2.5)], 0.7, 0.5),                                                   # Pyrenees
    ([(48, 19), (49, 22), (47, 26), (45.5, 25), (45, 22)], 1.0, 0.4),                        # Carpathians
    ([(59, 6), (62, 8), (65, 13), (68, 17), (70, 21)], 1.8, 0.45),                           # Scandinavian
    ([(68, 66), (62, 59), (56, 58), (51, 58)], 1.2, 0.35),                                   # Urals
    ([(31, -9), (33, -4), (35, 2), (36, 8)], 1.4, 0.5),                                      # Atlas
    ([(3, 36), (-3, 36), (-8, 33), (-12, 34)], 1.6, 0.45),                                   # East African rift
    ([(-28, 29.5), (-31, 27.5)], 1.2, 0.4),                                                  # Drakensberg
    ([(10, -72), (5, -76), (0, -78), (-5, -79), (-10, -77), (-15, -72), (-18, -69), (-22, -67.5),
      (-27, -68.5), (-33, -70), (-40, -71.5), (-46, -72.5), (-51, -73.5), (-55, -70)], 1.6, 0.95),  # Andes
    ([(60, -128), (55, -122), (50, -116), (46, -112), (43, -110), (39, -106), (35, -106), (32, -108)], 2.4, 0.7),  # Rockies
    ([(49, -121.5), (45, -121.7), (41, -122), (38, -119.5), (36, -118.3)], 1.0, 0.55),     # Cascades, Sierra Nevada
    ([(30, -108), (25, -105.5), (21, -104)], 1.4, 0.45),                                    # Sierra Madre Occidental
    ([(26, -100.5), (21, -99), (18, -97)], 1.0, 0.4),                                       # Sierra Madre Oriental
    ([(61, -153), (63, -148), (62, -141), (60, -137)], 1.4, 0.7),                           # Alaska Range
    ([(68.5, -160), (68, -145)], 1.2, 0.4),                                                 # Brooks
    ([(59, -135), (55, -129), (51, -124)], 1.2, 0.55),                                      # Coast Mountains
    ([(34, -85), (37, -81), (40, -77.5), (42, -75), (44, -72), (47, -68)], 1.6, 0.25),      # Appalachians
    ([(-16, 145.5), (-22, 148), (-28, 152), (-33, 150), (-37, 148)], 1.2, 0.3),             # Great Dividing Range
    ([(-41, 173), (-44, 170), (-46, 167.5)], 0.8, 0.6),                                     # Southern Alps
    ([(34, 133), (36, 138), (39, 140.5), (43, 143)], 0.9, 0.45),                            # Japan
    ([(-4, 136), (-5, 141), (-6.5, 146)], 1.0, 0.6),                                        # New Guinea
    ([(4, 96), (-1, 100), (-5, 104)], 0.8, 0.4),                                            # Sumatra
    ([(68, 128), (65, 135), (64, 145), (66, 155)], 2.0, 0.4),                               # Verkhoyansk, Chersky
    ([(10, 38), (8, 39), (12, 38.5)], 3.0, 0.55),                                           # Ethiopian highlands
]
PLATEAUS = [  # (lat, lon, r_lat, r_lon, height)
    (33, 87, 4.5, 13, 0.75), (-18, -67.5, 3, 4, 0.7), (46, 103, 5, 11, 0.35), (32, 55, 5, 8, 0.3),
    (39, 34, 2.5, 5, 0.3), (18, 77, 5, 5, 0.15), (39, -114, 5, 6, 0.3), (24, -102, 5, 4, 0.35),
    (-18, -45, 7, 8, 0.15), (-25, 25, 7, 8, 0.2), (0, 22, 8, 10, 0.08),
]
height = np.zeros((H, W))
for pts, hw, pk in RANGES:
    dist = polyline_dist(pts)
    band = smoothstep(hw * 1.9, 0, dist)
    height = np.maximum(height, pk * band * (0.45 + 0.75 * n_ridge * (0.6 + 0.8 * n_mid)))
for clat, clon, rl, ro, hh in PLATEAUS:
    height = np.maximum(height, hh * ellipse(clat, clon, rl, ro) * (0.7 + 0.5 * n_mid))
height += 0.12 * smoothstep(0, 900, d_in) * n_lo           # gentle continental relief
height += 0.06 * n_ridge * smoothstep(0, 200, d_in)
ice_sheet = land * np.maximum(smoothstep(-58, -66, LAT),
                              (LAT > 59.5) * (LON > -74) * (LON < -11) * smoothstep(0, 90, d_in)
                              * smoothstep(59.5, 61.5, LAT))
height = np.maximum(height, ice_sheet * 0.55 * smoothstep(0, 600, d_in))
height *= land
height = np.clip(height, 0, 1)

# ---------------------------------------------------------------- climate (stylised)
# moisture: Hadley/Ferrel circulation pattern, reduced by continentality
m_lat = (0.95 * np.exp(-(LAT / 11) ** 2)                                # ITCZ rain belt
         + 0.62 * np.exp(-((ALAT - 52) / 12) ** 2)                       # westerly storm tracks
         + 0.2)
m_lat -= 0.55 * np.exp(-((ALAT - 24) / 7) ** 2)                          # subtropical highs
moist = m_lat * (0.55 + 0.45 * np.exp(-d_in / 1400)) + 0.25 * (n_lo - 0.5)
DESERTS = [(23, 10, 9, 26, 1.0), (22, 47, 7, 10, 1.0), (27, 70.5, 3, 4, 0.8), (32, 57, 4, 6, 0.8),
           (40, 60, 3.5, 7, 0.8), (39, 83, 2.6, 7, 1.0), (43, 104, 4, 10, 0.8), (-25, 131, 8, 15, 0.9),
           (-24, 18, 6, 6, 0.7), (-23, -69.5, 6, 2.2, 1.0), (-45, -68.5, 6, 3.5, 0.6), (35, -115, 6, 5, 0.8),
           (29, -105, 3, 4, 0.6), (7, 46, 5, 5, 0.6), (47, 64, 5, 14, 0.5), (18, -1, 4, 12, 0.6),
           (25.5, 30, 4, 6, 0.9)]
WETS = [(-4, -62, 9, 16, 0.8), (0, 22, 6, 11, 0.7), (0, 112, 8, 16, 0.7), (12, -85, 6, 7, 0.5),
        (23, 88, 5, 6, 0.5), (27, 113, 6, 9, 0.5), (37, -83, 8, 11, 0.5), (50, 12, 8, 16, 0.4),
        (60, 100, 8, 40, 0.3), (58, -100, 8, 30, 0.3), (-18, 47, 6, 3, 0.4), (8, -8, 3, 7, 0.4),
        (-28, -52, 6, 6, 0.4), (-40, -73, 6, 2, 0.4), (48, -123, 5, 3, 0.5)]
for clat, clon, rl, ro, k in DESERTS:
    moist -= 0.9 * k * ellipse(clat, clon, rl, ro)
for clat, clon, rl, ro, k in WETS:
    moist += 0.7 * k * ellipse(clat, clon, rl, ro)
moist += 0.35 * (n_mid - 0.5) + 0.2 * (n_hi - 0.5)
moist = np.clip(moist, 0, 1.2)
temp = 1 - smoothstep(10, 75, ALAT + 18 * height - 6 * (n_mid - 0.5))   # 1 hot .. 0 cold

# ---------------------------------------------------------------- land colour
def C(*rgb):
    return np.array(rgb, dtype=np.float64) / 255.0

desert_a = C(214, 180, 128)
desert_b = C(186, 120, 72)       # red sands (Sahara ergs, Australia)
steppe = C(150, 138, 92)
savanna = C(118, 112, 60)
grass = C(88, 104, 50)
forest_t = C(44, 72, 34)
rainforest = C(24, 56, 22)
boreal = C(30, 50, 34)
tundra = C(104, 98, 80)
rock = C(118, 104, 88)
snow = C(236, 241, 247)

def mix(a, b, t):
    t = t[..., None] if np.ndim(t) == 2 else t
    return a * (1 - t) + b * t

# hot branch: desert -> savanna -> rainforest
red = smoothstep(0.35, 0.75, n_mid) * (ellipse(23, 10, 9, 26) + ellipse(-25, 131, 8, 15)).clip(0, 1)
des = mix(np.broadcast_to(desert_a, (H, W, 3)), desert_b, 0.75 * red)
hot = mix(des, savanna, smoothstep(0.12, 0.42, moist))
hot = mix(hot, rainforest, smoothstep(0.55, 0.95, moist))
# mild branch: steppe -> grass -> temperate forest
mild = mix(np.broadcast_to(steppe, (H, W, 3)), grass, smoothstep(0.2, 0.45, moist))
mild = mix(mild, forest_t, smoothstep(0.45, 0.75, moist))
# cold branch: tundra / boreal
cold = mix(np.broadcast_to(tundra, (H, W, 3)), boreal, smoothstep(0.3, 0.6, moist) * smoothstep(0.08, 0.2, temp))
col = mix(cold, mild, smoothstep(0.25, 0.45, temp))
col = mix(col, hot, smoothstep(0.55, 0.8, temp))
# mountains: rock then snow caps
col = mix(col, rock, smoothstep(0.35, 0.75, height) * 0.8)
snowline = smoothstep(0.8, 1.0, height + 0.3 * (1 - temp) - 0.15 * n_hi)
col = mix(col, snow, snowline * 0.8)
# fine texture
col *= (0.82 + 0.36 * n_hi[..., None]) * (0.9 + 0.2 * n_mid[..., None])
# ice
ice = np.clip(np.maximum(ice_sheet, land * smoothstep(74, 80, LAT) * 0.9), 0, 1)
sea_ice = (1 - land) * np.clip(smoothstep(79, 84, LAT) * (0.75 + 0.3 * (n_mid - 0.5)) +
                               smoothstep(-68.5, -72, LAT) * smoothstep(0, 250, 400 - d_out) * 0.8, 0, 1)
ice_all = np.clip(ice + sea_ice, 0, 1)
col = mix(col, snow * (0.93 + 0.07 * n_hi[..., None]), ice)

# ocean: deep navy, shelves turquoise-ish, slight noise
deep = C(6, 22, 52)
mid = C(10, 40, 82)
shelf = C(22, 86, 118)
oc = mix(np.broadcast_to(deep, (H, W, 3)), mid, smoothstep(900, 60, d_out) * 0.55)
oc = mix(oc, shelf, smoothstep(160, 10, d_out) * (0.5 + 0.5 * n_mid) * smoothstep(60, 20, ALAT))
oc *= (0.97 + 0.06 * n_mid[..., None])
oc = mix(oc, snow * 0.92, sea_ice)
albedo = mix(oc, col, land)

# ---------------------------------------------------------------- night lights (stylised)
METROS = [  # lat, lon, weight (roughly metro population, millions)
    (35.7, 139.7, 37), (28.6, 77.2, 32), (31.2, 121.5, 28), (23.8, 90.4, 22), (-23.5, -46.6, 22),
    (19.4, -99.1, 22), (30.0, 31.2, 21), (39.9, 116.4, 21), (19.1, 72.9, 21), (34.7, 135.5, 19),
    (29.6, 106.5, 16), (22.6, 88.4, 15), (24.9, 67.0, 16), (41.0, 29.0, 15), (-34.6, -58.4, 15),
    (6.5, 3.4, 15), (40.7, -74.0, 19), (14.6, 121.0, 14), (-22.9, -43.2, 13), (39.1, 117.2, 13),
    (23.1, 113.3, 14), (22.5, 114.1, 13), (12.97, 77.6, 13), (-4.3, 15.3, 15), (34.05, -118.25, 13),
    (55.75, 37.6, 12.6), (48.85, 2.35, 11), (13.1, 80.3, 11), (-6.2, 106.8, 11), (-12.05, -77.0, 11),
    (51.5, -0.1, 9.5), (4.7, -74.1, 11), (13.75, 100.5, 11), (17.4, 78.5, 10), (37.55, 127.0, 10),
    (35.7, 51.4, 9.5), (41.9, -87.6, 9), (30.6, 114.3, 9), (32.1, 118.8, 9), (22.3, 114.2, 7.5),
    (3.1, 101.7, 8), (-8.8, 13.2, 9), (23.0, 72.6, 8.5), (10.8, 106.7, 9), (21.0, 105.85, 8),
    (33.3, 44.4, 7.5), (24.7, 46.7, 7.5), (1.35, 103.8, 6), (43.65, -79.4, 6.5), (29.8, -95.4, 7.2),
    (32.8, -96.8, 7.8), (25.8, -80.2, 6.2), (38.9, -77.0, 6.3), (33.75, -84.4, 6.2), (39.95, -75.2, 6.2),
    (42.35, -71.05, 4.9), (37.8, -122.4, 6.8), (47.6, -122.3, 4), (33.45, -112.1, 5), (39.7, -105.0, 3),
    (44.95, -93.1, 3.7), (45.5, -73.6, 4.3), (49.3, -123.1, 2.6), (32.7, -117.2, 3.3), (36.2, -115.1, 2.3),
    (29.95, -90.1, 1.3), (35.15, -90.05, 1.3), (36.15, -86.8, 2), (39.1, -84.5, 2.2), (41.5, -81.7, 2),
    (42.3, -83.05, 4.3), (40.45, -80.0, 2.3), (38.6, -90.2, 2.8), (39.1, -94.6, 2.2), (35.2, -80.85, 2.7),
    (27.95, -82.45, 3.2), (28.55, -81.4, 2.7), (30.3, -97.75, 2.4), (29.4, -98.5, 2.6), (35.1, -106.6, 1),
    (45.5, -122.7, 2.5), (40.75, -111.9, 1.3), (38.6, -121.5, 2.4), (21.3, -157.8, 1),
    (20.7, -103.35, 5.3), (25.7, -100.3, 5.3), (19.0, -98.2, 3.2), (32.5, -117.0, 2.2), (31.7, -106.4, 2.7),
    (21.15, -86.85, 0.9), (23.1, -82.4, 2.1), (18.5, -69.9, 3.5), (18.45, -66.1, 2.4), (14.6, -90.5, 3),
    (10.5, -66.9, 3), (-0.2, -78.5, 2.8), (-2.2, -79.9, 3), (-33.45, -70.65, 6.9), (-15.8, -47.9, 4.7),
    (-19.9, -43.95, 6), (-25.4, -49.3, 3.6), (-30.0, -51.2, 4.3), (-8.05, -34.9, 4.1), (-12.97, -38.5, 4),
    (-3.7, -38.5, 4.1), (-31.4, -64.2, 1.6), (-34.9, -56.2, 1.8), (-16.5, -68.15, 1.9), (-3.1, -60.0, 2.2),
    (40.4, -3.7, 6.7), (41.4, 2.2, 5.6), (41.9, 12.5, 4.3), (45.45, 9.2, 5.3), (52.5, 13.4, 4.5),
    (53.55, 10.0, 3.3), (48.15, 11.6, 2.9), (50.1, 8.7, 2.7), (51.2, 6.8, 11), (52.35, 4.9, 3.4),
    (50.85, 4.35, 2.6), (48.2, 16.4, 2.9), (50.1, 14.4, 2.7), (52.2, 21.0, 3.1), (47.5, 19.05, 3.0),
    (44.4, 26.1, 2.3), (42.7, 23.3, 1.6), (37.95, 23.7, 3.6), (38.7, -9.15, 2.9), (53.5, -2.25, 2.8),
    (52.5, -1.9, 2.9), (55.85, -4.25, 1.8), (53.35, -6.25, 2), (59.3, 18.05, 2.4), (59.9, 10.75, 1.6),
    (55.7, 12.55, 2.1), (60.2, 24.95, 1.5), (59.95, 30.3, 5.5), (50.45, 30.5, 3.5), (53.9, 27.55, 2),
    (49.99, 36.23, 1.5), (56.85, 60.6, 1.5), (55.0, 82.9, 1.6), (56.3, 44.0, 1.3), (55.8, 49.1, 1.3),
    (53.2, 50.15, 1.2), (43.25, 76.9, 2), (41.3, 69.25, 2.6), (40.4, 49.85, 2.3), (41.7, 44.8, 1.2),
    (40.2, 44.5, 1.1), (39.95, 32.85, 5.3), (38.4, 27.15, 3), (36.2, 37.15, 2.1), (33.5, 36.3, 2.5),
    (33.9, 35.5, 2.4), (31.95, 35.9, 2.2), (32.1, 34.8, 4.2), (31.2, 29.9, 5.4), (29.4, 48.0, 3.2),
    (25.3, 51.5, 2.4), (25.2, 55.3, 3.5), (24.45, 54.4, 1.5), (23.6, 58.4, 1.6), (21.5, 39.2, 4.7),
    (36.3, 59.6, 3.3), (32.65, 51.65, 2.2), (29.6, 52.5, 1.9), (34.5, 69.2, 4.5), (33.7, 73.05, 2.2),
    (31.55, 74.35, 13), (30.2, 71.45, 2), (26.85, 80.95, 3.9), (25.6, 85.1, 2.4), (26.9, 75.8, 4),
    (22.7, 75.85, 3), (21.15, 79.1, 2.9), (18.5, 73.85, 7), (9.95, 76.3, 2.2), (11.0, 76.95, 2.4),
    (6.9, 79.85, 5.6), (27.7, 85.3, 1.5), (16.8, 96.15, 5.4), (11.55, 104.9, 2.2), (-6.9, 107.6, 2.6),
    (-7.25, 112.75, 3), (-7.8, 110.4, 1.5), (3.6, 98.7, 2.3), (-6.2, 106.9, 3), (14.6, 120.98, 6),
    (10.3, 123.9, 1.3), (22.6, 120.3, 2.8), (25.05, 121.55, 7), (24.15, 120.7, 2.8), (35.1, 129.05, 3.4),
    (35.85, 128.6, 2.4), (37.45, 126.7, 3), (39.0, 125.75, 3), (41.8, 123.4, 7.6), (45.75, 126.65, 6),
    (43.9, 125.3, 4.4), (38.9, 121.6, 4.4), (36.65, 117.0, 5), (36.1, 120.4, 6), (34.75, 113.65, 7),
    (34.25, 108.95, 8), (30.65, 104.05, 9.5), (25.05, 102.7, 4.8), (26.6, 106.7, 3.5), (28.2, 112.95, 5),
    (28.7, 115.9, 3.8), (26.05, 119.3, 4.3), (24.5, 118.1, 4), (30.3, 120.15, 8.2), (31.8, 117.25, 4.5),
    (22.8, 108.3, 4), (20.05, 110.35, 2), (36.05, 103.8, 3.2), (38.5, 106.25, 1.5), (43.8, 87.6, 3.8),
    (40.8, 111.65, 2.4), (37.85, 112.55, 4), (38.05, 114.5, 5), (32.0, 120.9, 3), (31.55, 120.3, 3.4),
    (43.05, 141.35, 2), (38.25, 140.9, 1.6), (35.2, 136.9, 9.5), (33.6, 130.4, 5.5), (34.4, 132.45, 1.4),
    (-33.9, 151.2, 5.3), (-37.8, 144.95, 5.1), (-27.5, 153.0, 2.6), (-31.95, 115.85, 2.1), (-34.9, 138.6, 1.4),
    (-36.85, 174.75, 1.7), (-43.5, 172.6, 0.4), (-41.3, 174.8, 0.4), (-35.3, 149.1, 0.5),
    (-26.2, 28.05, 10), (-33.9, 18.4, 4.8), (-29.85, 31.0, 3.9), (-25.75, 28.2, 2.6), (-1.3, 36.8, 5),
    (-6.8, 39.3, 7.4), (9.0, 38.75, 5.2), (15.55, 32.55, 6), (5.6, -0.2, 2.6), (6.7, -1.6, 3.5),
    (5.35, -4.0, 5.5), (14.7, -17.45, 3.3), (12.65, -8.0, 2.8), (12.35, -1.5, 3), (13.5, 2.1, 1.4),
    (12.0, 8.5, 4.3), (9.05, 7.5, 3.6), (7.4, 3.9, 3.6), (4.05, 9.7, 3.9), (3.85, 11.5, 4.3),
    (0.3, 32.6, 3.8), (-1.95, 30.05, 1.2), (-17.8, 31.05, 1.6), (-15.4, 28.3, 3), (-18.9, 47.5, 3.6),
    (-25.95, 32.6, 1.8), (33.6, -7.6, 3.8), (34.0, -6.85, 1.9), (36.75, 3.05, 2.8), (36.8, 10.2, 2.4),
    (32.9, 13.2, 1.2), (21.45, 39.8, 2.1), (15.35, 44.2, 3.3), (12.8, 45.0, 1), (2.05, 45.35, 2.6),
    (64.15, -21.95, 0.25), (61.2, -149.9, 0.4), (-51.7, -57.85, 0.02), (-54.8, -68.3, 0.08),
]
REGIONS = [  # lat, lon, r_lat, r_lon, density (populated plains get a speckle of towns)
    (50, 9, 8, 14, 1.0), (45, 13, 4, 10, 0.8), (52, -1.5, 3.5, 3, 0.9), (41, -4, 4, 5, 0.5),
    (26, 82, 6, 9, 1.0), (19, 77, 8, 6, 0.7), (11, 78, 3, 3, 0.7), (32, 114, 8, 9, 1.0), (24, 112, 4, 7, 0.8),
    (37, 138, 3, 5, 1.0), (36.5, 127.8, 2, 2, 0.9), (40, -80, 5, 9, 0.9), (35, -88, 6, 9, 0.6),
    (31, -97, 4, 4, 0.5), (36, -119, 3, 2.5, 0.6), (30.5, 31.1, 3.5, 0.9, 0.9), (-7.3, 110, 1.5, 5, 0.9),
    (20, -100, 3, 4, 0.6), (-23, -46, 4, 5, 0.6), (8, 5, 4, 5, 0.5), (55, 38, 4, 12, 0.35),
    (33.5, 72.5, 3, 3, 0.8), (15, 105, 5, 3, 0.4), (-33, 150.5, 3, 2, 0.4), (-28, 28, 3, 3, 0.4),
    (45, 25, 3, 5, 0.4), (51, 19, 3, 5, 0.6), (48.5, 0, 3, 5, 0.6), (39, 117, 4, 4, 0.9), (22.5, 72, 3, 3, 0.7),
    (37.5, 36, 3, 6, 0.5), (29, 50, 6, 8, 0.3), (-34, -60, 3, 4, 0.4), (4.5, -74.5, 3, 2, 0.4),
]
speck = np.clip((fbm(0.6, 7) - 0.52) * 7, 0, 1) ** 1.5
speck_at = lambda ys, xs: speck[np.ix_(ys, xs)]
lights = np.zeros((H, W))
k = 180.0 / H  # deg per pixel
for clat, clon, w in METROS:
    r = 0.1 + 0.03 * np.sqrt(w)                                   # glow radius, deg
    sig = r
    rr = int(4 * sig / k) + 2
    r0, c0 = int((90 - clat) / k), int((clon + 180) / (360 / W))
    ys = np.arange(r0 - rr, r0 + rr + 1)
    xs = np.arange(c0 - int(rr / max(np.cos(np.radians(clat)), 0.2)), c0 + int(rr / max(np.cos(np.radians(clat)), 0.2)) + 1)
    ys = ys[(ys >= 0) & (ys < H)]
    dy = (LAT[ys, 0][:, None] - clat)
    dx = (((lon[xs % W] - clon + 180) % 360) - 180)[None, :] * np.cos(np.radians(clat))
    g = np.exp(-(dx * dx + dy * dy) / (2 * sig * sig)) * (0.35 + 0.22 * np.sqrt(w))
    g += np.exp(-(dx * dx + dy * dy) / (2 * (3 * sig) ** 2)) * 0.08 * np.sqrt(w) * speck_at(ys, xs % W)
    lights[np.ix_(ys, xs % W)] += g
dens = np.zeros((H, W))
for clat, clon, rl, ro, dd in REGIONS:
    dens += dd * ellipse(clat, clon, rl, ro)
coastal = 0.25 * np.exp(-d_in / 120) * smoothstep(65, 20, ALAT) * (1 - smoothstep(0.5, 0.9, ellipse(23, 10, 9, 26) + ellipse(-25, 131, 8, 15) + ellipse(22, 47, 7, 10)))
lights += (np.clip(dens, 0, 1.2) + coastal) * speck * 0.9
lights *= land * (1 - ice)
lights = np.clip(1 - np.exp(-1.6 * lights), 0, 1) ** 0.9

# ---------------------------------------------------------------- normals from height
hs = ndimage.gaussian_filter(height, 1.0, mode=("nearest", "wrap"))
gx = (np.roll(hs, -1, 1) - np.roll(hs, 1, 1)) / (2 * np.maximum(COSL, 0.15))
gy = (np.roll(hs, 1, 0) - np.roll(hs, -1, 0)) / 2                  # +north
s = 14.0
nrm = np.stack([0.5 + np.clip(gx * s, -0.5, 0.5), 0.5 + np.clip(gy * s, -0.5, 0.5), ice_all], -1)

# ---------------------------------------------------------------- clouds (stylised, periodic)
base = 0.62 * fbm(2.8, 11) + 0.38 * fbm(2.0, 12)
detail = fbm(1.7, 13)
Yp, Xp = np.mgrid[0:H, 0:W].astype(np.float64)
wy = (fbm(3.3, 14) - 0.5) * 110
wx = (fbm(3.3, 15) - 0.5) * 220
CYCLONES = [  # lat, lon, radius deg, twist (rad); Coriolis: anticlockwise in the north on this map
    (50, -38, 11, 3.2), (57, -165, 12, 3.0), (44, 168, 10, 2.8), (62, -8, 9, 2.6), (47, -135, 8, 2.4),
    (52, 95, 9, 1.8), (-52, -105, 12, -3.2), (-56, 18, 12, -3.0), (-49, 118, 11, -3.0), (-58, -35, 10, -2.6),
    (-46, 162, 9, -2.6), (-62, 70, 10, -2.4), (18, 132, 4.5, 4.5), (24, -62, 4, 4.2), (-16, 62, 3.5, -3.8),
]
for clat, clon, rad, tw in CYCLONES:
    cy, cx = (90 - clat) * H / 180, (clon + 180) * W / 360
    dx = (Xp - cx + W / 2) % W - W / 2
    dy = Yp - cy
    rpx = rad * H / 180
    ang = tw * np.exp(-(dx * dx + dy * dy) / (rpx * rpx))
    ca, sa = np.cos(ang), np.sin(ang)
    wx += (ca * dx - sa * dy) - dx
    wy += (sa * dx + ca * dy) - dy
field = ndimage.map_coordinates(base, [np.clip(Yp + wy, 0, H - 1), (Xp + wx) % W], order=1, mode="wrap")
field = 0.5 + (field - field.mean()) / field.std() * 0.18
cover = (0.5 * np.exp(-((LAT - 5) / 7) ** 2)                          # Intertropical Convergence Zone
         + 0.6 * np.exp(-((ALAT - 55) / 12) ** 2)                     # mid-latitude storm tracks
         + 0.18 - 0.3 * np.exp(-((ALAT - 23) / 8) ** 2)               # subtropical clear skies
         + 0.2 * smoothstep(55, 65, ALAT) * (LAT < 0))                # Southern Ocean
t0 = 0.71 - 0.34 * cover
cl = smoothstep(t0, t0 + 0.2, field)
cl = np.maximum(cl, 0.3 * smoothstep(t0 - 0.12, t0 + 0.05, field))    # thin haze around the decks
cl = np.clip(cl * (0.7 + 0.6 * detail), 0, 1)
cl *= 1 - 0.35 * land * (np.clip(sum(k * ellipse(la, lo, rl, ro) for la, lo, rl, ro, k in DESERTS), 0, 1))

# ---------------------------------------------------------------- write
OUT.mkdir(parents=True, exist_ok=True)
def u8(a):
    return (np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)
Image.fromarray(u8(albedo ** (1 / 1.0))).save(OUT / "earth-albedo.jpg", quality=90, optimize=True, progressive=True)
Image.fromarray(np.stack([u8(land), u8(lights), u8(height)], -1)).save(OUT / "earth-data.png", optimize=True)
Image.fromarray(u8(nrm)).save(OUT / "earth-normal.jpg", quality=92, optimize=True)
Image.fromarray(u8(cl)).save(OUT / "earth-clouds.jpg", quality=88, optimize=True, progressive=True)
for f in sorted(OUT.iterdir()):
    print(f"{f.name:20s} {f.stat().st_size / 1024:7.0f} KB")
