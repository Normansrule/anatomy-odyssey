"""Cursor, hand, fingertip and keycap glyphs shared by the buttons, the how-to strips and banners.

All are drawn with their hot spot at (0, 0) so they can be moved with a translate.
"""
from common import f

# classic arrow pointer, tip at 0,0 (about 13 x 20)
ARROW_D = "M0 0V17.5L4.3 13.4L7.1 19.8L9.8 18.6L7.1 12.4H12.8Z"
# pointing hand, fingertip at 0,0 (about 23 x 28)
HAND_D = ("M-2.7 13V2.7A2.7 2.7 0 0 1 2.7 2.7V11.2A2.1 2.1 0 0 1 6.8 11.6A2.1 2.1 0 0 1 10.9 12.4"
          "A2.1 2.1 0 0 1 14.9 13.6V20.2Q14.9 27.6 8.2 27.6H1.6Q-2.6 27.6 -4.9 23.4L-8.7 16.8"
          "A2 2 0 0 1 -5.4 14.5L-2.7 17.2Z")
HAND_LINES = "M2.7 11.3V15.6M6.8 11.7V15.8M10.9 12.5V16"


def arrow(fill="#ffffff", stroke="#04050a", sw=1.3, extra=""):
    return f'<path d="{ARROW_D}" fill="{fill}" stroke="{stroke}" stroke-width="{f(sw)}" stroke-linejoin="round"{extra}/>'


def hand(fill="#ffffff", stroke="#04050a", sw=1.3):
    return (f'<path d="{HAND_D}" fill="{fill}" stroke="{stroke}" stroke-width="{f(sw)}" stroke-linejoin="round"/>'
            f'<path d="{HAND_LINES}" stroke="{stroke}" stroke-opacity=".45" stroke-width="{f(sw * .8)}" stroke-linecap="round" fill="none"/>')


def finger(r=7, col="#ffffff"):
    """A fingertip seen from above: soft disc with a ring."""
    return (f'<circle r="{f(r + 5)}" fill="{col}" opacity=".14"/><circle r="{f(r)}" fill="{col}" fill-opacity=".85" '
            f'stroke="#04050a" stroke-opacity=".5"/>')


def keycap(label, w=34, h=32, col="#e9edff", size=17, mono=True, cls=""):
    """A keyboard key drawn with its top-left at (0, 0); the cap sits on a darker base."""
    c = f' class="{cls}"' if cls else ""
    fam = "mono" if mono else "sans"
    return (f'<rect y="4" width="{w}" height="{h}" rx="7" fill="#1a2036" stroke="#96aaff" stroke-opacity=".3"/>'
            f'<g{c}><rect width="{w}" height="{h}" rx="7" fill="#2a3252" stroke="{col}" stroke-opacity=".55"/>'
            f'<rect x="3" y="2.5" width="{w - 6}" height="{h - 9}" rx="5" fill="#fff" fill-opacity=".06"/>'
            f'<text x="{f(w / 2)}" y="{f(h / 2 + size * .36)}" text-anchor="middle" class="{fam}" font-size="{size}" '
            f'font-weight="700" fill="{col}">{label}</text></g>')
