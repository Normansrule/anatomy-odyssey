#!/usr/bin/env python3
"""Download every gallery photograph for offline use.

    python3 scripts/fetch_gallery.py                 # fetch anything missing
    python3 scripts/fetch_gallery.py --force         # re-download everything
    python3 scripts/fetch_gallery.py --only earthrise pale-blue-dot
    python3 scripts/fetch_gallery.py --max-size 1600 # downscale (needs Pillow)

For each entry in site/data/gallery.json it tries, in order: `image`, every
`alt` URL, then the NASA Image and Video Library search API with the entry's
`query`. Files land in site/assets/gallery/<id>.<ext>, and
site/data/gallery.local.json is rewritten to list the ones that exist; the
gallery page prefers those local copies.

Standard library only. Pillow is used for optional downscaling if installed.
Network failures are reported and skipped, never fatal.
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SITE = os.path.join(ROOT, "site")
DATA = os.path.join(SITE, "data", "gallery.json")
LOCAL = os.path.join(SITE, "data", "gallery.local.json")
OUT = os.path.join(SITE, "assets", "gallery")
# Wikimedia asks for a descriptive User-Agent: https://meta.wikimedia.org/wiki/User-Agent_policy
UA = "CosmicLibraryGalleryFetcher/1.0 (https://github.com/Normansrule/cosmic-library; educational, non-commercial)"
EXT = {"image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/tiff": ".tif"}


def get(url, timeout=40, retries=2):
    """GET with retries and exponential back-off. Returns (bytes, content-type)."""
    last = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "image/*,application/json;q=0.9,*/*;q=0.5"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                ctype = (r.headers.get("Content-Type") or "").split(";")[0].strip().lower()
                return r.read(), ctype
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (400, 401, 403, 404, 410):
                break  # permanent: do not hammer the server
            if e.code == 429:
                time.sleep(10 * (attempt + 1))
                continue
        except Exception as e:  # timeouts, DNS, TLS, connection resets
            last = e
        time.sleep(1.5 * (2 ** attempt))
    raise RuntimeError(f"{url}: {last}")


def nasa_search(query):
    """First few image candidates from the NASA Image and Video Library API."""
    url = "https://images-api.nasa.gov/search?" + urllib.parse.urlencode({"q": query, "media_type": "image"})
    body, _ = get(url, timeout=30)
    items = json.loads(body.decode("utf-8")).get("collection", {}).get("items", [])
    out = []
    for it in items[:4]:
        for link in it.get("links", []):
            href = link.get("href", "")
            if link.get("render") == "image" or href.lower().endswith((".jpg", ".jpeg", ".png")):
                href = href.replace("http://", "https://", 1)
                out += [href.replace("~thumb.", "~medium."), href]
                break
    return out


def downscale(path, max_size):
    try:
        from PIL import Image
    except ImportError:
        return False
    try:
        with Image.open(path) as im:
            if max(im.size) <= max_size:
                return False
            im.thumbnail((max_size, max_size))
            if im.mode not in ("RGB", "L") and path.endswith(".jpg"):
                im = im.convert("RGB")
            im.save(path, quality=88, optimize=True)
        return True
    except Exception as e:
        print(f"    (could not downscale: {e})")
        return False


def existing(item_id):
    for ext in set(EXT.values()):
        p = os.path.join(OUT, item_id + ext)
        if os.path.exists(p) and os.path.getsize(p) > 1024:
            return p
    return None


def fetch_one(item, force, max_size):
    if not force:
        p = existing(item["id"])
        if p:
            return p, "cached"
    candidates = [u for u in [item.get("image")] + list(item.get("alt") or []) if u]
    tried_search = False
    i = 0
    while True:
        if i >= len(candidates):
            if tried_search or not item.get("query"):
                return None, "no source worked"
            tried_search = True
            try:
                candidates += nasa_search(item["query"])
            except Exception as e:
                return None, f"NASA search failed ({e})"
            if i >= len(candidates):
                return None, "no source worked"
        url = candidates[i]
        i += 1
        try:
            body, ctype = get(url)
        except Exception as e:
            print(f"    ✗ {e}")
            continue
        if not ctype.startswith("image/") or len(body) < 1024:
            print(f"    ✗ {url}: not an image ({ctype or 'unknown type'}, {len(body)} bytes)")
            continue
        ext = EXT.get(ctype, ".jpg")
        path = os.path.join(OUT, item["id"] + ext)
        for old_ext in set(EXT.values()):  # drop stale copies with another extension
            old = os.path.join(OUT, item["id"] + old_ext)
            if old != path and os.path.exists(old):
                os.remove(old)
        with open(path, "wb") as f:
            f.write(body)
        if max_size:
            downscale(path, max_size)
        return path, "search result" if tried_search else ("alt" if i > 1 else "primary")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true", help="re-download files that already exist")
    ap.add_argument("--only", nargs="*", default=None, metavar="ID", help="limit to these gallery ids")
    ap.add_argument("--max-size", type=int, default=2000, help="longest edge in pixels if Pillow is installed (0 = keep original)")
    ap.add_argument("--delay", type=float, default=0.5, help="seconds to wait between photographs (be polite to the servers)")
    a = ap.parse_args()

    with open(DATA, encoding="utf-8") as f:
        items = json.load(f)["items"]
    if a.only:
        wanted = set(a.only)
        unknown = wanted - {it["id"] for it in items}
        if unknown:
            print("Unknown ids:", ", ".join(sorted(unknown)))
        items = [it for it in items if it["id"] in wanted]
    os.makedirs(OUT, exist_ok=True)

    ok, failed = 0, []
    for n, item in enumerate(items, 1):
        print(f"[{n:>2}/{len(items)}] {item['id']}")
        try:
            path, how = fetch_one(item, a.force, a.max_size)
        except Exception as e:  # never let one bad entry stop the run
            path, how = None, f"unexpected error: {e}"
        if path:
            ok += 1
            print(f"    ✓ {os.path.relpath(path, ROOT)} ({how})")
        else:
            failed.append((item["id"], how))
            print(f"    ✗ {how}")
        if how != "cached":
            time.sleep(a.delay)

    # Rewrite the manifest from what is actually on disk (all ids, not only this run's).
    with open(DATA, encoding="utf-8") as f:
        all_ids = [it["id"] for it in json.load(f)["items"]]
    images = {}
    for item_id in all_ids:
        p = existing(item_id)
        if p:
            images[item_id] = os.path.relpath(p, SITE).replace(os.sep, "/")
    manifest = {
        "about": "Written by scripts/fetch_gallery.py. Maps gallery ids to local copies in site/assets/gallery/; the gallery page prefers these.",
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "images": images,
    }
    with open(LOCAL, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")

    print(f"\n{ok} of {len(items)} photographs available locally; manifest lists {len(images)} → {os.path.relpath(LOCAL, ROOT)}")
    if failed:
        print("Could not fetch (the page will fall back to live sources or a placeholder):")
        for item_id, why in failed:
            print(f"  - {item_id}: {why}")
    return 0 if ok or not items else 1


if __name__ == "__main__":
    sys.exit(main())
