"""21 cm hydrogen-line processing: raw RTL-SDR IQ -> calibrated spectrum -> velocity -> rotation curve.

Pipeline
  1. read_cu8            RTL-SDR 8-bit unsigned IQ (the format `rtl_sdr` writes)
  2. average_spectrum    Welch-style averaging of many windowed FFTs (radiometer: noise ~ 1/sqrt(B t))
  3. calibrate           (ON - OFF) / OFF * T_sys  -> antenna temperature, removes the bandpass shape
  4. baseline            polynomial fit to the line-free channels, subtracted
  5. velocity_axis       Doppler: v = c (f0 - f) / f0   (radio convention), km/s
  6. lsr_correction      topocentric -> Local Standard of Rest (astropy, optional)
  7. tangent_velocity    highest velocity with emission above a threshold (the tangent point)
  8. rotation_curve      R = R0 sin l,  V(R) = v_t + V0 sin l   (valid for 0 < l < 90 deg)
License: MIT
"""
from __future__ import annotations

import numpy as np

C_KMS = 299_792.458
F_HI = 1420.405751768e6          # Hz
R0_KPC, V0_KMS = 8.5, 220.0      # IAU 1985 standard Galactic constants (modern values: ~8.2 kpc, ~233 km/s)


def read_cu8(path, max_samples=None) -> np.ndarray:
    raw = np.fromfile(path, dtype=np.uint8, count=-1 if max_samples is None else 2 * max_samples)
    iq = (raw[0::2].astype(np.float32) - 127.5) + 1j * (raw[1::2].astype(np.float32) - 127.5)
    return (iq / 127.5).astype(np.complex64)


def average_spectrum(iq: np.ndarray, nfft=2048) -> np.ndarray:
    """Mean power spectrum of non-overlapping Hann-windowed blocks, DC in the middle (fftshift)."""
    n = len(iq) // nfft
    blocks = iq[: n * nfft].reshape(n, nfft) * np.hanning(nfft).astype(np.float32)
    p = np.abs(np.fft.fft(blocks, axis=1)) ** 2
    return np.fft.fftshift(p.mean(axis=0))


def freq_axis(fc, fs, nfft=2048) -> np.ndarray:
    return fc + np.fft.fftshift(np.fft.fftfreq(nfft, 1 / fs))


def velocity_axis(freq_hz: np.ndarray) -> np.ndarray:
    return C_KMS * (F_HI - freq_hz) / F_HI


def mask_dc(spec: np.ndarray, width=3) -> np.ndarray:
    """RTL-SDR tuners leave a spike at the centre (DC) bin: interpolate over it."""
    s = spec.copy()
    c = len(s) // 2
    s[c - width: c + width + 1] = np.interp(np.arange(c - width, c + width + 1), [c - width - 1, c + width + 1],
                                            [s[c - width - 1], s[c + width + 1]])
    return s


def calibrate(on: np.ndarray, off: np.ndarray, t_sys=100.0) -> np.ndarray:
    """Position switching: the receiver's bandpass multiplies both spectra, so it cancels in the ratio."""
    return (on / off - 1.0) * t_sys


def baseline(v: np.ndarray, t: np.ndarray, line_window=(-100.0, 175.0), edge_frac=0.08, order=2):
    """Fit a polynomial to channels outside the emission window (and away from the band edges)."""
    n = len(v)
    use = np.ones(n, bool)
    use[: int(edge_frac * n)] = False
    use[-int(edge_frac * n):] = False
    use &= (v < line_window[0]) | (v > line_window[1])
    coef = np.polyfit(v[use], t[use], order)
    fit = np.polyval(coef, v)
    rms = float(np.std(t[use] - fit[use]))
    return t - fit, rms, use


def smooth(t: np.ndarray, n=8) -> np.ndarray:
    return np.convolve(t, np.ones(n) / n, mode="same")


def lsr_correction(l_deg, b_deg, time_iso, lat_deg, lon_deg, height_m=0.0) -> float:
    """km/s to ADD to a topocentric velocity to get v_LSR (barycentric correction + standard solar motion).

    Standard solar motion: 20 km/s towards RA 18h, Dec +30 deg (B1900), i.e. galactic (l, b) ~ (56.2, 22.8) deg.
    Requires astropy; offline it may warn about IERS tables (accuracy ~ metres per second is still fine)."""
    from astropy import units as u
    from astropy.coordinates import EarthLocation, SkyCoord
    from astropy.time import Time
    from astropy.utils import iers
    iers.conf.auto_download = False
    loc = EarthLocation(lat=lat_deg * u.deg, lon=lon_deg * u.deg, height=height_m * u.m)
    c = SkyCoord(l=l_deg * u.deg, b=b_deg * u.deg, frame="galactic")
    v_bary = c.radial_velocity_correction(kind="barycentric", obstime=Time(time_iso), location=loc).to(u.km / u.s).value
    la, ba = np.radians(56.2), np.radians(22.8)
    l, b = np.radians(l_deg), np.radians(b_deg)
    apex = np.array([np.cos(ba) * np.cos(la), np.cos(ba) * np.sin(la), np.sin(ba)])
    los = np.array([np.cos(b) * np.cos(l), np.cos(b) * np.sin(l), np.sin(b)])
    return float(v_bary + 20.0 * apex @ los)


def tangent_velocity(v: np.ndarray, t: np.ndarray, rms: float, nsigma=5.0, vmin=-20.0, vmax=200.0,
                     min_width_kms=8.0) -> float:
    """High-velocity edge of the emission: the largest velocity of any run of channels that stays above
    nsigma * rms for at least min_width_kms (so isolated noise spikes are ignored, real gaps are crossed)."""
    order = np.argsort(v)
    vs, ts = v[order], t[order]
    above = (ts > nsigma * rms) & (vs > vmin) & (vs < vmax)
    best = float("nan")
    start = None
    for i, a in enumerate(np.append(above, False)):
        if a and start is None:
            start = i
        elif not a and start is not None:
            if vs[i - 1] - vs[start] >= min_width_kms:
                best = float(vs[i - 1]) if np.isnan(best) else max(best, float(vs[i - 1]))
            start = None
    return best


def rotation_curve(l_deg, v_t, R0=R0_KPC, V0=V0_KMS):
    s = np.sin(np.radians(np.asarray(l_deg, float)))
    return R0 * s, np.asarray(v_t, float) + V0 * s


def column_density(v: np.ndarray, t: np.ndarray) -> float:
    """N_HI = 1.823e18 * integral T_b dv   [cm^-2, K km/s] (optically thin)."""
    dv = np.abs(np.gradient(v))
    return float(1.823e18 * np.sum(t * dv))
