"""Accessibility audit with axe-core in headless Chromium.

Usage:
    npm run build && npx vite preview --port 4173 &
    python3 tools/a11y-audit.py [--url http://localhost:4173/]

Checks the app against WCAG 2.2 A and AA rules (axe-core tags wcag2a,
wcag2aa, wcag21a, wcag21aa, wcag22aa) in several states: the first visit
with its intro, a dive step with its card open, every module, each dialog
(About, Map, Glossary, a quiz), the living key and the scale slider, a
phone-sized view, dark mode, and the guide website's pages. Exits non-zero if
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
    ("heart scan with its probe control", "?dive=circulatory&step=heart-scan", None, DESKTOP),
    ("phone: heart scan", "?dive=circulatory&step=heart-scan", "card", PHONE),
    ("reflex: knee jerk", "?dive=reflex&step=reflex-arc", None, DESKTOP),
    ("reflex: spinal cord", "?dive=reflex&step=spinal-cord", None, DESKTOP),
    ("digestive: absorbing cell", "?dive=digestive&step=enterocyte", None, DESKTOP),
    ("urinary: nephron", "?dive=urinary&step=nephron", None, DESKTOP),
    ("urinary: the filter", "?dive=urinary&step=filtration-barrier", None, DESKTOP),
    ("endocrine: follicle cell", "?dive=endocrine&step=follicle-cell", None, DESKTOP),
    ("skin: block of skin", "?dive=skin&step=skin-block", None, DESKTOP),
    ("eye: the eye", "?dive=eye&step=eye", None, DESKTOP),
    ("ear: hair cell", "?dive=ear&step=hair-cell", None, DESKTOP),
    ("pancreas: islet", "?dive=pancreas&step=islet", None, DESKTOP),
    ("liver: lobule", "?dive=liver&step=lobule", None, DESKTOP),
    ("smell: epithelium", "?dive=smell&step=olfactory-epithelium", None, DESKTOP),
    ("reflex: nerve meets muscle", "?dive=reflex&step=neuromuscular-junction", None, DESKTOP),
    ("About dialog", "?dive=skeletal&step=femur", "#about-button", DESKTOP),
    ("Map dialog", "?dive=skeletal&step=femur", "#atlas-button", DESKTOP),
    ("Glossary dialog", "?dive=skeletal&step=femur", "#glossary-button", DESKTOP),
    ("Quiz dialog", "?dive=nervous&step=neurotransmitter", "quiz", DESKTOP),
    ("dive menu open", "?dive=skeletal&step=femur", "#dive-button", DESKTOP),
    ("search results open", "?dive=skeletal&step=femur", "type:heart", DESKTOP),
    ("search with no results", "?dive=skeletal&step=femur", "type:zzzz", DESKTOP),
    ("phone: neuron", "?dive=nervous&step=neuron", None, PHONE),
    ("phone: card lowered", "?dive=circulatory&step=heart", "card", PHONE),
    ("phone: card raised", "?dive=circulatory&step=heart", "card:raise", PHONE),
    ("tablet: card", "?dive=circulatory&step=heart", "card", (820, 1180)),
    ("phone: About dialog", "?dive=skeletal&step=femur", "#about-button", PHONE),
    ("heart, pointing at a key entry", "?dive=circulatory&step=heart", "hover:.key__item", DESKTOP),
    ("scale slider focused", "?dive=circulatory&step=heart", "focus:#gauge", DESKTOP),
]
# The same chart on slate (dark mode).
DARK = [
    ("dark: first visit (intro)", "", None, DESKTOP),
    ("dark: heart with its key", "?dive=circulatory&step=heart", None, DESKTOP),
    ("dark: heart scan", "?dive=circulatory&step=heart-scan", None, DESKTOP),
    ("dark: About dialog", "?dive=skeletal&step=femur", "#about-button", DESKTOP),
    ("dark: phone femur", "?dive=skeletal&step=femur", None, PHONE),
]
# The guide website, in both modes and at phone width.
GUIDE = [
    ("guide: landing", "guide/", "light", DESKTOP),
    ("guide: landing, pointing at a dive", "guide/", "light:hover:.key__item", DESKTOP),
    ("guide: landing, slate", "guide/", "dark", DESKTOP),
    ("guide: equations", "guide/equations.html", "light", DESKTOP),
    ("guide: state of the model, slate", "guide/state-of-the-model.html", "dark", DESKTOP),
    ("guide: changelog, phone", "guide/changelog.html", "light", PHONE),
    ("guide: landing, phone, slate", "guide/", "dark", PHONE),
    ("guide: falling through the plates", "guide/", "light:scroll:0.45", DESKTOP),
    ("guide: falling, phone, slate", "guide/", "dark:scroll:0.8", PHONE),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:4173/")
    ap.add_argument("--json", default="", help="also write the full results to this file")
    ap.add_argument("--browser", default=None, help="path to a Chromium executable, if Playwright's own is not installed")
    args = ap.parse_args()
    axe_src = AXE.read_text()
    failures = 0
    report = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=args.browser, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        runs = [(n, q, a, v, "light", True) for n, q, a, v in STATES]
        runs += [(n, q, a, v, "dark", True) for n, q, a, v in DARK]
        for n, path, mode, v in GUIDE:
            scheme, _, action = mode.partition(":")
            runs.append((n, path, action or None, v, scheme, False))
        for name, query, action, (w, h), scheme, is_app in runs:
            # bypass_csp lets the audit inject axe; the app itself keeps its strict CSP.
            page = browser.new_page(viewport={"width": w, "height": h}, bypass_csp=True, color_scheme=scheme)
            if is_app:
                # env=0 skips the studio reflections, which only slow software rendering here.
                page.goto(args.url + query + ("&" if "?" in query else "?") + "env=0")
                page.wait_for_function("document.getElementById('app').dataset.ready === 'true'", timeout=60000)
                page.wait_for_timeout(2500)
            else:
                page.goto(args.url + query, wait_until="load")
            if action and action.startswith("card"):
                # Below the wide layout cards open on a tap; open the step's card as that would.
                page.evaluate("(() => { const a = window.__anatomyOdyssey; a.openCard(a.state.path[a.state.stepIndex].card); })()")
                if action == "card:raise":
                    page.click("#panel-handle")
            elif action == "quiz":
                page.locator(".card__quiz, button:has-text('Check yourself')").first.click()
            elif action and action.startswith("type:"):
                page.fill("#search-input", action[5:])
                page.keyboard.press("ArrowDown")
            elif action and action.startswith("hover:"):
                page.locator(action[6:]).nth(1).hover()
            elif action and action.startswith("scroll:"):
                # Part way down the guide's fall, once its plates have handed over.
                page.evaluate("(q) => { const t = document.querySelector('.fall__track'); scrollTo(0, t.getBoundingClientRect().top + scrollY + q * (t.offsetHeight - innerHeight)); }", float(action[7:]))
                page.wait_for_timeout(1200)
            elif action and action.startswith("focus:"):
                page.focus(action[6:])
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
