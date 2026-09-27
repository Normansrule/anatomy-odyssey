#!/usr/bin/env python3
"""Synthetic transit night: a star field imaged every 60 s by a small telescope + CMOS camera.

Writes FITS files (light frames + bias, dark and flat calibration frames) exactly like a real
acquisition program, so photometry.py can be tested end to end. Everything that makes real
photometry hard is included, with known values so the answer can be checked:

  * a transit on the target star (limb-darkened model, known Rp/R*, mid-time, a/R*, inclination)
  * 5 comparison stars of similar brightness, 25 fainter field stars
  * extinction that grows with airmass (all stars dim together - differential photometry removes it)
  * seeing that varies (FWHM 3.5-5 px, defocused), tracking drift of ~0.03 px/frame + jitter
  * sky background with a gradient that brightens late in the night, read noise, dark current,
    Poisson noise, hot pixels, vignetting and dust donuts in the flat field, 16-bit saturation
  * scintillation noise (Young 1967): sigma = 0.09 D^-2/3 X^1.75 exp(-h/8000) (2 t)^-1/2

    python3 synth_field.py --out /tmp/transit_night
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.time import Time

import transit_model as TM

NY, NX = 300, 400
GAIN = 1.0            # e-/ADU
READ_NOISE = 3.0      # e-
DARK_E_S = 0.05       # e-/px/s at the sensor temperature
BIAS = 300.0          # ADU
APERTURE_CM = 8.0     # 80 mm refractor
SITE_H_M = 100.0


def psf_stamp(img, x, y, flux_e, fwhm):
    s = fwhm / 2.355
    r = int(4 * s) + 2
    x0, y0 = int(round(x)), int(round(y))
    ys, xs = np.mgrid[y0 - r:y0 + r + 1, x0 - r:x0 + r + 1]
    ok = (ys >= 0) & (ys < NY) & (xs >= 0) & (xs < NX)
    g = np.exp(-((xs - x) ** 2 + (ys - y) ** 2) / (2 * s * s)) / (2 * np.pi * s * s)
    img[ys[ok], xs[ok]] += flux_e * g[ok]


def flat_field(rng):
    yy, xx = np.mgrid[0:NY, 0:NX]
    r2 = ((xx - NX / 2) / NX) ** 2 + ((yy - NY / 2) / NY) ** 2
    f = 1 - 0.35 * r2                                           # vignetting
    for _ in range(4):                                          # dust donuts
        cx, cy = rng.uniform(40, NX - 40), rng.uniform(40, NY - 40)
        d = np.hypot(xx - cx, yy - cy)
        f *= 1 - 0.06 * np.exp(-((d - 12) / 3) ** 2)
    f *= 1 + rng.normal(0, 0.004, f.shape)                      # pixel-to-pixel response
    return f


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="transit_night")
    ap.add_argument("--frames", type=int, default=200)
    ap.add_argument("--exptime", type=float, default=50.0)
    ap.add_argument("--cadence", type=float, default=60.0)
    ap.add_argument("--seed", type=int, default=44)
    args = ap.parse_args(argv)
    rng = np.random.default_rng(args.seed)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    # ---- the planet (a hot Jupiter, values of the same order as HD 189733 b)
    truth = dict(rp=0.155, a_rs=8.8, inc=85.7, period=2.21857, u1=0.45, u2=0.20)
    t_start = Time("2026-10-10T02:30:00", scale="utc")
    from astropy import units as u
    times = t_start + (np.arange(args.frames) * args.cadence) * u.s
    t_rel = (times - t_start).jd
    truth["t0_rel_days"] = float(t_rel[args.frames // 2] + 0.004)   # mid-transit, a little after mid-series
    truth["t0_jd_utc"] = float(t_start.jd + truth["t0_rel_days"])
    truth["depth"] = truth["rp"] ** 2
    truth["duration_h"] = float(TM.duration_hours(truth["period"], truth["a_rs"], truth["rp"], truth["inc"]))

    # ---- stars: target at the centre, 5 comparisons, 25 field stars
    stars = [dict(x=200.0, y=150.0, flux=6.0e5, role="target")]
    for _ in range(5):
        stars.append(dict(x=rng.uniform(40, NX - 40), y=rng.uniform(40, NY - 40), flux=rng.uniform(3e5, 9e5), role="comp"))
    for _ in range(25):
        stars.append(dict(x=rng.uniform(10, NX - 10), y=rng.uniform(10, NY - 10), flux=10 ** rng.uniform(3.3, 4.8), role="field"))
    flat = flat_field(rng)

    # ---- calibration frames
    def raw(e_img, exptime):
        e = rng.poisson(np.clip(e_img + DARK_E_S * exptime, 0, None)).astype(float)
        adu = BIAS + e / GAIN + rng.normal(0, READ_NOISE / GAIN, e.shape)
        return np.clip(adu, 0, 65535).astype(np.uint16)

    hot = rng.random((NY, NX)) < 2e-4
    for i in range(10):
        fits.writeto(out / f"bias_{i:02d}.fits", raw(np.zeros((NY, NX)), 0.0), overwrite=True)
    for i in range(10):
        d = np.zeros((NY, NX)); d[hot] = 40 * args.exptime
        fits.writeto(out / f"dark_{i:02d}.fits", raw(d, args.exptime), fits.Header({"EXPTIME": args.exptime}), overwrite=True)
    for i in range(10):
        fits.writeto(out / f"flat_{i:02d}.fits", raw(25000 * flat, 1.0), fits.Header({"EXPTIME": 1.0}), overwrite=True)

    # ---- science frames
    rel = TM.flux(t_rel, truth["t0_rel_days"], truth["rp"], truth["a_rs"], truth["inc"], truth["period"],
                  truth["u1"], truth["u2"])
    hours = t_rel * 24
    airmass = 1.05 + 0.08 * (hours - 1.2) ** 2           # target transits the meridian ~1.2 h in
    ext = 10 ** (-0.4 * 0.20 * airmass)                    # 0.20 mag/airmass extinction
    fwhm = 4.2 + 0.5 * np.sin(hours * 1.3) + rng.normal(0, 0.1, args.frames)
    drift = np.column_stack([0.03 * np.arange(args.frames), -0.02 * np.arange(args.frames)])
    sigma_sc = 0.09 * APERTURE_CM ** (-2 / 3) * airmass ** 1.75 * np.exp(-SITE_H_M / 8000) / np.sqrt(2 * args.exptime)
    log = []
    for k in range(args.frames):
        img = np.zeros((NY, NX))
        sky = 60 + 25 * (hours[k] / hours[-1]) ** 2                   # e-/px/s, brightening (moon rise)
        yy, xx = np.mgrid[0:NY, 0:NX]
        img += (sky * (1 + 0.15 * xx / NX)) * args.exptime
        jit = rng.normal(0, 0.3, 2)
        for s in stars:
            f = s["flux"] * ext[k] * args.exptime / 50.0 * (1 + rng.normal(0, sigma_sc[k]))
            if s["role"] == "target":
                f *= rel[k]
            psf_stamp(img, s["x"] + drift[k, 0] + jit[0], s["y"] + drift[k, 1] + jit[1], f, fwhm[k])
        img[hot] += 40 * args.exptime
        frame = raw(img * flat, args.exptime)
        hdr = fits.Header({"DATE-OBS": times[k].isot, "EXPTIME": args.exptime, "AIRMASS": round(float(airmass[k]), 4),
                           "IMAGETYP": "LIGHT", "OBJECT": "SYNTHETIC-TRANSIT"})
        fits.writeto(out / f"light_{k:04d}.fits", frame, hdr, overwrite=True)
        log.append(float(rel[k]))
    truth["stars"] = [{k2: (round(v, 2) if isinstance(v, float) else v) for k2, v in s.items()} for s in stars[:6]]
    truth["t_start_utc"] = t_start.isot
    (out / "truth.json").write_text(json.dumps(truth, indent=1))
    print(f"wrote {args.frames} light frames + 30 calibration frames to {out}; "
          f"depth {truth['depth'] * 100:.2f} %, T14 {truth['duration_h']:.2f} h, "
          f"scintillation {sigma_sc.min() * 1e3:.1f}-{sigma_sc.max() * 1e3:.1f} ppt per frame")


if __name__ == "__main__":
    main()
