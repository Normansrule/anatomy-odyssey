"""Tiny S-expression reader/writer for KiCad files.

KiCad stores schematics (.kicad_sch), boards (.kicad_pcb), symbol libraries
(.kicad_sym) and footprints (.kicad_mod) as S-expressions:

    (kicad_sch (version 20230121) (generator eeschema) ...)

This module turns that text into nested Python lists and back again.
Quoted strings are kept as `QStr` so we can write them back with quotes;
every other atom (numbers, keywords) is a plain `str`.

No third-party dependencies: it is deliberately small so you can read it.
"""

from __future__ import annotations


class QStr(str):
    """A string that was (or must be) written with double quotes."""


def tokenize(text: str):
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c in " \t\r\n":
            i += 1
        elif c in "()":
            yield c
            i += 1
        elif c == '"':
            j = i + 1
            buf = []
            while j < n:
                if text[j] == "\\" and j + 1 < n:
                    buf.append(text[j:j + 2])
                    j += 2
                    continue
                if text[j] == '"':
                    break
                buf.append(text[j])
                j += 1
            raw = "".join(buf)
            # un-escape \" and \\ ; keep \n as literal two characters (KiCad does too)
            yield QStr(raw.replace('\\"', '"').replace("\\\\", "\\"))
            i = j + 1
        else:
            j = i
            while j < n and text[j] not in ' \t\r\n()"':
                j += 1
            yield text[i:j]
            i = j


def parse(text: str):
    """Parse one S-expression (the whole file) into nested lists."""
    stack: list[list] = [[]]
    for tok in tokenize(text):
        if tok == "(" and not isinstance(tok, QStr):
            stack.append([])
        elif tok == ")" and not isinstance(tok, QStr):
            done = stack.pop()
            stack[-1].append(done)
        else:
            stack[-1].append(tok)
    if len(stack) != 1:
        raise ValueError("unbalanced parentheses")
    top = stack[0]
    return top[0] if len(top) == 1 else top


def _atom(a) -> str:
    if isinstance(a, QStr):
        return '"' + a.replace("\\", "\\\\").replace('"', '\\"') + '"'
    if isinstance(a, bool):
        return "yes" if a else "no"
    if isinstance(a, float):
        s = f"{a:.6f}".rstrip("0").rstrip(".")
        return "0" if s in ("-0", "") else s
    return str(a)


# lists whose children are short enough to keep on one line
_INLINE = {"at", "xy", "size", "font", "effects", "stroke", "fill", "length", "offset",
           "pts", "start", "end", "mid", "center", "width", "type", "color", "diameter",
           "justify", "uuid", "lib_id", "unit", "in_bom", "on_board", "dnp", "exclude_from_sim",
           "number", "name", "reference", "page", "layers", "drill", "net", "thickness",
           "roundrect_rratio", "version", "generator", "paper", "radius", "tstamp", "layer",
           "hide", "pin_names", "pin_numbers", "property", "path", "rect_delta"}


def dumps(node, indent: int = 0) -> str:
    """Serialise nested lists back to KiCad-style text."""
    if not isinstance(node, list):
        return _atom(node)
    if not node:
        return "()"
    head = node[0]
    simple = all(not isinstance(x, list) for x in node)
    if simple or (isinstance(head, str) and head in _INLINE and _depth(node) <= 3):
        return "(" + " ".join(dumps(x) for x in node) + ")"
    pad = "  " * (indent + 1)
    parts = []
    line = "(" + dumps(head)
    for x in node[1:]:
        if isinstance(x, list):
            parts.append(line)
            line = pad + dumps(x, indent + 1)
        else:
            line += " " + _atom(x)
    parts.append(line)
    return "\n".join(parts) + "\n" + "  " * indent + ")"


def _depth(node) -> int:
    if not isinstance(node, list):
        return 0
    return 1 + max((_depth(x) for x in node), default=0)


# ---------- helpers for querying ----------

def find(node, key):
    """First child list whose head is `key`, or None."""
    for x in node:
        if isinstance(x, list) and x and x[0] == key:
            return x
    return None


def find_all(node, key):
    return [x for x in node if isinstance(x, list) and x and x[0] == key]


def walk(node):
    """Yield every list in the tree (depth first)."""
    if isinstance(node, list):
        yield node
        for x in node:
            yield from walk(x)
