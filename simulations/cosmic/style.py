"""Shared visual identity for every Cosmic Library figure.

A single dark theme keeps the gallery coherent with the website
(``site/assets/css/codex.css``): near-black background, quiet grid, light
typography and five accent colours used in a fixed order.

    ice     #7cc8ff   primary series, cool / approaching / "model"
    flame   #ff7a3d   second series, hot / thrust / "warning"
    nebula  #b18cff   third series
    aurora  #4ef0b8   fourth series, "good" / recovered signal
    sol     #ffc24b   fifth series, the Sun / highlights

Helpers here also save figures to ``outputs/`` (git-ignored) and, for the
README gallery, to ``media/sims/`` with a size budget.
"""

from __future__ import annotations

import io
import os
from pathlib import Path

import matplotlib

if os.environ.get("MPLBACKEND") is None:
    matplotlib.use("Agg")

import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.colors import LinearSegmentedColormap  # noqa: E402

# ----------------------------------------------------------------------------
# palette
# ----------------------------------------------------------------------------
ICE = "#7cc8ff"
FLAME = "#ff7a3d"
NEBULA = "#b18cff"
AURORA = "#4ef0b8"
SOL = "#ffc24b"
PALETTE = [ICE, FLAME, NEBULA, AURORA, SOL]

BG = "#04050a"          # page background (matches the site's theme-color)
PANEL = "#0a0d18"       # axes background
TEXT = "#e8ecf6"
TEXT_2 = "#aab3c8"
MUTED = "#6c7690"
FAINT = "#262c3d"
GRID = "#1a2030"

REPO = Path(__file__).resolve().parents[2]
OUTPUTS = REPO / "outputs"
MEDIA = REPO / "media" / "sims"

# sequential "heat" map: night -> nebula -> flame -> sol -> white-hot
HEAT = LinearSegmentedColormap.from_list(
    "codex_heat",
    ["#0b0f1f", "#2a1846", "#6b2a6e", "#c2423f", FLAME, SOL, "#fff4d6"],
)
# sequential "ice" map: night -> deep blue -> ice -> white
ICEMAP = LinearSegmentedColormap.from_list(
    "codex_ice", ["#050814", "#0e2244", "#1f4f8a", ICE, "#e9f6ff"]
)

_FONT_STACK = ["Inter", "Space Grotesk", "Helvetica Neue", "Arial", "DejaVu Sans"]


def _available_fonts():
    from matplotlib import font_manager

    names = {f.name for f in font_manager.fontManager.ttflist}
    return [f for f in _FONT_STACK if f in names] or ["DejaVu Sans"]


def apply() -> None:
    """Install the Cosmic Library rcParams (idempotent)."""
    plt.rcParams.update(
        {
            "figure.facecolor": BG,
            "savefig.facecolor": BG,
            "axes.facecolor": PANEL,
            "axes.edgecolor": FAINT,
            "axes.labelcolor": TEXT_2,
            "axes.titlecolor": TEXT,
            "axes.titleweight": "semibold",
            "axes.titlesize": 12,
            "axes.titlelocation": "left",
            "axes.titlepad": 10,
            "axes.labelsize": 10,
            "axes.grid": True,
            "axes.prop_cycle": matplotlib.cycler(color=PALETTE),
            "axes.spines.top": False,
            "axes.spines.right": False,
            "grid.color": GRID,
            "grid.linewidth": 0.6,
            "grid.alpha": 1.0,
            "xtick.color": MUTED,
            "ytick.color": MUTED,
            "xtick.labelcolor": TEXT_2,
            "ytick.labelcolor": TEXT_2,
            "xtick.labelsize": 9,
            "ytick.labelsize": 9,
            "text.color": TEXT,
            "font.family": "sans-serif",
            "font.sans-serif": _available_fonts(),
            "mathtext.fontset": "dejavusans",
            "legend.frameon": False,
            "legend.fontsize": 9,
            "legend.labelcolor": TEXT_2,
            "lines.linewidth": 2.0,
            "lines.solid_capstyle": "round",
            "figure.dpi": 100,
            "savefig.dpi": 150,
        }
    )


def header(fig, title: str, subtitle: str = "", x: float = 0.035, y: float = 0.965) -> None:
    """Large left-aligned title with a muted subtitle line."""
    from matplotlib.transforms import ScaledTranslation

    fig.text(x, y, title, fontsize=17, fontweight="bold", color=TEXT, va="top")
    if subtitle:
        shift = ScaledTranslation(0, -27 / 72, fig.dpi_scale_trans)
        fig.text(x, y, subtitle, fontsize=10, color=TEXT_2, va="top",
                 transform=fig.transFigure + shift)


def footer(fig, source: str, note: str = "") -> None:
    """Small signature line: which script made the figure and the key reference."""
    fig.text(0.035, 0.018, f"cosmic-library  ·  {source}", fontsize=7.5, color=MUTED, va="bottom")
    if note:
        fig.text(0.965, 0.018, note, fontsize=7.5, color=MUTED, va="bottom", ha="right")


def outpath(name: str, outdir: str | os.PathLike | None = None) -> Path:
    d = Path(outdir) if outdir else OUTPUTS
    d.mkdir(parents=True, exist_ok=True)
    return d / name


def save(fig, name: str, outdir=None, showcase: bool = False, max_kb: int = 690, dpi=None) -> Path:
    """Save ``fig`` as PNG to outputs/ (and media/sims/ if ``showcase``).

    PNGs larger than ``max_kb`` are palette-quantised (256 colours, dithered),
    which is visually lossless for these dark, smooth figures.
    """
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi or plt.rcParams["savefig.dpi"], facecolor=fig.get_facecolor())
    plt.close(fig)
    return save_png_bytes(buf.getvalue(), name, outdir=outdir, showcase=showcase, max_kb=max_kb)


def save_png_bytes(data: bytes, name: str, outdir=None, showcase=False, max_kb=690) -> Path:
    from PIL import Image

    img = Image.open(io.BytesIO(data)).convert("RGB")
    return save_image(img, name, outdir=outdir, showcase=showcase, max_kb=max_kb)


def save_image(img, name: str, outdir=None, showcase=False, max_kb=690) -> Path:
    """Save a PIL image, shrinking it under ``max_kb`` if it is a showcase image."""
    from PIL import Image

    def encode(im):
        b = io.BytesIO()
        im.save(b, format="PNG", optimize=True)
        return b.getvalue()

    data = encode(img)
    if showcase and len(data) > max_kb * 1024:
        for colors in (256, 192, 128):
            q = img.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
            data = encode(q)
            if len(data) <= max_kb * 1024:
                break
    path = outpath(name, outdir)
    path.write_bytes(data)
    if showcase:
        MEDIA.mkdir(parents=True, exist_ok=True)
        (MEDIA / name).write_bytes(data)
    return path


def glow_line(ax, x, y, color, lw=2.0, layers=4, alpha=1.0, zorder=3, **kw):
    """Draw a line with a soft neon halo (a few wide, faint strokes underneath)."""
    for i in range(layers, 0, -1):
        ax.plot(x, y, color=color, lw=lw * (1 + 2.2 * i), alpha=alpha * 0.05, zorder=zorder,
                solid_capstyle="round")
    return ax.plot(x, y, color=color, lw=lw, alpha=alpha, zorder=zorder + 0.1, **kw)


def starfield(ax, n=400, seed=7, extent=None, alpha=0.8):
    """Sprinkle faint background stars on an axes (purely decorative)."""
    import numpy as np

    rng = np.random.default_rng(seed)
    x0, x1 = extent[:2] if extent else ax.get_xlim()
    y0, y1 = extent[2:] if extent else ax.get_ylim()
    xs = rng.uniform(x0, x1, n)
    ys = rng.uniform(y0, y1, n)
    s = rng.pareto(3.0, n) * 1.2 + 0.2
    ax.scatter(xs, ys, s=s, c="white", alpha=alpha * rng.uniform(0.15, 0.8, n), lw=0, zorder=0)


apply()
