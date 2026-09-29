#!/usr/bin/env node
/* Generate docs/EQUATIONS.md from site/data/equations.json.
 *
 *   node scripts/build_equations_md.mjs
 *
 * The Markdown edition uses GitHub's math support: $$ … $$ display blocks and
 * $` … `$ inline math. Worked-example results are computed with the same code
 * as the website (site/assets/js/equations-core.js), so the two cannot drift.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "../site/assets/js/equations-core.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(ROOT, "site/data/equations.json"), "utf8"));
const K = core.makeScope(data.constants);
const NUM = core.numbering(data);
const SITE = "https://normansrule.github.io/cosmic-library/equations.html";

/* Markdown turns "\," "\;" "\!" "\ " and "\\" into escapes in some renderers.
   Rewrite them as control words so the LaTeX survives any Markdown pass. */
function safeTex(s) {
  return s
    .replace(/\\\\/g, " \\cr ")
    .replace(/\\,/g, "\\thinspace ")
    .replace(/\\;/g, "\\thickspace ")
    .replace(/\\!/g, "\\negthinspace ")
    .replace(/\\ (?=[^ ])/g, "~")
    .replace(/\s+/g, " ")
    .trim();
}
const inl = s => "$`" + safeTex(s) + "`$";
const rich = t => String(t || "").split("$").map((p, i) => (i % 2 ? inl(p) : p)).join("");
const cell = t => String(t).replace(/\|/g, "\\|");

function constText(c) {
  if (c.key === "G") return "6.674 30 × 10⁻¹¹";
  const v = c.value, a = Math.abs(v);
  const group = s => { const [i, f] = s.split("."); return i.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (f ? "." + f.replace(/(\d{3})(?=\d)/g, "$1 ") : ""); };
  if (a >= 1e6 && Number.isInteger(v) && a < 1e12) return group(String(v));
  if (a >= 1e6 || a < 1e-3) { const [m, e] = v.toExponential().split("e"); return `${group(m)} × 10${core.sup(+e)}`; }
  return group(String(v));
}

const L = [];
const out = s => L.push(s);
const eqs = data.equations;

out('<p align="center"><a href="' + SITE + '"><img src="../media/readme/sub/equations.svg" alt="The Equation Atlas: equations orbiting a glowing nucleus" width="100%"></a></p>');
out("");
out("# The Equation Atlas");
out("");
out(`> ${eqs.length} equations of space science and spaceflight, each with a symbol legend, a plain-language meaning and a worked example with real numbers. The [interactive edition](${SITE}) adds a live calculator and plot for every one.`);
out(">");
out("> *This file is generated from [`site/data/equations.json`](../site/data/equations.json) by [`scripts/build_equations_md.mjs`](../scripts/build_equations_md.mjs). Every worked-example result is recomputed and checked by [`scripts/check_equations.mjs`](../scripts/check_equations.mjs). Edit the JSON, not this file.*");
out("");
out("Acronyms are written out in full the first time they appear on each card. Values of physical constants follow the Committee on Data of the International Science Council (CODATA) 2018 and the International Astronomical Union (IAU) 2015 nominal values — see [Constants](#constants).");
out("");
out("## Contents");
out("");
for (const ch of data.chapters) {
  out(`${ch.n}. [${ch.title}](#ch-${ch.id})`);
  for (const e of eqs.filter(x => x.chapter === ch.id)) out(`   - [${NUM[e.id]} ${e.title}](#${e.id})`);
}
out(`${data.chapters.length + 1}. [Constants](#constants)`);
out("");

for (const ch of data.chapters) {
  out("---");
  out("");
  out(`<a id="ch-${ch.id}"></a>`);
  out("");
  out(`## ${ch.n}. ${ch.title}`);
  out("");
  out(ch.blurb);
  out("");
  for (const e of eqs.filter(x => x.chapter === ch.id)) {
    const ex = e.example;
    const run = core.compile(e, K);
    const res = core.evaluate(e, run, core.displayValues(e, ex.set), K).shown[ex.answer.out];
    const o = e.calc.outputs.find(x => x.id === ex.answer.out);
    const f = core.formatOutput(o, res, "text");

    out(`<a id="${e.id}"></a>`);
    out("");
    out(`### ${NUM[e.id]} ${e.title}`);
    out("");
    if (e.aka) { out(`*${e.aka}*`); out(""); }
    out("$$");
    out(safeTex(e.latex));
    out("$$");
    out("");
    out("| Symbol | Meaning | Unit |");
    out("|:--|:--|:--|");
    for (const l of e.legend) out(`| ${inl(l.sym)} | ${cell(rich(l.desc))} | ${cell(l.unit)} |`);
    out("");
    out(`**What it means.** ${rich(e.meaning)}`);
    out("");
    out(`**Worked example — ${ex.title}** ${rich(ex.text)}`);
    out("");
    out("$$");
    out(safeTex(ex.steps));
    out("$$");
    out("");
    out(`**Result: ${`${f.num} ${f.unit}`.trim()}** ${/^[—–-]/.test(ex.answer.text) ? "" : "— "}${rich(ex.answer.text)}`);
    out("");
    out(`[Open the live calculator ↗](${SITE}#${e.id}) · Sources: ${e.refs.map(r => `[${r.label}](${r.url})`).join(" · ")}`);
    out("");
  }
}

out("---");
out("");
out(`<a id="constants"></a>`);
out("");
out("## Constants");
out("");
out("Every calculator uses these values. “Exact” values are definitions of the International System of Units (SI) or of the IAU.");
out("");
out("| Symbol | Quantity | Value | Unit | Source |");
out("|:--|:--|--:|:--|:--|");
let group = "";
for (const c of data.constants) {
  if (c.group !== group) { group = c.group; out(`| **${group}** | | | | |`); }
  out(`| ${inl(c.sym)} | ${cell(c.name)} | ${constText(c)} | ${cell(c.unit)} | ${cell(c.source)} |`);
}
out("");
out("Sources: " + data.constantSources.map(s => `[${s.label}](${s.url})`).join(" · "));
out("");

writeFileSync(join(ROOT, "docs/EQUATIONS.md"), L.join("\n"));
console.log(`docs/EQUATIONS.md: ${eqs.length} equations, ${L.length} lines`);
