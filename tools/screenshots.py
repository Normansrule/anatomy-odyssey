"""Headless screenshot check for every step of every dive and module.

Usage:
    npm run build && npx vite preview --port 4173 &
    python3 tools/screenshots.py [--url http://localhost:4173/] [--out docs/screenshots]

Uses Chromium's software WebGL 2 so it runs without a GPU (the WebGL
fallback path). Fails if the page logs an error or any tier renders blank.
"""
import argparse
import sys
from pathlib import Path

from PIL import Image, ImageStat
from playwright.sync_api import sync_playwright

# (dive, step, extra query) for every tier, plus one side trip per dive that has one.
STEPS = [
    ("skeletal", "body", ""), ("skeletal", "skeleton", ""), ("skeletal", "femur", ""),
    ("skeletal", "bone-tissue", ""), ("skeletal", "osteocyte", ""), ("skeletal", "nucleus", ""), ("skeletal", "dna", ""),
    ("circulatory", "body", ""), ("circulatory", "heart", ""), ("circulatory", "blood", ""),
    ("circulatory", "red-blood-cell", ""), ("circulatory", "hemoglobin", ""), ("circulatory", "heme", ""),
    ("muscular", "muscle", ""), ("muscular", "fascicle", ""), ("muscular", "muscle-fiber", ""),
    ("muscular", "sarcomere", ""), ("muscular", "actin-myosin", ""), ("muscular", "nucleus", "&trip=1"),
    ("immune", "lymph-node", ""), ("immune", "follicle", ""), ("immune", "plasma-cell", ""),
    ("immune", "antibody", ""), ("inflammation", "inflammation", ""), ("inflammation", "mast-cell", ""), ("inflammation", "histamine", ""),
    ("nervous", "body", ""), ("nervous", "brain", ""), ("nervous", "cortex", ""), ("nervous", "neuron", ""), ("nervous", "synapse", ""),
    ("nervous", "neurotransmitter", ""), ("nervous", "lipid-bilayer", "&trip=1"),
    ("respiratory", "body", ""), ("respiratory", "lungs", ""), ("respiratory", "alveoli", ""),
    ("respiratory", "gas-exchange", ""), ("respiratory", "hemoglobin", ""), ("respiratory", "o2-co2", ""),
    ("gene-to-protein", "gene-expression", ""), ("gene-to-protein", "rna", ""), ("gene-to-protein", "amino-acids", ""),
    ("skeletal", "nucleotides", "&trip=1"), ("skeletal", "nuclear-proteins", "&trip=1"), ("muscular", "atp", "&trip=1"),
    ("circulatory", "phospholipids", "&trip=1"),
    ("chemistry", "body-elements", ""), ("chemistry", "carbonic-anhydrase", ""), ("chemistry", "bicarbonate-buffer", ""),
    ("immune-response", "immune-cells", ""), ("immune-response", "immune-memory", ""),
    ("t-cells", "antigen-presentation", ""), ("t-cells", "killer-t-cell", ""), ("t-cells", "tcr-mhc", ""),
    ("t-cells", "amino-acids", "&trip=1"),
    ("reflex", "reflex-arc", ""), ("reflex", "spinal-cord", ""), ("reflex", "neuromuscular-junction", ""), ("reflex", "acetylcholine", ""),
    ("digestive", "body", ""), ("digestive", "small-intestine", ""), ("digestive", "villi", ""), ("digestive", "enterocyte", ""), ("digestive", "glucose", ""),
    ("urinary", "body", ""), ("urinary", "kidney", ""), ("urinary", "nephron", ""), ("urinary", "filtration-barrier", ""), ("urinary", "urea", ""),
    ("endocrine", "body", ""), ("endocrine", "thyroid", ""), ("endocrine", "thyroid-follicles", ""), ("endocrine", "follicle-cell", ""), ("endocrine", "thyroxine", ""),
    ("skin", "body", ""), ("skin", "skin-block", ""), ("skin", "epidermis", ""), ("skin", "sun-and-skin", ""), ("skin", "vitamin-d3", ""),
    ("eye", "body", ""), ("eye", "eye", ""), ("eye", "retina", ""), ("eye", "phototransduction", ""), ("eye", "retinal", ""),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:4173/")
    ap.add_argument("--out", default="docs/screenshots")
    ap.add_argument("--width", type=int, default=1440)
    ap.add_argument("--height", type=int, default=900)
    ap.add_argument("--mobile", action="store_true", help="also capture a 390x844 phone view")
    ap.add_argument("--only", default="", help="only capture dives or steps whose id contains this text")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        sizes = [("desktop", args.width, args.height)]
        if args.mobile:
            sizes.append(("phone", 390, 844))
        for name, w, h in sizes:
            # bypass_csp lets the test harness poll page state; the page itself keeps its strict CSP.
            page = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=1, bypass_csp=True)
            page.on("console", lambda m: m.type == "error" and errors.append(m.text))
            page.on("pageerror", lambda e: errors.append(f"{page.url}: {e}"))
            for dive, step, extra in (s for s in STEPS if not args.only or args.only in s[0] or args.only in s[1]):
                page.goto(f"{args.url}?dive={dive}&step={step}{extra}")
                page.wait_for_function("document.getElementById('app').dataset.ready === 'true'", timeout=60000)
                page.wait_for_timeout(1500)
                path = out / f"{name}-{dive}-{step}.png"
                page.screenshot(path=str(path))
                # Blank-render check: the central region of the screenshot must vary.
                img = Image.open(path).convert("L")
                cx, cy = img.width // 2, img.height // 2
                region = img.crop((cx - 200, cy - 200, cx + 200, cy + 200))
                drawn = int(ImageStat.Stat(region).stddev[0])
                print(f"{name:8s} {dive:13s} {step:15s} center contrast (stddev): {drawn}")
                if drawn < 8:
                    errors.append(f"{name} {dive} {step}: canvas looks blank")
            page.close()
        browser.close()

    if errors:
        print("\nProblems:")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    print("\nAll tiers rendered with no console errors.")


if __name__ == "__main__":
    main()
