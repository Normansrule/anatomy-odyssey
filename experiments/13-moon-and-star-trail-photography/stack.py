#!/usr/bin/env python3
"""Stack night-sky photos: star trails, noise reduction, and aligned Moon stacks.

    python3 stack.py trails  frames/*.jpg -o trails.jpg            # lighten (max) blend
    python3 stack.py trails  frames/*.jpg -o comet.jpg --fade 0.97 # "comet" trails that fade
    python3 stack.py mean    frames/*.jpg -o clean.png --dark darks/*.jpg
    python3 stack.py median  frames/*.jpg -o no_planes.png         # removes aeroplanes/satellites
    python3 stack.py moon    moon/*.jpg   -o moon.png --sharpen 1.2 # align on the Moon, then mean
    python3 stack.py --selftest

Modes
  trails : output = max over frames (the "lighten" blend). Each star paints its arc.
  mean   : average → random noise falls as 1/√N  (N frames ⇒ √N better signal-to-noise)
  median : like mean but rejects outliers (aircraft, satellites, hot pixels)
  moon   : register every frame to the first with FFT phase correlation (whole-pixel shift),
           then average; optional unsharp mask
Options
  --dark   : dark frames (lens cap on, same exposure/ISO/temperature) averaged and subtracted
Requires: numpy, pillow.
"""
import argparse, glob, os, sys
import numpy as np
from PIL import Image, ImageFilter


def load(path):
    return np.asarray(Image.open(path).convert("RGB")).astype(np.float32) / 255.0


def save(arr, path):
    Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)).save(path)


def phase_shift(ref, img):
    """(dy, dx) that best aligns img onto ref, by phase correlation (Kuglin & Hines 1975)."""
    a, b = ref.mean(2), img.mean(2)
    wy, wx = np.hanning(a.shape[0])[:, None], np.hanning(a.shape[1])[None, :]
    A, B = np.fft.fft2(a * wy * wx), np.fft.fft2(b * wy * wx)
    R = A * np.conj(B)
    R /= np.abs(R) + 1e-12
    r = np.fft.ifft2(R).real
    dy, dx = np.unravel_index(np.argmax(r), r.shape)
    if dy > a.shape[0] // 2: dy -= a.shape[0]
    if dx > a.shape[1] // 2: dx -= a.shape[1]
    return int(dy), int(dx)


def stack(mode, paths, dark=None, fade=None, sharpen=0.0, verbose=True):
    if not paths:
        raise SystemExit("no input frames")
    dark_frame = np.mean([load(p) for p in dark], axis=0) if dark else 0.0
    ref = None
    frames, acc, n = [], None, 0
    for i, p in enumerate(paths):
        f = load(p) - dark_frame
        if mode == "moon":
            if ref is None:
                ref = f
            else:
                dy, dx = phase_shift(ref, f)
                f = np.roll(f, (dy, dx), axis=(0, 1))
                if verbose:
                    print(f"  {os.path.basename(p)}: shift {dy:+d}, {dx:+d} px")
        if mode == "median":
            frames.append(f)
        elif acc is None:
            acc = f.copy()
        elif mode == "trails":
            acc = np.maximum(acc * (fade if fade else 1.0), f)
        else:
            acc += f
        n += 1
    if mode == "median":
        out = np.median(np.stack(frames), axis=0)
    elif mode in ("mean", "moon"):
        out = acc / n
    else:
        out = acc
    if sharpen > 0:
        img = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))
        img = img.filter(ImageFilter.UnsharpMask(radius=2, percent=int(100 * sharpen), threshold=2))
        out = np.asarray(img).astype(np.float32) / 255.0
    return out


def selftest(outdir):
    rng = np.random.default_rng(3)
    H, W = 300, 480
    tmp = os.path.join(outdir, "_selftest")
    os.makedirs(tmp, exist_ok=True)
    ok = True
    # 1) star trails: 90 frames, stars rotate about a pole at 15.04°/hour, 60 s per frame (1.5 h → 22.6°)
    n_st = 700
    stars = np.column_stack([rng.uniform(-520, 520, n_st), rng.uniform(-520, 520, n_st), rng.uniform(0.15, 1, n_st) ** 2])
    pole = np.array([80.0, 240.0])       # (y, x) of the celestial pole in the image
    paths = []
    for k in range(90):
        ang = np.radians(15.041 / 3600 * 60 * k)
        img = np.full((H, W, 3), 0.03, np.float32) + rng.normal(0, 0.01, (H, W, 3)).astype(np.float32)
        for sy, sx, b in stars:
            y = pole[0] + sy * np.cos(ang) - sx * np.sin(ang)
            x = pole[1] + sy * np.sin(ang) + sx * np.cos(ang)
            if 1 <= y < H - 1 and 1 <= x < W - 1:
                img[int(y), int(x)] += b
                img[int(y) - 1:int(y) + 2, int(x) - 1:int(x) + 2] += 0.25 * b   # a little glow
        p = os.path.join(tmp, f"trail_{k:02d}.png"); save(img, p); paths.append(p)
    trails = stack("trails", paths, verbose=False)
    bright = (trails.mean(2) > 0.25).sum()
    single = (load(paths[0]).mean(2) > 0.25).sum()
    print(f"  trails: lit pixels one frame {single}, stacked {bright} (arcs ≈ {bright / max(single, 1):.1f}× longer)")
    ok &= bright > 5 * single
    save(trails, os.path.join(outdir, "example_trails.png"))
    # 2) moon: 16 noisy, jittered frames → align + mean
    yy, xx = np.mgrid[0:H, 0:W]
    moon = ((yy - 150) ** 2 + (xx - 240) ** 2 < 90 ** 2).astype(np.float32) * 0.6
    moon += 0.25 * np.sin(xx / 7.0) * np.cos(yy / 9.0) * (moon > 0)          # "craters"
    moon = np.repeat(moon[:, :, None], 3, 2)
    shifts, paths = [], []
    for k in range(16):
        dy, dx = rng.integers(-9, 10, 2)
        f = 0.2 + np.roll(moon, (dy, dx), axis=(0, 1)) + rng.normal(0, 0.06, moon.shape)
        p = os.path.join(tmp, f"moon_{k:02d}.png"); save(f, p); paths.append(p); shifts.append((dy, dx))
    out = stack("moon", paths, verbose=False)
    ref = 0.2 + np.roll(moon, shifts[0], axis=(0, 1))
    noise_one = np.std(load(paths[0]) - ref)
    noise_st = np.std(out - ref)
    print(f"  moon: noise one frame {noise_one:.3f}, 16-frame aligned stack {noise_st:.3f} "
          f"(gain {noise_one / noise_st:.1f}×, ideal √16 = 4×)")
    ok &= noise_one / noise_st > 3.0
    for p in glob.glob(os.path.join(tmp, "*")):
        os.remove(p)
    os.rmdir(tmp)
    print("SELFTEST", "PASSED" if ok else "FAILED")
    return ok


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mode", nargs="?", choices=["trails", "mean", "median", "moon"])
    ap.add_argument("frames", nargs="*")
    ap.add_argument("-o", "--out", default="stacked.png")
    ap.add_argument("--dark", nargs="*")
    ap.add_argument("--fade", type=float, help="comet-style trails: multiply the running max by this each frame (0.95–0.99)")
    ap.add_argument("--sharpen", type=float, default=0.0)
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        d = os.path.join(os.path.dirname(os.path.abspath(__file__)), "images")
        os.makedirs(d, exist_ok=True)
        sys.exit(0 if selftest(d) else 1)
    if not a.mode:
        ap.error("choose a mode")
    paths = sorted(p for pat in a.frames for p in glob.glob(pat))
    darks = sorted(p for pat in (a.dark or []) for p in glob.glob(pat))
    out = stack(a.mode, paths, darks, a.fade, a.sharpen)
    save(out, a.out)
    print(f"stacked {len(paths)} frames ({a.mode}) → {a.out}")


if __name__ == "__main__":
    main()
