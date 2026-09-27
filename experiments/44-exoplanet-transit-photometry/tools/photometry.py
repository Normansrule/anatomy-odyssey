#!/usr/bin/env python3
"""Aperture-photometry pipeline for exoplanet transits (FITS in, light curve + transit fit out).

    python3 photometry.py /path/to/night --target 200,150        # x,y of the target in the first frame
    python3 photometry.py --selftest                              # synthesise a night, reduce it, check the fit

Steps
  1. master bias / dark / flat (median combine), calibrate every light frame:
        science = (raw - bias - dark * t/t_dark) / (flat_norm)
  2. find stars in the first frame (threshold + local maxima), pick comparisons of similar brightness
  3. per frame: re-centre each star (flux-weighted centroid), circular aperture sum with sub-pixel
     edges, sky = sigma-clipped median of an annulus, CCD-equation uncertainty
  4. differential photometry: target / (sum of comparisons), normalised out of transit
  5. detrend against airmass with the out-of-transit data, fit the transit model (scipy least squares):
        t0, Rp/R*, a/R*, inclination (limb darkening fixed), and report depth, duration, mid-time (BJD needs
        a barycentric correction - see the README)
File names: bias_*.fits, dark_*.fits, flat_*.fits, light_*.fits (DATE-OBS, EXPTIME, AIRMASS in headers).
License: MIT
"""
from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.time import Time
from scipy.ndimage import maximum_filter, uniform_filter
from scipy.optimize import least_squares

import transit_model as TM

HERE = Path(__file__).resolve().parent
IMG = HERE.parent / "images"
GAIN, READ_NOISE = 1.0, 3.0


# ------------------------------------------------------------------ calibration
def master(files):
    return np.median(np.stack([fits.getdata(f).astype(np.float32) for f in files]), axis=0)


def calibration(folder: Path):
    bias = master(sorted(folder.glob("bias_*.fits")))
    dark_files = sorted(folder.glob("dark_*.fits"))
    dark = master(dark_files) - bias
    t_dark = fits.getheader(dark_files[0]).get("EXPTIME", 1.0)
    flat = master(sorted(folder.glob("flat_*.fits"))) - bias
    flat /= np.median(flat)
    return bias, dark, t_dark, flat


def calibrate(raw, exptime, bias, dark, t_dark, flat):
    return (raw.astype(np.float32) - bias - dark * (exptime / t_dark)) / flat


# ------------------------------------------------------------------ stars
def find_stars(img, nsigma=20, box=9):
    sm = uniform_filter(img, 3)
    bg = np.median(sm)
    noise = 1.4826 * np.median(np.abs(sm - bg))
    peaks = (sm == maximum_filter(sm, box)) & (sm > bg + nsigma * noise)
    ys, xs = np.nonzero(peaks)
    edge = (xs > 15) & (xs < img.shape[1] - 15) & (ys > 15) & (ys < img.shape[0] - 15)
    xs, ys = xs[edge], ys[edge]
    return np.column_stack([xs, ys]).astype(float), sm[ys, xs] - bg


def centroid(img, x, y, r=7):
    x0, y0 = int(round(x)), int(round(y))
    cut = img[y0 - r:y0 + r + 1, x0 - r:x0 + r + 1]
    cut = cut - np.median(cut)
    cut[cut < 0] = 0
    ys, xs = np.mgrid[y0 - r:y0 + r + 1, x0 - r:x0 + r + 1]
    s = cut.sum()
    return (float((xs * cut).sum() / s), float((ys * cut).sum() / s)) if s > 0 else (x, y)


def aperture_sum(img, x, y, r, r_in, r_out, sub=5):
    """Sum inside a circle with sub-pixel sampling of the edge pixels; sky from an annulus."""
    R = int(r_out) + 2
    x0, y0 = int(round(x)), int(round(y))
    ys, xs = np.mgrid[y0 - R:y0 + R + 1, x0 - R:x0 + R + 1]
    cut = img[y0 - R:y0 + R + 1, x0 - R:x0 + R + 1]
    d = np.hypot(xs - x, ys - y)
    ann = (d >= r_in) & (d <= r_out)
    sky_vals = cut[ann]
    for _ in range(3):                                          # sigma-clip stars out of the annulus
        m, s = np.median(sky_vals), np.std(sky_vals)
        sky_vals = sky_vals[np.abs(sky_vals - m) < 3 * s]
    sky = float(np.median(sky_vals))
    # fractional pixel weights
    o = (np.arange(sub) + 0.5) / sub - 0.5
    ox, oy = np.meshgrid(o, o)
    w = ((xs[..., None, None] + ox - x) ** 2 + (ys[..., None, None] + oy - y) ** 2 <= r * r).mean(axis=(-1, -2))
    flux = float(((cut - sky) * w).sum())
    npix = float(w.sum())
    var = max(flux, 0) * GAIN + npix * (max(sky, 0) * GAIN + READ_NOISE ** 2) * (1 + npix / ann.sum())
    return flux, np.sqrt(var) / GAIN, sky


# ------------------------------------------------------------------ pipeline
def reduce(folder: Path, target_xy=None, n_comps=4, r_ap=None):
    bias, dark, t_dark, flat = calibration(folder)
    lights = sorted(folder.glob("light_*.fits"))
    first = calibrate(fits.getdata(lights[0]), fits.getheader(lights[0])["EXPTIME"], bias, dark, t_dark, flat)
    pos, peak = find_stars(first)
    if target_xy is None:
        target_xy = (first.shape[1] / 2, first.shape[0] / 2)
    ti = int(np.argmin(np.hypot(pos[:, 0] - target_xy[0], pos[:, 1] - target_xy[1])))
    # comparisons: the brightest stars with a peak within a factor 2.5 of the target's, not near saturation
    def isolated(i, radius=30.0):  # no other detected star in or near the sky annulus
        dd = np.hypot(pos[:, 0] - pos[i, 0], pos[:, 1] - pos[i, 1])
        return np.sum(dd < radius) == 1

    cand = [i for i in np.argsort(-peak) if i != ti and 0.4 < peak[i] / peak[ti] < 2.5 and isolated(i)]
    comps = cand[:n_comps]
    stars = [ti] + comps
    xy = pos[stars].copy()
    times, airmass, fluxes, errs, fwhms = [], [], [], [], []
    for f in lights:
        hdr = fits.getheader(f)
        img = calibrate(fits.getdata(f), hdr["EXPTIME"], bias, dark, t_dark, flat)
        # follow the drift with the target, then refine every star
        shift = np.array(centroid(img, *xy[0])) - xy[0]
        xy = xy + shift
        xy = np.array([centroid(img, *p) for p in xy])
        # aperture scaled to the seeing: FWHM from the target's second moment
        x0, y0 = int(round(xy[0, 0])), int(round(xy[0, 1]))
        cut = img[y0 - 8:y0 + 9, x0 - 8:x0 + 9]
        cut = np.clip(cut - np.median(img), 0, None)
        yy, xx = np.mgrid[-8:9, -8:9]
        sig = np.sqrt((((xx - (xy[0, 0] - x0)) ** 2 + (yy - (xy[0, 1] - y0)) ** 2) * cut).sum() / cut.sum() / 2)
        fwhm = 2.355 * sig
        r = r_ap or 1.8 * fwhm
        row, erow = [], []
        for p in xy:
            fl, e, _ = aperture_sum(img, p[0], p[1], r, r + 5, r + 12)
            row.append(fl)
            erow.append(e)
        times.append(Time(hdr["DATE-OBS"]).jd)
        airmass.append(hdr.get("AIRMASS", np.nan))
        fluxes.append(row)
        errs.append(erow)
        fwhms.append(fwhm)
    return dict(t=np.array(times), airmass=np.array(airmass), flux=np.array(fluxes), err=np.array(errs),
                fwhm=np.array(fwhms), xy0=pos[stars], first=first, comps=comps)


def differential(d):
    tgt, comps = d["flux"][:, 0], d["flux"][:, 1:].sum(axis=1)
    rel = tgt / comps
    e = rel * np.sqrt((d["err"][:, 0] / tgt) ** 2 + (np.sqrt((d["err"][:, 1:] ** 2).sum(axis=1)) / comps) ** 2)
    return rel, e


def fit_transit(t, rel, err, airmass, period, guess):
    """Model: F = baseline * (1 + c1 * (X - 1)) * transit(t).  Returns best-fit parameters and 1-sigma errors."""
    t_ref = t[0]
    tt = t - t_ref

    def model(p):
        t0, rp, a_rs, inc, f0, c1 = p
        return f0 * (1 + c1 * (airmass - 1)) * TM.flux(tt, t0, rp, a_rs, inc, period)

    p0 = [guess["t0"] - t_ref, guess["rp"], guess["a_rs"], guess["inc"], np.median(rel), 0.0]
    lo = [p0[0] - 0.05, 0.02, 2.0, 75.0, 0, -1]
    hi = [p0[0] + 0.05, 0.4, 30.0, 90.0, np.inf, 1]
    res = least_squares(lambda p: (rel - model(p)) / err, p0, bounds=(lo, hi))
    J = res.jac
    chi2 = np.sum(res.fun ** 2) / max(len(rel) - len(p0), 1)
    cov = np.linalg.pinv(J.T @ J) * chi2
    perr = np.sqrt(np.clip(np.diag(cov), 0, None))
    p = res.x
    out = dict(t0_jd=p[0] + t_ref, t0_err_min=perr[0] * 1440, rp=p[1], rp_err=perr[1], a_rs=p[2], a_rs_err=perr[2],
               inc=p[3], inc_err=perr[3], f0=p[4], airmass_coef=p[5], chi2_red=chi2,
               rms_ppt=float(np.std(rel - model(p)) / np.median(rel) * 1e3))
    out["depth_pct"] = 100 * out["rp"] ** 2
    out["depth_err_pct"] = 200 * out["rp"] * out["rp_err"]
    out["duration_h"] = float(TM.duration_hours(period, out["a_rs"], out["rp"], out["inc"]))
    return out, model(p)


def bjd_tdb(jd_utc, ra_deg, dec_deg, lat_deg, lon_deg):
    """Barycentric Julian Date in TDB - the time standard exoplanet ephemerides use.
    Adds the light travel time between the observatory and the Solar System barycentre (up to ~8.3 min)."""
    from astropy import units as u
    from astropy.coordinates import EarthLocation, SkyCoord
    from astropy.utils import iers
    iers.conf.auto_download = False
    loc = EarthLocation(lat=lat_deg * u.deg, lon=lon_deg * u.deg)
    t = Time(jd_utc, format="jd", scale="utc", location=loc)
    ltt = t.light_travel_time(SkyCoord(ra_deg * u.deg, dec_deg * u.deg), kind="barycentric")
    return float((t.tdb + ltt).jd)


def plot(d, rel, err, fitline, fit, truth=None, tag=""):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    SURFACE, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
    BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"
    IMG.mkdir(exist_ok=True)
    # --- field with apertures
    fig, ax = plt.subplots(figsize=(8, 6), facecolor=SURFACE)
    im = d["first"]
    lo, hi = np.percentile(im, [5, 99.7])
    ax.imshow(np.clip((im - lo) / (hi - lo), 0, 1) ** 0.5, cmap="gray", origin="lower")
    for i, (x, y) in enumerate(d["xy0"]):
        col = ORANGE if i == 0 else AQUA
        ax.add_patch(plt.Circle((x, y), 7.5, fill=False, color=col, lw=1.5))
        ax.add_patch(plt.Circle((x, y), 12.5, fill=False, color=col, lw=0.8, ls="--"))
        ax.add_patch(plt.Circle((x, y), 19.5, fill=False, color=col, lw=0.8, ls="--"))
        ax.text(x + 14, y + 14, "target" if i == 0 else f"C{i}", color=col, fontsize=10, weight="bold")
    ax.set_axis_off()
    ax.set_title(f"Calibrated first frame{tag}: target (orange), comparison stars (green), sky annuli (dashed)",
                 loc="left", color=INK, fontsize=9.5)
    fig.tight_layout()
    fig.savefig(IMG / "field-apertures.png", dpi=120, facecolor=SURFACE)
    plt.close(fig)
    # --- light curve + fit + residuals (two panels, same unit)
    hrs = (d["t"] - fit["t0_jd"]) * 24
    norm = fit["f0"] * (1 + fit["airmass_coef"] * (d["airmass"] - 1))
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(9, 6.5), sharex=True, facecolor=SURFACE,
                                 gridspec_kw={"height_ratios": [3, 1]})
    for ax in (a1, a2):
        ax.set_facecolor(SURFACE)
        ax.grid(True, color=GRID, lw=0.6)
        for sp in ("top", "right"):
            ax.spines[sp].set_visible(False)
        ax.tick_params(colors=INK2)
    a1.errorbar(hrs, rel / norm, err / norm, fmt="o", ms=3, color=BLUE, ecolor="#b9d3f2", elinewidth=0.8,
                label="differential flux, airmass-detrended")
    # 10-minute bins
    nb = 10
    k = len(hrs) // nb * nb
    a1.plot(hrs[:k].reshape(-1, nb).mean(1), (rel / norm)[:k].reshape(-1, nb).mean(1), "s", color=INK, ms=5,
            label="10-min bins")
    a1.plot(hrs, fitline / norm, color=ORANGE, lw=2,
            label=f"fit: depth {fit['depth_pct']:.2f} ± {fit['depth_err_pct']:.2f} %, T14 {fit['duration_h']:.2f} h")
    if truth:
        a1.axvline((truth["t0_jd_utc"] - fit["t0_jd"]) * 24, color=INK2, ls=":", lw=1, label="true mid-transit")
    a1.set_ylabel("relative flux", color=INK2)
    a1.legend(frameon=False, loc="lower left", fontsize=8.5)
    a1.set_title(f"Transit light curve{tag}", loc="left", color=INK)
    a2.plot(hrs, (rel - fitline) / norm * 1e3, "o", ms=2.5, color=BLUE)
    a2.axhline(0, color=INK2, lw=0.8)
    a2.set_ylabel("residual (ppt)", color=INK2)
    a2.set_xlabel("hours from fitted mid-transit", color=INK2)
    fig.tight_layout()
    fig.savefig(IMG / "transit-lightcurve.png", dpi=140, facecolor=SURFACE)
    plt.close(fig)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", nargs="?")
    ap.add_argument("--target", help="x,y of the target in the first frame")
    ap.add_argument("--period", type=float, default=2.21857, help="orbital period, days (from the ephemeris)")
    ap.add_argument("--t0-guess", help="predicted mid-transit, UTC ISO time")
    ap.add_argument("--radec", help="target RA,Dec in degrees - with --site, prints the mid-transit in BJD_TDB")
    ap.add_argument("--site", help="observatory lat,lon in degrees")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args(argv)
    truth = None
    if args.selftest:
        import synth_field
        td = Path(tempfile.mkdtemp())
        synth_field.main(["--out", str(td)])
        folder = td
        truth = json.loads((td / "truth.json").read_text())
        target = (truth["stars"][0]["x"], truth["stars"][0]["y"])
        period = truth["period"]
        tag = " (synthetic night)"
    else:
        folder = Path(args.folder)
        target = tuple(map(float, args.target.split(","))) if args.target else None
        period = args.period
        tag = ""
    d = reduce(folder, target)
    rel, err = differential(d)
    t0_guess = Time(args.t0_guess).jd if args.t0_guess else d["t"][len(d["t"]) // 2]
    fit, line = fit_transit(d["t"], rel, err, d["airmass"], period, dict(t0=t0_guess, rp=0.1, a_rs=8.0, inc=87.0))
    plot(d, rel, err, line, fit, truth, tag)
    print(f"frames {len(d['t'])}, comparison stars {len(d['comps'])}, median FWHM {np.median(d['fwhm']):.2f} px")
    print(f"mid-transit  {Time(fit['t0_jd'], format='jd').isot} UTC  (+/- {fit['t0_err_min']:.1f} min)")
    if args.radec and args.site:
        ra, dec = map(float, args.radec.split(","))
        la, lo = map(float, args.site.split(","))
        print(f"mid-transit  BJD_TDB {bjd_tdb(fit['t0_jd'], ra, dec, la, lo):.5f}")
    print(f"Rp/R*        {fit['rp']:.4f} +/- {fit['rp_err']:.4f}   depth {fit['depth_pct']:.3f} +/- {fit['depth_err_pct']:.3f} %")
    print(f"a/R*         {fit['a_rs']:.2f} +/- {fit['a_rs_err']:.2f}   inclination {fit['inc']:.2f} +/- {fit['inc_err']:.2f} deg")
    print(f"duration T14 {fit['duration_h']:.2f} h, residual rms {fit['rms_ppt']:.2f} ppt, reduced chi2 {fit['chi2_red']:.2f}")
    if truth:
        import shutil
        shutil.rmtree(folder, ignore_errors=True)
        dt_min = (fit["t0_jd"] - truth["t0_jd_utc"]) * 1440
        ok = (abs(fit["rp"] - truth["rp"]) < max(3 * fit["rp_err"], 0.006) and abs(dt_min) < max(3 * fit["t0_err_min"], 2.0))
        print(f"truth: Rp/R* {truth['rp']}, depth {truth['depth'] * 100:.3f} %, mid-transit offset {dt_min:+.2f} min")
        print("PASS" if ok else "FAIL")
        sys.exit(0 if ok else 1)
    return fit


if __name__ == "__main__":
    main()
