#!/usr/bin/env python3
"""Turn a phone photo of your DIY-spectroscope rainbow into a calibrated spectrum.

    python3 spectrum.py photo.jpg --cfl                 # auto-calibrate on a fluorescent lamp
    python3 spectrum.py sky.jpg --cal 412:435.8,803:546.1 --sun
    python3 spectrum.py --selftest                      # synthetic photo → check the pipeline

Steps
  1. find the bright band (or give --rows y0:y1), sum the pixels across it → intensity per column
  2. calibrate pixel → wavelength with a straight line through known lines:
       --cfl : finds the three strongest peaks of a fluorescent tube and identifies them by
               COLOUR (blue = mercury 435.8 nm, green = mercury 546.1 nm, red = europium 611.6 nm),
               so it works whichever way round the rainbow is
       --cal : your own "pixel:nanometres" pairs (two or more)
  3. write <photo>_spectrum.csv and <photo>_spectrum.png, with reference lines marked
       --sun : marks the Fraunhofer absorption lines of sunlight

The curve is NOT radiometrically calibrated: the phone sensor and the grating are more
sensitive to some colours than others. Line POSITIONS are trustworthy; relative heights are not.
Requires: numpy, pillow, matplotlib (scipy optional).
"""
import argparse, csv, os, sys
import numpy as np
from PIL import Image

# NIST Atomic Spectra Database wavelengths (air), nm
CFL_LINES = {"Hg 404.7": 404.66, "Hg 435.8": 435.83, "Tb 487.7": 487.7, "Tb 542.4": 542.4,
             "Hg 546.1": 546.07, "Hg 577/579": 578.0, "Eu 611.6": 611.6}
FRAUNHOFER = {"K (Ca⁺)": 393.37, "H (Ca⁺)": 396.85, "G (Fe/CH)": 430.8, "F (Hβ)": 486.13,
              "b (Mg)": 517.3, "E (Fe)": 527.04, "D (Na)": 589.3, "C (Hα)": 656.28,
              "B (O₂)": 686.7, "A (O₂)": 759.4}


def wavelength_rgb(nm):
    """Approximate visible colour of a wavelength (Dan Bruton's piecewise model)."""
    if nm < 380 or nm > 750:
        return (0.35, 0.35, 0.4)
    if nm < 440: r, g, b = -(nm - 440) / 60, 0.0, 1.0
    elif nm < 490: r, g, b = 0.0, (nm - 440) / 50, 1.0
    elif nm < 510: r, g, b = 0.0, 1.0, -(nm - 510) / 20
    elif nm < 580: r, g, b = (nm - 510) / 70, 1.0, 0.0
    elif nm < 645: r, g, b = 1.0, -(nm - 645) / 65, 0.0
    else: r, g, b = 1.0, 0.0, 0.0
    f = 0.3 + 0.7 * (nm - 380) / 40 if nm < 420 else (0.3 + 0.7 * (750 - nm) / 50 if nm > 700 else 1.0)
    return (r * f, g * f, b * f)


def extract(img, rows=None, vertical=False):
    a = np.asarray(img.convert("RGB")).astype(float) / 255.0
    if vertical:
        a = a.transpose(1, 0, 2)
    lum = a.sum(2)
    if rows:
        y0, y1 = rows
    else:
        prof = lum.sum(1)
        prof = prof - np.median(prof)
        thr = 0.5 * prof.max()
        on = np.nonzero(prof > thr)[0]
        y0, y1 = on.min(), on.max() + 1
    band = a[y0:y1]
    intensity = band.sum(2).sum(0)
    colour = band.sum(0)                           # per-column RGB, used to identify lines
    bg = np.percentile(intensity, 5)
    return intensity - bg, colour, (y0, y1)


def find_peaks(y, n=3, min_sep=8):
    try:
        from scipy.signal import find_peaks as fp
        idx, props = fp(y, prominence=0.05 * y.max(), distance=min_sep)
        order = np.argsort(props["prominences"])[::-1]
        return sorted(idx[order[:n]])
    except ImportError:
        idx = [i for i in range(1, len(y) - 1) if y[i] >= y[i - 1] and y[i] > y[i + 1] and y[i] > 0.1 * y.max()]
        idx.sort(key=lambda i: -y[i])
        keep = []
        for i in idx:
            if all(abs(i - k) >= min_sep for k in keep):
                keep.append(i)
            if len(keep) == n:
                break
        return sorted(keep)


def refine(y, i):
    """Sub-pixel peak position from a parabola through the top three samples."""
    if 0 < i < len(y) - 1:
        d = y[i - 1] - 2 * y[i] + y[i + 1]
        if d != 0:
            return i + 0.5 * (y[i - 1] - y[i + 1]) / d
    return float(i)


def cfl_calibration(y, colour):
    peaks = find_peaks(y, 3)
    if len(peaks) < 3:
        raise SystemExit("could not find three strong peaks — is this a fluorescent lamp? try --cal")
    pairs = []
    for i in peaks:
        r, g, b = colour[i] / colour[i].sum()
        # the dominant channel names the line
        nm = 435.83 if b == max(r, g, b) else 546.07 if g == max(r, g, b) else 611.6
        pairs.append((refine(y, i), nm))
    if len({nm for _, nm in pairs}) < 3:
        raise SystemExit(f"peak colours ambiguous {pairs} — use --cal with pixel:nm pairs")
    return pairs


def fit(pairs):
    px = np.array([p for p, _ in pairs]); nm = np.array([n for _, n in pairs])
    a, b = np.polyfit(px, nm, 1)
    resid = nm - (a * px + b)
    return a, b, resid


def plot(nm, y, out, refs, title):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    SURF, INK, INK2, MUTED, GRID = "#0b0f1c", "#e9edff", "#c3cae6", "#8f98bd", "#1b2238"
    yn = y / y.max()
    fig, ax = plt.subplots(figsize=(10, 4.6), dpi=130, facecolor=SURF)
    ax.set_facecolor(SURF); ax.grid(True, color=GRID, lw=0.8)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.tick_params(colors=MUTED, length=0)
    ax.set_axisbelow(True)
    # rainbow under the curve: a colour strip clipped to the area below the spectrum
    grad = np.array([wavelength_rgb(w) for w in nm])[None, :, :]
    poly = ax.fill_between(nm, 0, yn, color="none", lw=0)
    im = ax.imshow(grad, extent=(nm.min(), nm.max(), 0, 1.0), aspect="auto", alpha=0.9, zorder=1)
    im.set_clip_path(poly.get_paths()[0], transform=ax.transData)
    ax.plot(nm, yn, color=INK, lw=1.2, zorder=3)
    lo, hi = nm.min(), nm.max()
    k = 0
    for name, w in refs.items():
        if lo < w < hi:
            ax.axvline(w, color=MUTED, lw=0.8, ls=(0, (3, 3)))
            ax.text(w, 1.04 + 0.07 * (k % 2), name, rotation=0, ha="center", va="bottom", color=INK2, fontsize=8)
            k += 1
    ax.set_xlim(max(lo, 380), min(hi, 760)); ax.set_ylim(0, 1.22)
    ax.set_xlabel("wavelength (nm)", color=INK2); ax.set_ylabel("relative intensity", color=INK2)
    ax.set_title(title, color=INK, loc="left", fontsize=12, pad=26)
    fig.savefig(out, facecolor=SURF, bbox_inches="tight"); plt.close(fig)


def run(path, cal=None, cfl=False, sun=False, rows=None, vertical=False, out_prefix=None, quiet=False):
    img = Image.open(path)
    y, colour, band = extract(img, rows, vertical)
    if cfl:
        pairs = cfl_calibration(y, colour)
    elif cal:
        pairs = [(float(p), float(n)) for p, n in (c.split(":") for c in cal.split(","))]
    else:
        raise SystemExit("give --cfl or --cal px:nm,px:nm")
    a, b, resid = fit(pairs)
    px = np.arange(len(y))
    nm = a * px + b
    if a < 0:                                  # rainbow was red-on-the-left: flip
        nm, y = nm[::-1], y[::-1]
    prefix = out_prefix or os.path.splitext(path)[0] + "_spectrum"
    with open(prefix + ".csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["wavelength_nm", "intensity"])
        for wl, v in zip(nm, y):
            w.writerow([f"{wl:.2f}", f"{v:.4f}"])
    refs = FRAUNHOFER if sun else CFL_LINES
    plot(nm, y, prefix + ".png", refs, os.path.basename(path) + ("  ·  sunlight / sky" if sun else "  ·  calibrated on Hg/Eu lines"))
    if not quiet:
        print(f"band rows {band[0]}–{band[1]}, dispersion {abs(a):.3f} nm/pixel, fit residuals {np.abs(resid).max():.2f} nm")
        print("wrote", prefix + ".csv", "and", prefix + ".png")
    return nm, y, a, b


def selftest(outdir):
    """Draw a fake phone photo of a fluorescent-lamp spectrum, then recover its lines."""
    rng = np.random.default_rng(0)
    W, H = 1400, 360
    a_true, b_true = -0.26, 780.0             # nm = a·px + b  (red on the LEFT, like many phones)
    px = np.arange(W)
    nm = a_true * px + b_true
    lines = {404.66: 0.25, 435.83: 0.7, 487.7: 0.35, 542.4: 0.45, 546.07: 1.0, 578.0: 0.3, 611.6: 0.8, 631.0: 0.2}
    spec = 0.05 * np.exp(-((nm - 560) / 120) ** 2)
    for w, amp in lines.items():
        spec += amp * np.exp(-0.5 * ((nm - w) / 1.6) ** 2)
    rgb = np.array([wavelength_rgb(w) for w in nm])
    img = np.zeros((H, W, 3))
    prof = np.exp(-0.5 * ((np.arange(H) - 190) / 28) ** 6)[:, None, None]
    img += prof * (spec[None, :, None] * rgb[None, :, :])
    img = np.clip(img / img.max() * 0.95 + rng.normal(0, 0.01, img.shape), 0, 1)
    path = os.path.join(outdir, "synthetic_fluorescent_lamp.png")
    Image.fromarray((img * 255).astype(np.uint8)).save(path)
    got_nm, y, a, b = run(path, cfl=True, out_prefix=os.path.join(outdir, "example_cfl_spectrum"), quiet=True)
    err_a = abs(abs(a) - abs(a_true)) / abs(a_true)
    # locate the recovered 546 and 435 peaks
    ok = True
    for w in (435.83, 546.07, 611.6, 487.7):
        m = (got_nm > w - 6) & (got_nm < w + 6)
        found = got_nm[m][np.argmax(y[m])]
        print(f"  line {w:7.2f} nm → recovered at {found:7.2f} nm")
        ok &= abs(found - w) < 1.0
    print(f"  dispersion error {err_a * 100:.2f} %")
    os.remove(path)
    os.remove(os.path.join(outdir, "example_cfl_spectrum.csv"))
    print("SELFTEST", "PASSED" if ok and err_a < 0.01 else "FAILED")
    return ok


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("photo", nargs="?")
    ap.add_argument("--cfl", action="store_true", help="auto-calibrate on fluorescent-lamp lines")
    ap.add_argument("--cal", help='manual calibration, e.g. "412:435.8,803:546.1"')
    ap.add_argument("--sun", action="store_true", help="label Fraunhofer lines")
    ap.add_argument("--rows", help="band rows y0:y1 (default: auto)")
    ap.add_argument("--vertical", action="store_true", help="the rainbow runs top-to-bottom")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        d = os.path.join(os.path.dirname(os.path.abspath(__file__)), "images")
        os.makedirs(d, exist_ok=True)
        sys.exit(0 if selftest(d) else 1)
    if not a.photo:
        ap.error("give a photo (or --selftest)")
    rows = tuple(int(v) for v in a.rows.split(":")) if a.rows else None
    run(a.photo, a.cal, a.cfl, a.sun, rows, a.vertical)


if __name__ == "__main__":
    main()
