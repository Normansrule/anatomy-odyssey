r"""Ray tracing a Schwarzschild black hole with a glowing thin accretion disk.

The physics in plain language
-----------------------------
Near a black hole of mass M, light does not travel in straight lines.  In
Schwarzschild's (1916) solution of general relativity a light ray stays in a
plane through the centre, and its path r(phi) obeys a remarkably simple
equation for u = 1/r (units G = c = 1, lengths in M):

    d^2u/dphi^2 + u = 3 M u^2                                   (photon orbit equation)

Without the right-hand side this is a straight line.  The 3Mu^2 term is pure
general relativity.  Integrating once gives (du/dphi)^2 = 1/b^2 - u^2 + 2 M u^3
where b is the ray's *impact parameter* (how far off-centre it was aimed).

Key numbers that fall out:

* **Event horizon** r = 2M: nothing escapes from inside.
* **Photon sphere** r = 3M: light can orbit the hole on an (unstable) circle,
  because u = 1/(3M) makes the right-hand side balance exactly.
* **Shadow edge** b_c = 3 sqrt(3) M ~ 5.196 M: rays aimed closer than b_c are
  captured, so the black hole looks ~2.6x bigger than its horizon.
* **Weak lensing**: far away, the deflection angle is ~4M/b (Einstein 1915).

**Ray tracing, backwards.**  We shoot one ray per pixel from the camera.  All
rays with the same b follow the same curve r(phi) (only the plane differs), so
we integrate the orbit equation *once* for ~1,800 impact parameters (densely
packed near b_c) with 4th-order Runge-Kutta and store u(b, phi) in a table.
Each pixel then only needs a table lookup at the angles phi where its plane
meets the disk plane: phi_0, phi_0 + pi, phi_0 + 2 pi, ...  The first crossing
gives the *primary* image, the next ones the *secondary* and higher-order
images - the thin bright rings hugging the shadow.

**The disk.**  Gas orbits on circular geodesics outside the innermost stable
circular orbit (ISCO) at r = 6M.  The Novikov-Thorne (1973) relativistic
thin-disk model, in the closed form of Page & Thorne (1974), gives the emitted
flux (x = sqrt(r/M))

    F(r) = 3 Mdot / (8 pi M^2) * B(x) / (x^4 (x^3 - 3x))
    B(x) = x - sqrt6 - (sqrt3/2) ln[(x - sqrt3)/(sqrt6 - sqrt3)] + (sqrt3/2) ln[(x + sqrt3)/(sqrt6 + sqrt3)]

and each ring glows as a blackbody at T(r) = (F / sigma)^(1/4)  (the
Shakura-Sunyaev picture: local viscous heating radiated locally).  Far from
the hole this becomes the classic T ~ r^(-3/4).

**What the camera sees.**  Two effects colour and brighten the light:

    g = nu_obs / nu_emit = sqrt(1 - 3M/r) / (1 - Omega * lambda) / sqrt(1 - 2M/r_cam)

with Omega = sqrt(M/r^3) the orbital angular velocity and lambda the photon's
angular momentum about the disk axis.  The numerator is gravitational redshift
plus time dilation of the moving gas; the denominator is the Doppler shift.
Because I_nu / nu^3 is conserved along a ray (Liouville), the observed
bolometric intensity is I_obs = g^4 I_emit and the colour temperature is g T.
The side of the disk coming toward us is brighter and bluer (Doppler beaming).

Artistic choices (clearly separable from the physics): the disk's colour
temperature scale ``--tmax`` is chosen so it glows in visible light, the
optional ``--streaks`` texture imitates turbulence (set 0 for a pure
Novikov-Thorne disk), the star field is procedural, and a filmic tone curve
plus bloom map the huge brightness range onto a screen.

References
----------
* K. Schwarzschild (1916); S. Chandrasekhar, *The Mathematical Theory of Black Holes* (1983), ch. 3.
* J.-P. Luminet (1979), A&A 75, 228 - the first image of a black hole with a thin disk.
* I. Novikov & K. Thorne (1973); D. Page & K. Thorne (1974), ApJ 191, 499.
* N. Shakura & R. Sunyaev (1973), A&A 24, 337.
* O. James, E. von Tunzelmann, P. Franklin, K. Thorne (2015), Class. Quantum Grav. 32, 065001.
"""

from __future__ import annotations

if __package__ in (None, ""):  # allow `python simulations/cosmic/black_hole_raytracer.py`
    import pathlib
    import sys

    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import time
from dataclasses import dataclass

import numpy as np

B_CRIT = 3.0 * np.sqrt(3.0)   # critical impact parameter [M]
R_PHOTON = 3.0                # photon sphere [M]
R_HORIZON = 2.0               # event horizon [M]
R_ISCO = 6.0                  # innermost stable circular orbit [M]


# ---------------------------------------------------------------------------
# geodesics
# ---------------------------------------------------------------------------
def _rhs(u, du):
    return du, 3.0 * u * u - u


def integrate_rays(b, u0, phi_max, dphi, store=True):
    """Integrate u'' = 3u^2 - u for many impact parameters at once (RK4 in phi).

    Starts at u = u0 moving inward.  Returns (u_table [nb, nphi] float32 or None,
    phi_escape [nb] (NaN if captured), u_min [nb]).  Captured rays are frozen at
    u = 0.5 (horizon), escaped rays at u = 0.
    """
    b = np.asarray(b, dtype=float)
    n = int(np.ceil(phi_max / dphi)) + 1
    u = np.full(b.shape, float(u0))
    du = np.sqrt(np.maximum(1.0 / b**2 - u0**2 + 2.0 * u0**3, 0.0))
    table = np.empty((b.size, n), dtype=np.float32) if store else None
    alive = np.ones(b.shape, bool)
    captured = np.zeros(b.shape, bool)
    phi_esc = np.full(b.shape, np.nan)
    u_min = np.full(b.shape, np.inf)
    h = dphi
    for i in range(n):
        if store:
            table[:, i] = u
        if not alive.any():
            if store:
                table[:, i + 1:] = u[:, None]
            break
        a = alive
        ua, dua = u[a], du[a]
        k1u, k1v = _rhs(ua, dua)
        k2u, k2v = _rhs(ua + 0.5 * h * k1u, dua + 0.5 * h * k1v)
        k3u, k3v = _rhs(ua + 0.5 * h * k2u, dua + 0.5 * h * k2v)
        k4u, k4v = _rhs(ua + h * k3u, dua + h * k3v)
        un = ua + h / 6 * (k1u + 2 * k2u + 2 * k3u + k4u)
        dun = dua + h / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)
        # turning point bookkeeping (closest approach)
        idx = np.flatnonzero(a)
        u_min_cand = np.where(dun < 0, 1 / np.maximum(un, 1e-12), np.inf)
        u_min[idx] = np.minimum(u_min[idx], u_min_cand)
        cap = un >= 0.5
        esc = un <= 0.0
        # interpolate the escape angle where u crosses zero
        if esc.any():
            frac = ua[esc] / (ua[esc] - un[esc])
            phi_esc[idx[esc]] = (i + frac) * h
        un = np.where(cap, 0.5, np.where(esc, 0.0, un))
        u[idx] = un
        du[idx] = dun
        captured[idx[cap]] = True
        alive[idx[cap | esc]] = False
    # periapsis r_min: max u reached for escaping rays
    return table, phi_esc, captured


def critical_impact_parameter(lo=5.0, hi=5.4, n=801, rounds=2):
    """Locate the capture/escape boundary b_c numerically (vectorised scan, refined twice).

    Rays start far away (u0 ~ 0).  Analytic answer: 3 sqrt(3) M = 5.19615...
    """
    for _ in range(rounds):
        b = np.linspace(lo, hi, n)
        _, _, cap = integrate_rays(b, 1e-6, 8 * np.pi, 2e-3, store=False)
        k = int(np.argmin(cap))            # first escaping ray (captured rays come first)
        lo, hi = b[max(k - 1, 0)], b[k]
    return 0.5 * (lo + hi)


def closest_approach(b, dphi=1e-3):
    """Periapsis radius [M] of a ray with impact parameter b > b_c coming from infinity."""
    b = float(b)
    u0 = 1e-7
    u, du = u0, np.sqrt(1 / b**2 - u0**2 + 2 * u0**3)
    umax = u
    for _ in range(int(20 * np.pi / dphi)):
        k1u, k1v = _rhs(u, du)
        k2u, k2v = _rhs(u + 0.5 * dphi * k1u, du + 0.5 * dphi * k1v)
        k3u, k3v = _rhs(u + 0.5 * dphi * k2u, du + 0.5 * dphi * k2v)
        k4u, k4v = _rhs(u + dphi * k3u, du + dphi * k3v)
        u += dphi / 6 * (k1u + 2 * k2u + 2 * k3u + k4u)
        du += dphi / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)
        umax = max(umax, u)
        if du < 0 or u >= 0.5:
            break
    return 1.0 / umax


def deflection_angle(b, dphi=2e-4):
    """Total bending angle [rad] of a ray from infinity with impact parameter b (NaN if captured)."""
    _, phi_esc, cap = integrate_rays(np.atleast_1d(np.asarray(b, float)), 1e-9, 12 * np.pi, dphi, store=False)
    return np.where(cap, np.nan, phi_esc - np.pi)


# ---------------------------------------------------------------------------
# disk
# ---------------------------------------------------------------------------
def novikov_thorne_flux(r):
    """Page-Thorne flux profile for a Schwarzschild thin disk (arbitrary units, zero inside ISCO)."""
    r = np.asarray(r, dtype=float)
    x = np.sqrt(np.maximum(r, R_ISCO))
    s3, s6 = np.sqrt(3.0), np.sqrt(6.0)
    B = (x - s6 - 0.5 * s3 * np.log((x - s3) / (s6 - s3)) + 0.5 * s3 * np.log((x + s3) / (s6 + s3)))
    F = 3.0 / (8.0 * np.pi) * B / (x**4 * (x**3 - 3.0 * x))
    return np.where(r > R_ISCO, np.maximum(F, 0.0), 0.0)


_R_FINE = np.linspace(R_ISCO, 60, 20000)
F_MAX = float(novikov_thorne_flux(_R_FINE).max())
R_FMAX = float(_R_FINE[np.argmax(novikov_thorne_flux(_R_FINE))])


def disk_temperature(r, t_max):
    """T(r) = T_max (F / F_max)^(1/4)."""
    return t_max * (novikov_thorne_flux(r) / F_MAX) ** 0.25


def redshift_factor(r, lam, r_obs):
    """g = nu_obs/nu_emit for gas on circular geodesics, photon z-angular momentum lam, static camera at r_obs."""
    omega = r ** -1.5
    return np.sqrt(np.maximum(1 - 3.0 / r, 1e-9)) / (1.0 - omega * lam) / np.sqrt(1 - 2.0 / r_obs)


# ---------------------------------------------------------------------------
# scene
# ---------------------------------------------------------------------------
@dataclass
class Scene:
    width: int = 800
    height: int = 450
    supersample: int = 2
    r_obs: float = 50.0            # camera distance [M]
    inclination: float = 84.0      # degrees from the disk axis (90 = edge-on)
    fov: float = 42.0              # horizontal field of view [deg]
    r_in: float = R_ISCO
    r_out: float = 22.0
    t_max: float = 4500.0          # colour temperature at the flux peak [K] (artistic scale)
    exposure: float = 0.4
    streaks: float = 0.25          # 0 = pure Novikov-Thorne disk
    time: float = 0.0              # for animation: disk texture rotates with Omega(r)
    stars: bool = True
    bloom: float = 0.22
    seed: int = 3


def _impact_grid(b_max):
    near = np.logspace(-9, np.log10(0.6), 500)
    b = np.concatenate([
        np.linspace(1e-3, B_CRIT - 0.6, 260),
        B_CRIT - near[::-1],
        B_CRIT + near,
        np.linspace(B_CRIT + 0.6, max(b_max, B_CRIT + 1.0) * 1.001, 600),
    ])
    return np.unique(b)


class Tracer:
    """Pre-computes the geodesic table for a camera distance and renders frames."""

    def __init__(self, scene: Scene):
        self.s = scene
        self._build_rays()
        self._build_table()
        self._geometry()

    # camera and per-pixel ray planes ------------------------------------------------
    def _build_rays(self):
        s = self.s
        W, H = s.width * s.supersample, s.height * s.supersample
        inc = np.radians(s.inclination)
        c = np.array([np.sin(inc), 0.0, np.cos(inc)])            # camera position unit vector
        f = -c
        up0 = np.array([0.0, 0.0, 1.0])
        up = up0 - np.dot(up0, f) * f
        up /= np.linalg.norm(up)
        right = np.cross(f, up)
        tan_h = np.tan(np.radians(s.fov) / 2)
        xs = (np.arange(W) + 0.5) / W * 2 - 1
        ys = ((np.arange(H) + 0.5) / H * 2 - 1) * H / W
        X, Y = np.meshgrid(xs * tan_h, -ys * tan_h)
        d = f[None, None, :] + X[..., None] * right + Y[..., None] * up
        d /= np.linalg.norm(d, axis=-1, keepdims=True)
        cos_a = np.clip(d @ f, -1, 1)
        sin_a = np.sqrt(1 - cos_a**2)
        self.b = s.r_obs * sin_a / np.sqrt(1 - 2 / s.r_obs)        # static observer aberration
        e2 = d - (d @ c)[..., None] * c
        nrm = np.linalg.norm(e2, axis=-1, keepdims=True)
        e2 = np.where(nrm > 1e-12, e2 / np.maximum(nrm, 1e-12), up)
        self.e1 = c
        self.e2 = e2
        self.n = np.cross(np.broadcast_to(c, e2.shape), e2)        # traced angular-momentum direction
        self.shape = (H, W)

    def _build_table(self):
        s = self.s
        self.bgrid = _impact_grid(self.b.max())
        self.dphi = 2.5e-3
        self.phi_max = 3.0 * np.pi + 0.2
        t0 = time.perf_counter()
        self.table, self.phi_esc, self.captured = integrate_rays(self.bgrid, 1.0 / s.r_obs, self.phi_max, self.dphi)
        self.t_table = time.perf_counter() - t0

    def _lookup(self, phi, ib, wb):
        j = phi / self.dphi
        j0 = np.clip(np.floor(j).astype(np.int64), 0, self.table.shape[1] - 2)
        wj = np.clip(j - j0, 0, 1)
        T = self.table
        u00, u01 = T[ib, j0], T[ib, j0 + 1]
        u10, u11 = T[ib + 1, j0], T[ib + 1, j0 + 1]
        u_lo = u00 + (u01 - u00) * wj
        u_hi = u10 + (u11 - u10) * wj
        u = u_lo + (u_hi - u_lo) * wb
        # never blend a captured ray with an escaping one (that would invent fake disk radii)
        umax = np.maximum(np.maximum(u00, u01), np.maximum(u10, u11))
        umin = np.minimum(np.minimum(u00, u01), np.minimum(u10, u11))
        u = np.where(umax >= 0.4999, 0.5, u)
        return np.where((umin <= 0.0) & (umax < 0.4999), 0.0, u)

    def _geometry(self):
        """Find disk crossings (radius, azimuth, redshift) for up to three image orders."""
        s = self.s
        b = self.b.ravel()
        ib = np.clip(np.searchsorted(self.bgrid, b) - 1, 0, len(self.bgrid) - 2)
        wb = np.clip((b - self.bgrid[ib]) / (self.bgrid[ib + 1] - self.bgrid[ib]), 0, 1)
        e1 = self.e1
        e2 = self.e2.reshape(-1, 3)
        A = e1[2]
        Bz = e2[:, 2]
        phi0 = np.mod(np.arctan2(-A, Bz), np.pi)
        phi0 = np.where(phi0 < 1e-6, np.pi, phi0)
        lam = -b * self.n.reshape(-1, 3)[:, 2]                       # photon L_z (actual direction)
        self.hits = []
        for k in range(3):
            phi = phi0 + k * np.pi
            ok = phi < self.phi_max - self.dphi
            u = np.where(ok, self._lookup(np.minimum(phi, self.phi_max - 2 * self.dphi), ib, wb), 0.0)
            with np.errstate(divide="ignore"):
                r = np.where(u > 1e-6, 1.0 / u, np.inf)
            hit = (r >= s.r_in) & (r <= s.r_out)
            rh = np.where(hit, r, 0.0)
            P = rh[:, None] * (np.cos(phi)[:, None] * e1[None, :] + np.sin(phi)[:, None] * e2)
            psi = np.arctan2(P[:, 1], P[:, 0])
            g = np.where(hit, redshift_factor(np.where(hit, r, 10.0), lam, s.r_obs), 0.0)
            self.hits.append((hit, np.where(hit, r, 0.0), psi, g))
        # escape directions for the sky
        pe = np.interp(b, self.bgrid, np.nan_to_num(self.phi_esc, nan=-1.0))
        cap_near = np.interp(b, self.bgrid, self.captured.astype(float)) > 0.5
        self.escaped = (pe > 0) & ~cap_near
        dirs = np.cos(pe)[:, None] * e1[None, :] + np.sin(pe)[:, None] * e2
        self.sky_lon = np.arctan2(dirs[:, 1], dirs[:, 0])
        self.sky_lat = np.arcsin(np.clip(dirs[:, 2], -1, 1))

    # shading ----------------------------------------------------------------------
    def _streak_texture(self, r, psi, t):
        """Cosmetic turbulence: log-spiral bands sheared by differential rotation Omega(r)."""
        if self.s.streaks <= 0:
            return 1.0
        rng = np.random.default_rng(self.s.seed)
        ang = psi - r ** -1.5 * t
        lr = np.log(r)
        tex = np.zeros_like(r)
        for _ in range(9):
            m = rng.integers(1, 7)
            kr = rng.uniform(6, 26)
            ph = rng.uniform(0, 2 * np.pi)
            pitch = rng.uniform(1.5, 4.0)
            tex += np.sin(m * ang + kr * lr + pitch * m * lr + ph) / 9 ** 0.5
        fine = np.sin(60 * lr + 3 * ang + 1.3) * 0.35
        return np.clip(1 + self.s.streaks * (tex + fine), 0.25, None)

    def render(self, t=None):
        from cosmic.stellar import blackbody_rgb_table

        s = self.s
        t = s.time if t is None else t
        Ttab, RGBtab = blackbody_rgb_table(800, 80000, 700)
        logT = np.log(Ttab)
        npx = self.b.size
        color = np.zeros((npx, 3))
        trans = np.ones(npx)
        for k, (hit, r, psi, g) in enumerate(self.hits):
            if not hit.any():
                continue
            idx = np.flatnonzero(hit & (trans > 1e-3))
            rr, gg = r[idx], g[idx]
            T_em = disk_temperature(rr, s.t_max)
            T_obs = np.clip(gg * T_em, 800, 80000)
            ci = np.interp(np.log(T_obs), logT, np.arange(len(Ttab)))
            i0 = np.clip(ci.astype(int), 0, len(Ttab) - 2)
            w = (ci - i0)[:, None]
            rgb = RGBtab[i0] * (1 - w) + RGBtab[i0 + 1] * w
            I = gg**4 * novikov_thorne_flux(rr) / F_MAX * self._streak_texture(rr, psi[idx], t)
            # soft outer edge
            I *= np.clip((s.r_out - rr) / 3.0, 0, 1) ** 1.5
            alpha = 0.97 if k == 0 else 0.99
            color[idx] += (trans[idx] * alpha * I)[:, None] * rgb
            trans[idx] *= 1 - alpha
        if s.stars:
            sky = self._sky()
            color += (trans * self.escaped)[:, None] * sky
        img = color.reshape(self.shape + (3,)) * s.exposure
        return self._post(img)

    def _sky(self):
        if not hasattr(self, "_sky_cache"):
            d = np.stack([np.cos(self.sky_lat) * np.cos(self.sky_lon), np.cos(self.sky_lat) * np.sin(self.sky_lon),
                          np.sin(self.sky_lat)], axis=-1)
            # smooth diffuse band from a low-resolution map
            M = milky_way_map(seed=self.s.seed)
            Hs, Ws, _ = M.shape
            x = ((self.sky_lon / (2 * np.pi) + 0.5) * Ws).astype(int) % Ws
            y = np.clip(((0.5 - self.sky_lat / np.pi) * Hs).astype(int), 0, Hs - 1)
            px_per_rad = self.s.width * self.s.supersample / np.radians(self.s.fov)
            self._sky_cache = M[y, x] + hashed_stars(d, cells=int(px_per_rad * np.pi / 2 / 3), seed=self.s.seed)
        return self._sky_cache

    def _post(self, img):
        from scipy.ndimage import gaussian_filter

        s = self.s
        ss = s.supersample
        if ss > 1:
            H, W, _ = img.shape
            img = img.reshape(H // ss, ss, W // ss, ss, 3).mean(axis=(1, 3))
        if s.bloom > 0:
            lum = img.mean(axis=-1, keepdims=True)
            bright = img * np.clip((lum - 0.6) / 1.5, 0, 1)
            sc = img.shape[1] / 800
            glow = sum(gaussian_filter(bright, sigma=(sg * sc, sg * sc, 0)) * wgt
                       for sg, wgt in [(2.0, 0.5), (8.0, 0.35), (24.0, 0.25)])
            img = img + s.bloom * glow
        # ACES filmic tone mapping (Narkowicz 2015 fit) then sRGB encoding
        a, b_, c, d, e = 2.51, 0.03, 2.43, 0.59, 0.14
        x = np.maximum(img, 0)
        mapped = np.clip((x * (a * x + b_)) / (x * (c * x + d) + e), 0, 1)
        from cosmic.stellar import srgb_gamma

        return (srgb_gamma(mapped) * 255 + 0.5).astype(np.uint8)


def milky_way_map(width=1024, height=512, seed=3):
    """Low-resolution equirectangular map of a faint, mottled galactic band (decorative)."""
    from scipy.ndimage import gaussian_filter

    rng = np.random.default_rng(seed)
    lon = np.linspace(-np.pi, np.pi, width, endpoint=False)
    lat = np.linspace(np.pi / 2, -np.pi / 2, height)
    LON, LAT = np.meshgrid(lon, lat)
    tilt = np.radians(35)
    band_lat = np.arcsin(np.clip(np.sin(LAT) * np.cos(tilt) - np.cos(LAT) * np.sin(LON) * np.sin(tilt), -1, 1))
    noise = gaussian_filter(rng.normal(size=(height, width)), 3, mode="wrap")
    noise = (noise - noise.mean()) / noise.std()
    band = np.exp(-(band_lat / 0.16) ** 2) * np.clip(1 + 0.8 * noise, 0, None)
    return band[..., None] * np.array([0.006, 0.005, 0.008])


def _hash_u01(*ints):
    """Deterministic integer hash -> uniform [0, 1) (SplitMix64-style mixing, vectorised)."""
    h = np.uint64(0x9E3779B97F4A7C15)
    with np.errstate(over="ignore"):
        for v in ints:
            h = h ^ (np.asarray(v).astype(np.uint64) + np.uint64(0x9E3779B97F4A7C15))
            h = (h ^ (h >> np.uint64(30))) * np.uint64(0xBF58476D1CE4E5B9)
            h = (h ^ (h >> np.uint64(27))) * np.uint64(0x94D049BB133111EB)
            h = h ^ (h >> np.uint64(31))
    return (h >> np.uint64(11)).astype(np.float64) / float(1 << 53)


def hashed_stars(d, cells=1024, density=0.012, seed=3):
    """Procedural point stars on a cube map: crisp at any lens magnification.

    Each cube-face cell holds at most one star (probability ``density``) at a random position, with a
    power-law brightness and a blackbody colour.  Lensing stretches stars into arcs near the shadow.
    """
    from cosmic.stellar import blackbody_rgb

    ax = np.argmax(np.abs(d), axis=-1)
    sgn = np.sign(d[np.arange(len(d)), ax])
    face = ax * 2 + (sgn > 0)
    major = np.abs(d[np.arange(len(d)), ax])
    uv = np.empty((len(d), 2))
    others = np.array([[1, 2], [0, 2], [0, 1]])[ax]
    uv[:, 0] = d[np.arange(len(d)), others[:, 0]] / major
    uv[:, 1] = d[np.arange(len(d)), others[:, 1]] / major
    g = (uv + 1) / 2 * cells
    ij = np.floor(g).astype(np.int64)
    f = g - ij
    out = np.zeros((len(d), 3))
    for di in (-1, 0, 1):          # check the 3x3 neighbourhood so stars near cell edges are not clipped
        for dj in (-1, 0, 1):
            ci, cj = ij[:, 0] + di, ij[:, 1] + dj
            exists = _hash_u01(face, ci, cj, seed) < density
            if not exists.any():
                continue
            k = np.flatnonzero(exists)
            sx = _hash_u01(face[k], ci[k], cj[k], seed + 1)
            sy = _hash_u01(face[k], ci[k], cj[k], seed + 2)
            dx = (f[k, 0] - di) - sx
            dy = (f[k, 1] - dj) - sy
            r2 = dx * dx + dy * dy
            bright = 0.06 + 4.0 * (1 - _hash_u01(face[k], ci[k], cj[k], seed + 3)) ** 6
            T = 10 ** (3.5 + 0.8 * _hash_u01(face[k], ci[k], cj[k], seed + 4) ** 1.6)
            psf = np.exp(-r2 / (2 * 0.14**2))
            out[k] += (bright * psf)[:, None] * blackbody_rgb(T)
    return out


def render_black_hole(scene: Scene | None = None, outdir=None, showcase=False, annotate=True, name="black_hole.png"):
    """Render one frame and save it (optionally with a caption strip)."""
    from PIL import Image

    from cosmic import style

    scene = scene or Scene()
    t0 = time.perf_counter()
    tr = Tracer(scene)
    img = tr.render()
    dt = time.perf_counter() - t0
    print(f"rendered {scene.width}x{scene.height} (x{scene.supersample}^2 samples) in {dt:.1f} s "
          f"(geodesic table {tr.t_table:.1f} s, {len(tr.bgrid)} impact parameters)")
    pil = Image.fromarray(img)
    if annotate:
        pil = _caption(pil, scene)
    return style.save_image(pil, name, outdir=outdir, showcase=showcase), tr


def _caption(pil, scene):
    """Add a slim dark caption strip with title and the physics used."""
    import matplotlib.pyplot as plt

    from cosmic import style

    W, H = pil.size
    dpi = 100
    strip = int(H * 0.2)
    fig = plt.figure(figsize=(W / dpi, (H + strip) / dpi), dpi=dpi)
    ax = fig.add_axes([0, strip / (H + strip), 1, H / (H + strip)])
    ax.imshow(np.asarray(pil))
    ax.axis("off")
    fs = W / 800
    y0 = strip / (H + strip)
    fig.text(0.018, y0 * 0.80, "Schwarzschild black hole with a thin accretion disk", color="white",
             fontsize=10.5 * fs, fontweight="bold", va="center")
    fig.text(0.018, y0 * 0.36,
             "Every pixel's ray is traced backwards through  d²u/dφ² + u = 3Mu².\n"
             "The far side of the disk is lensed over and under the shadow; the thin ring is its secondary image.\n"
             "The left side moves toward us, so Doppler beaming (I ∝ g⁴) makes it brighter.",
             color=style.TEXT_2, fontsize=6.6 * fs, va="center", linespacing=1.55)
    fig.text(0.982, y0 * 0.80,
             f"Novikov–Thorne disk 6–{scene.r_out:g} M  ·  camera {scene.r_obs:g} M, {90 - scene.inclination:g}° above the disk",
             color=style.TEXT_2, fontsize=6.6 * fs, va="center", ha="right")
    fig.text(0.982, y0 * 0.22, "cosmic-codex · simulations/cosmic/black_hole_raytracer.py", color=style.MUTED,
             fontsize=6.0 * fs, va="center", ha="right")
    fig.patch.set_facecolor(style.BG)
    import io

    from PIL import Image

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, facecolor=style.BG)
    plt.close(fig)
    return Image.open(buf).convert("RGB")


def render_gif(scene: Scene | None = None, frames=36, outdir=None, showcase=False, name="black_hole_orbit.gif"):
    """Animated GIF: the disk's turbulent texture swirls with Keplerian differential rotation."""
    import imageio.v2 as imageio

    from cosmic import style

    scene = scene or Scene(width=480, height=270, supersample=2)
    tr = Tracer(scene)
    period = 2 * np.pi * 9.0 ** 1.5   # one orbit at r = 9 M
    imgs = [tr.render(t=period * i / frames) for i in range(frames)]
    path = style.outpath(name, outdir)
    imageio.mimsave(path, imgs, duration=1 / 15, loop=0)
    if showcase:
        style.MEDIA.mkdir(parents=True, exist_ok=True)
        (style.MEDIA / name).write_bytes(path.read_bytes())
    return path


def plot_geodesics(outdir=None, showcase=False):
    """Educational diagram: photon paths around the hole for a fan of impact parameters."""
    import matplotlib.pyplot as plt

    from cosmic import style

    fig = plt.figure(figsize=(12, 7.2))
    ax = fig.add_axes([0.02, 0.05, 0.6, 0.8])
    ax.set_aspect("equal")
    ax.axis("off")
    lim = 16
    ax.set_xlim(-lim * 1.25, lim * 0.95)
    ax.set_ylim(-lim * 0.75, lim * 0.95)
    style.starfield(ax, 200, extent=(-20, 16, -12, 16), alpha=0.4)
    bs = np.array([1.0, 2.2, 3.4, 4.4, 5.0, 5.18, 5.1962, 5.2, 5.22, 5.35, 5.8, 6.8, 8.2, 10.0, 12.5])
    u0 = 1e-4                                   # start far away: rays arrive parallel from +x at height b
    dph = 1e-3
    tab, pe, cap = integrate_rays(bs, u0, 5 * np.pi, dph)
    phi = np.arange(tab.shape[1]) * dph
    for k, b in enumerate(bs):
        u = tab[k].astype(float)
        end = (u >= 0.5) | (u <= 0)
        stop = np.argmax(end) if end.any() else len(u) - 1
        uu = np.maximum(u[: stop + 1], 1e-9)
        r = 1 / uu
        x, y = r * np.cos(phi[: stop + 1]), r * np.sin(phi[: stop + 1])
        m = (np.abs(x) < 60) & (np.abs(y) < 60)
        c = style.FLAME if b < B_CRIT - 1e-4 else (style.SOL if b < 5.3 else style.ICE)
        lw = 1.8 if abs(b - B_CRIT) < 0.05 else 1.25
        for sgn, al in ((1, 0.95), (-1, 0.2)):
            style.glow_line(ax, x[m], sgn * y[m], c, lw=lw, layers=2, alpha=al)
    th = np.linspace(0, 2 * np.pi, 400)
    ax.fill(2 * np.cos(th), 2 * np.sin(th), color="black", zorder=5)
    ax.plot(2 * np.cos(th), 2 * np.sin(th), color=style.MUTED, lw=0.8, zorder=6)
    ax.plot(3 * np.cos(th), 3 * np.sin(th), color=style.NEBULA, lw=1.1, ls="--", zorder=6)
    ax.plot(B_CRIT * np.cos(th), B_CRIT * np.sin(th), color=style.TEXT_2, lw=0.6, ls=":", zorder=6)
    ax.text(0, 0, "horizon\n2M", color=style.TEXT_2, ha="center", va="center", fontsize=8, zorder=7)
    ax.text(2.3, 2.6, "photon sphere 3M", color=style.NEBULA, fontsize=9, zorder=7)
    ax.text(-4.2, -5.7, "shadow radius b = 3√3 M", color=style.TEXT_2, fontsize=8.5, zorder=7, ha="center")
    ax.annotate("", (12.5, -10.5), (17, -10.5), arrowprops=dict(arrowstyle="-|>", color=style.TEXT_2))
    ax.text(14.7, -11.2, "parallel light arrives\nfrom the right", color=style.TEXT_2, fontsize=8.5, ha="center",
            va="top")

    ax2 = fig.add_axes([0.68, 0.16, 0.29, 0.6])
    bb = np.geomspace(5.3, 200, 160)
    dfl = deflection_angle(bb, 1e-3)
    ax2.loglog(bb, np.degrees(dfl), color=style.ICE, lw=2, label="exact (this code)")
    ax2.loglog(bb, np.degrees(4 / bb), color=style.SOL, lw=1.4, ls="--", label="weak field 4M/b")
    ax2.axvline(B_CRIT, color=style.FLAME, lw=0.8)
    ax2.text(B_CRIT * 1.08, 3, "b = 3√3 M", color=style.FLAME, fontsize=8.5, rotation=90)
    ax2.set_xlabel("impact parameter b [M]")
    ax2.set_ylabel("deflection angle [degrees]")
    ax2.set_title("How much is light bent?", fontsize=11)
    ax2.legend(loc="upper right")
    style.header(fig, "Light paths around a black hole",
                 "Photon orbits from d²u/dφ² + u = 3Mu².  Orange rays are captured, gold rays skim the photon sphere, "
                 "blue rays escape with a kink.")
    style.footer(fig, "simulations/cosmic/black_hole_raytracer.py", "Units G = c = 1; lengths in M")
    return style.save(fig, "black_hole_geodesics.png", outdir=outdir, showcase=showcase)


def main(argv=None):
    from cosmic import _cli

    p = _cli.parser(__doc__, "python -m cosmic.black_hole_raytracer")
    p.add_argument("--width", type=int, default=800)
    p.add_argument("--height", type=int, default=450)
    p.add_argument("--ss", type=int, default=2, help="supersampling factor per axis")
    p.add_argument("--r-obs", type=float, default=50.0, help="camera distance in M")
    p.add_argument("--inclination", type=float, default=84.0, help="degrees from disk axis (90 = edge-on)")
    p.add_argument("--fov", type=float, default=42.0, help="horizontal field of view [deg]")
    p.add_argument("--tmax", type=float, default=4500.0, help="disk colour temperature at peak flux [K]")
    p.add_argument("--r-out", type=float, default=22.0, help="disk outer radius [M]")
    p.add_argument("--streaks", type=float, default=0.25, help="cosmetic turbulence strength (0 = off)")
    p.add_argument("--exposure", type=float, default=0.4)
    p.add_argument("--no-stars", action="store_true")
    p.add_argument("--no-caption", action="store_true")
    p.add_argument("--gif", action="store_true", help="also render an animated GIF of the swirling disk")
    p.add_argument("--geodesics", action="store_true", help="also plot photon paths and the deflection angle")
    _cli.add_common(p)
    a = p.parse_args(argv)
    sc = Scene(width=a.width, height=a.height, supersample=a.ss, r_obs=a.r_obs, inclination=a.inclination,
               fov=a.fov, t_max=a.tmax, r_out=a.r_out, streaks=a.streaks, exposure=a.exposure, stars=not a.no_stars)
    path, _ = render_black_hole(sc, a.outdir, a.showcase, annotate=not a.no_caption)
    print("wrote", path)
    if a.gif:
        print("wrote", render_gif(outdir=a.outdir, showcase=a.showcase))
    if a.geodesics:
        print("wrote", plot_geodesics(a.outdir, a.showcase))


if __name__ == "__main__":
    main()
