#!/usr/bin/env node
/* Build docs/USER_GUIDE.md from site/data/help.json (the same file the "?" help panel reads).
 *
 *   node scripts/build_user_guide.mjs           write docs/USER_GUIDE.md
 *   node scripts/build_user_guide.mjs --check   validate help.json against the site, write nothing
 *
 * --check fails (exit 1) when:
 *   - a page in the PAGES list of site/assets/js/codex.js has no help.json entry (or vice versa),
 *   - an entry lacks a required field, uses an unknown icon or data kind,
 *   - "related" names a page that is not in PAGES,
 *   - a low-graphics switch names a URL parameter or saved setting the page's own scripts never read,
 *   - a page binds the "?" key itself but is missing from OWN_QKEY in codex.js (the global shortcut would clash),
 *   - a page file listed in PAGES does not exist.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");
const LIVE = "https://normansrule.github.io/cosmic-library/";
const REPO = "https://github.com/Normansrule/cosmic-library";
const CHECK = process.argv.includes("--check");
const SHOT_NAME = { index: "home-fly" };           // screenshot file names that differ from the page id
const shotFile = (id) => SHOT_NAME[id] || id;

/* ---------- inputs ---------- */
const codex = readFileSync(join(SITE, "assets/js/codex.js"), "utf8");
const m = /var PAGES = (\[[\s\S]*?\n  \]);/.exec(codex);
if (!m) { console.error("Could not find the PAGES array in codex.js"); process.exit(1); }
const PAGES = JSON.parse(m[1]);                       // [id, label, file, group, description]
const byId = Object.fromEntries(PAGES.map((p) => [p[0], p]));
const ownQ = /var OWN_QKEY = \{([^}]*)\}/.exec(codex);
const OWN_QKEY = new Set(ownQ ? [...ownQ[1].matchAll(/([a-z-]+)\s*:/g)].map((x) => x[1]) : []);
const help = JSON.parse(readFileSync(join(SITE, "data/help.json"), "utf8"));
const H = help.pages || {};

const ICONS = new Set(["drag", "rdrag", "scroll", "click", "dblclick", "tap", "dtap", "hold", "tdrag", "twodrag", "pinch"]);
const KINDS = { live: "Live data", simulated: "Simulation", computed: "Calculated in your browser" };
const ICON_WORD = { drag: "Drag", rdrag: "Right-drag", scroll: "Scroll wheel", click: "Click", dblclick: "Double-click", tap: "Tap", dtap: "Double-tap", hold: "Press and hold", tdrag: "One-finger drag", twodrag: "Two-finger drag", pinch: "Pinch" };

/* ---------- page sources (HTML + the scripts it loads, + sibling modules) ---------- */
function pageSources(p) {
  const file = join(SITE, p[2]);
  if (!existsSync(file)) return null;
  const html = readFileSync(file, "utf8");
  const js = new Set();
  for (const s of html.matchAll(/<script[^>]+src="(assets\/js\/[^"]+\.js)"/g)) if (!s[1].endsWith("codex.js")) js.add(s[1]);
  const jsDir = join(SITE, "assets/js");
  for (const f of readdirSync(jsDir)) if (f === p[0] + ".js" || f.startsWith(p[0] + "-")) js.add("assets/js/" + f);
  // follow one level of relative imports
  for (const f of [...js]) {
    const src = existsSync(join(SITE, f)) ? readFileSync(join(SITE, f), "utf8") : "";
    for (const im of src.matchAll(/from\s+["']\.\/([\w-]+\.js)["']/g)) js.add("assets/js/" + im[1]);
  }
  const code = [...js].filter((f) => existsSync(join(SITE, f))).map((f) => readFileSync(join(SITE, f), "utf8")).join("\n");
  return { html, code };
}

/* ---------- check ---------- */
function check() {
  const errs = [], warns = [];
  const E = (id, msg) => errs.push(`${id}: ${msg}`);
  for (const p of PAGES) if (!H[p[0]]) E(p[0], "no entry in site/data/help.json");
  for (const id of Object.keys(H)) if (!byId[id]) E(id, "help.json entry for a page that is not in PAGES");
  for (const p of PAGES) {
    const id = p[0], e = H[id];
    const src = pageSources(p);
    if (!src) (CHECK ? E : (i, msg) => warns.push(`${i}: ${msg}`))(id, `page file ${p[2]} does not exist`);
    if (!e) continue;
    for (const k of ["title", "what", "try", "controls", "data", "slow", "phone", "related"]) if (e[k] == null) E(id, `missing "${k}"`);
    if (e.try && (e.try.length < 2 || e.try.length > 5)) E(id, `"try" should have 2–5 steps (has ${e.try.length})`);
    for (const g of ["mouse", "touch", "keyboard"]) {
      for (const r of (e.controls && e.controls[g]) || []) {
        if (!r.do) E(id, `${g} row without "do"`);
        if (g === "keyboard" ? !(Array.isArray(r.keys) && r.keys.length) : !ICONS.has(r.icon)) E(id, `${g} row "${r.do}" has a bad ${g === "keyboard" ? "keys list" : `icon "${r.icon}"`}`);
      }
    }
    if (e.data && !KINDS[e.data.kind]) E(id, `unknown data.kind "${e.data.kind}"`);
    if (e.phone && !["yes", "partly"].includes(e.phone.level)) E(id, `phone.level must be yes or partly`);
    for (const r of e.related || []) if (!byId[r]) E(id, `related page "${r}" is not in PAGES`);
    const low = e.slow && e.slow.low;
    if (low && src) {
      for (const k of Object.keys(low.set || {})) {
        const re = new RegExp(`(get|has)\\(\\s*["']${k}["']\\s*\\)`);
        if (!re.test(src.code)) E(id, `low-graphics URL parameter "${k}" is never read by the page's scripts`);
      }
      for (const k of Object.keys(low.store || {})) if (!src.code.includes(`'${k}'`) && !src.code.includes(`"${k}"`)) E(id, `low-graphics saved setting "${k}" is never read by the page's scripts`);
      if (!low.set && !low.store) E(id, `slow.low needs "set" or "store"`);
    }
    if (src && /key\s*===\s*["']\?["']/.test(src.code) && !OWN_QKEY.has(id)) E(id, `the page binds "?" itself: add it to OWN_QKEY in codex.js`);
    for (const k of ["hint", "hintTouch"]) if (e[k] && !/\?/.test(e[k])) warns.push(`${id}: ${k} does not mention "?"`);
    if (e.hintTouch && !e.hint) E(id, `"hintTouch" without "hint"`);
    if (existsSync(join(ROOT, "media/screens", shotFile(id) + ".jpg")) || existsSync(join(ROOT, "media/readme/tiles", id + ".svg"))) { /* has a picture */ }
    else warns.push(`${id}: no media/screens/${id}.jpg or media/readme/tiles/${id}.svg for the guide`);
  }
  for (const w of warns) console.warn("warn  " + w);
  if (errs.length) { for (const x of errs) console.error("FAIL  " + x); console.error(`\n${errs.length} problem(s) in site/data/help.json`); process.exit(1); }
  console.log(`help.json OK: ${PAGES.length} pages, every entry complete, related pages and low-graphics switches verified.`);
}

/* ---------- markdown ---------- */
const kbdMd = (k) => {
  if (k.length > 2 && k.indexOf("+") > 0) return k.split("+").map((x) => `<kbd>${x}</kbd>`).join(" + ");
  const r = /^(.+)–(.+)$/.exec(k); if (r) return `<kbd>${r[1]}</kbd>–<kbd>${r[2]}</kbd>`;
  return `<kbd>${k.replace(/\|/g, "\\|")}</kbd>`;
};
const cell = (s) => String(s).replace(/\|/g, "\\|");
const slug = (s) => s.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
function lowText(e) {
  const l = e.slow && e.slow.low; if (!l) return "";
  if (l.set) return "Low graphics link: [`?" + Object.entries(l.set).map(([k, v]) => `${k}=${v}`).join("&") + "`](" + LIVE + "__FILE__?" + Object.entries(l.set).map(([k, v]) => `${k}=${v}`).join("&") + ")";
  return "";
}

function build() {
  const groups = [["Fly", "Launch, land and design rockets.", "fly"], ["Explore", "Live data and 3D worlds, from satellites to galaxies.", "explore"], ["Learn", "Courses, equations, pictures, history and documents.", "learn"], ["Build", "Hands-on experiments you can make.", "build"]];
  const home = PAGES.find((p) => p[0] === "index");
  const md = [];
  md.push("<!-- Generated by scripts/build_user_guide.mjs from site/data/help.json. Edit those, not this file. -->");
  if (existsSync(join(ROOT, "media/readme/sections/start-here.svg"))) md.push(`<p align="center"><img src="../media/readme/sections/start-here.svg" alt="Start here: where to begin with Cosmic Library" width="100%"></p>`, "");
  md.push("# Cosmic Library user guide", "");
  md.push(`Cosmic Library is a free website about space: simulations you can fly, live data you can explore, and lessons you can learn from. You need nothing but a web browser. **[Open it ↗](${LIVE})**`, "");
  md.push("## The basics", "");
  md.push("- **Press the <kbd>?</kbd> button** at the top right of any page (or the <kbd>?</kbd> key) for that page's controls and tips (and, on the heavier 3D pages, a *Switch to low graphics* button).");
  md.push("- **3D pages:** drag to look around, scroll or pinch to zoom. Each page's exact controls are below.");
  md.push("- **Slow?** Use *Switch to low graphics* in the help panel where there is one, close other tabs, and plug in your laptop. See the [FAQ](FAQ.md#its-slow).");
  md.push("- **Blank or black page?** Your browser's graphics acceleration (Web Graphics Library, WebGL) is probably off. See the [FAQ](FAQ.md#the-page-is-blank-or-black).");
  md.push("- **No account, no tracking.** A few pages remember settings on your own device. See [privacy](FAQ.md#privacy).", "");
  md.push("## Contents", "");
  md.push(`- [${home[1]}](#${slug(H.index.title)})`);
  for (const [g, blurb] of groups) {
    const ps = PAGES.filter((p) => p[3] === g);
    md.push(`- **${g}** · ${blurb}`);
    for (const p of ps) md.push(`  - [${H[p[0]].title}](#${slug(H[p[0]].title)}): ${p[4]}`);
  }
  md.push(`- [Questions? Read the FAQ](FAQ.md)`, "");

  const entry = (p, level = "###") => {
    const e = H[p[0]], out = [];
    out.push(`${level} ${e.title}`, "");
    const shot = existsSync(join(ROOT, "media/screens", shotFile(p[0]) + ".jpg")) ? `../media/screens/${shotFile(p[0])}.jpg` : existsSync(join(ROOT, "media/readme/tiles", p[0] + ".svg")) ? `../media/readme/tiles/${p[0]}.svg` : null;
    const url = LIVE + (p[2] === "index.html" ? "" : p[2]);
    if (shot) out.push(`<a href="${url}"><img src="${shot}" alt="${e.title}" width="360" align="right"></a>`, "");
    out.push(`**[▶ Open it](${url})** · ${e.what}`, "");
    out.push("**Try this first**", "");
    e.try.forEach((t, i) => out.push(`${i + 1}. ${t}`));
    out.push("");
    const c = e.controls || {};
    const rows = [];
    for (const r of c.mouse || []) rows.push(["Mouse", ICON_WORD[r.icon], r.do]);
    for (const r of c.touch || []) rows.push(["Touch", ICON_WORD[r.icon], r.do]);
    for (const r of c.keyboard || []) rows.push(["Keyboard", r.keys.map(kbdMd).join(" "), r.do]);
    if (rows.length) {
      out.push('<br clear="right">', "", "| | Do this | To |", "|---|---|---|");
      let lastG = "";
      for (const [g, how, what] of rows) { out.push(`| ${g === lastG ? "" : "**" + g + "**"} | ${how} | ${cell(what)} |`); lastG = g; }
      out.push("");
    }
    const d = e.data;
    out.push(`- **${KINDS[d.kind]}.** ${d.text}${d.offline ? " *Offline:* " + d.offline : ""}`);
    const lt = lowText(e).replace("__FILE__", p[2] === "index.html" ? "" : p[2]);
    out.push(`- **If it's slow:** ${e.slow.text}${lt ? " " + lt + "." : ""}`);
    const pt = String(e.phone.text || "").replace(/^yes[.;:,]?\s*/i, "");   // the level already says "yes"
    out.push(`- **On a phone:** ${e.phone.level === "yes" ? "yes" : "partly"}. ${pt ? pt[0].toUpperCase() + pt.slice(1) : ""}`.trimEnd());
    if (e.related && e.related.length) out.push(`- **Next:** ${e.related.map((r) => `[${H[r].title}](#${slug(H[r].title)})`).join(" · ")}`);
    out.push("", '<br clear="right">', "");
    return out.join("\n");
  };

  md.push("---", "", entry(home, "##"));
  for (const [g, blurb, art] of groups) {
    md.push("---", "");
    if (existsSync(join(ROOT, `media/readme/sections/${art}.svg`))) md.push(`<p align="center"><img src="../media/readme/sections/${art}.svg" alt="${g}" width="100%"></p>`, "");
    md.push(`## ${g}`, "", blurb, "");
    for (const p of PAGES.filter((q) => q[3] === g)) md.push(entry(p));
  }
  md.push("---", "", "Found a mistake? [Report a wrong fact](" + REPO + "/issues/new?template=factual-error.md) or [report a problem](" + REPO + "/issues/new). Questions: [FAQ](FAQ.md).", "");
  writeFileSync(join(ROOT, "docs/USER_GUIDE.md"), md.join("\n"));
  console.log(`wrote docs/USER_GUIDE.md (${PAGES.length} pages)`);
}

if (CHECK) check(); else { check(); build(); }
