"""Accessibility audit with axe-core in headless Chromium.

Usage:
    npm run build && npx vite preview --port 4173 &
    python3 tools/a11y-audit.py [--url http://localhost:4173/]

Checks the app against WCAG 2.2 A and AA rules (axe-core tags wcag2a,
wcag2aa, wcag21a, wcag21aa, wcag22aa) in several states: the first visit
with its intro, a dive step with its card open, every module, each dialog
(About, Map, Glossary, a quiz), and a phone-sized view. Exits non-zero if
axe reports any violation. axe-core is a pinned dev dependency (MPL-2.0); it
is only injected by this test, never shipped with the app.
"""
import argparse
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

AXE = Path("node_modules/axe-core/axe.min.js")
TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]

# (name, query string, action run before the audit, viewport)
DESKTOP = (1440, 900)
PHONE = (390, 844)
STATES = [
    ("first visit (intro)", "", None, DESKTOP),
    ("skeletal femur with card", "?dive=skeletal&step=femur", None, DESKTOP),
    ("circulatory hemoglobin", "?dive=circulatory&step=hemoglobin", None, DESKTOP),
    ("chemistry: elements", "?dive=chemistry&step=body-elements", None, DESKTOP),
    ("chemistry: enzyme", "?dive=chemistry&step=carbonic-anhydrase", None, DESKTOP),
    ("chemistry: buffer", "?dive=chemistry&step=bicarbonate-buffer", None, DESKTOP),
    ("immune response: cells", "?dive=immune-response&step=immune-cells", None, DESKTOP),
    ("immune response: memory", "?dive=immune-response&step=immune-memory", None, DESKTOP),
    ("gene to protein", "?dive=gene-to-protein&step=gene-expression", None, DESKTOP),
    ("nervous: cortex layers", "?dive=nervous&step=cortex", None, DESKTOP),
    ("T cells: presentation", "?dive=t-cells&step=antigen-presentation", None, DESKTOP),
    ("T cells: receptor and peptide", "?dive=t-cells&step=tcr-mhc", None, DESKTOP),
    ("reflex: knee jerk", "?dive=reflex&step=reflex-arc", None, DESKTOP),
    ("reflex: spinal cord", "?dive=reflex&step=spinal-cord", None, DESKTOP),
    ("digestive: absorbing cell", "?dive=digestive&step=enterocyte", None, DESKTOP),
    ("urinary: nephron", "?dive=urinary&step=nephron", None, DESKTOP),
    ("urinary: the filter", "?dive=urinary&step=filtration-barrier", None, DESKTOP),
    ("endocrine: follicle cell", "?dive=endocrine&step=follicle-cell", None, DESKTOP),
    ("skin: block of skin", "?dive=skin&step=skin-block", None, DESKTOP),
    ("reflex: nerve meets muscle", "?dive=reflex&step=neuromuscular-junction", None, DESKTOP),
    ("About dialog", "?dive=skeletal&step=femur", "#about-button", DESKTOP),
    ("Map dialog", "?dive=skeletal&step=femur", "#atlas-button", DESKTOP),
    ("Glossary dialog", "?dive=skeletal&step=femur", "#glossary-button", DESKTOP),
    ("Quiz dialog", "?dive=nervous&step=neurotransmitter", "quiz", DESKTOP),
    ("dive menu open", "?dive=skeletal&step=femur", "#dive-button", DESKTOP),
    ("search results open", "?dive=skeletal&step=femur", "type:heart", DESKTOP),
    ("search with no results", "?dive=skeletal&step=femur", "type:zzzz", DESKTOP),
    ("phone: neuron", "?dive=nervous&step=neuron", None, PHONE),
    ("phone: About dialog", "?dive=skeletal&step=femur", "#about-button", PHONE),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:4173/")
    ap.add_argument("--json", default="", help="also write the full results to this file")
    args = ap.parse_args()
    axe_src = AXE.read_text()
    failures = 0
    report = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        for name, query, action, (w, h) in STATES:
            # bypass_csp lets the audit inject axe; the app itself keeps its strict CSP.
            page = browser.new_page(viewport={"width": w, "height": h}, bypass_csp=True)
            # env=0 skips the studio reflections, which only slow software rendering here.
            page.goto(args.url + query + ("&" if "?" in query else "?") + "env=0")
            page.wait_for_function("document.getElementById('app').dataset.ready === 'true'", timeout=60000)
            page.wait_for_timeout(2500)
            if action == "quiz":
                page.locator(".card__quiz, button:has-text('Check yourself')").first.click()
            elif action and action.startswith("type:"):
                page.fill("#search-input", action[5:])
                page.keyboard.press("ArrowDown")
            elif action:
                page.click(action)
            page.wait_for_timeout(600)
            page.evaluate(axe_src)
            result = page.evaluate(
                "async (tags) => { const r = await axe.run(document, { runOnly: { type: 'tag', values: tags } });"
                " return r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })); }",
                TAGS,
            )
            report[name] = result
            status = "ok" if not result else f"{len(result)} violation(s)"
            print(f"{name:32s} {status}")
            for v in result:
                failures += 1
                print(f"  [{v['impact']}] {v['id']}: {v['help']}")
                for n in v["nodes"][:4]:
                    print(f"      {', '.join(map(str, n['target']))}")
                    print(f"        {n['summary'].splitlines()[-1].strip() if n['summary'] else ''}")
            page.close()
        browser.close()

    if args.json:
        Path(args.json).write_text(json.dumps(report, indent=2))
    if failures:
        print(f"\n{failures} accessibility violation(s).")
        sys.exit(1)
    print("\nNo axe-core violations (WCAG 2.2 A and AA rules) in any state.")


if __name__ == "__main__":
    main()
