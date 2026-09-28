/* Space Weather, live: small dependency-free SVG charts.
 * Conventions: thin 2px lines, recessive grid, labelled axes with units, text in text colours
 * (never the series colour), crosshair + tooltip on hover, arrow keys for keyboard users.
 */
const NS = "http://www.w3.org/2000/svg";
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const TZ = { mode: "local" };

export function fmtTime(ms, withDay = true) {
  if (!isFinite(ms)) return "—";
  const d = new Date(ms);
  const o = { hour: "2-digit", minute: "2-digit", hour12: false };
  if (withDay) Object.assign(o, { weekday: "short", day: "numeric", month: "short" });
  if (TZ.mode === "utc") o.timeZone = "UTC";
  return d.toLocaleString("en-GB", o) + (TZ.mode === "utc" ? " UTC" : "");
}
function dayStart(ms) {
  const d = new Date(ms);
  if (TZ.mode === "utc") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function hourOf(ms) { const d = new Date(ms); return TZ.mode === "utc" ? d.getUTCHours() : d.getHours(); }
function timeTicks(x0, x1, iw = 800) {
  const span = x1 - x0, out = [];
  const step = span > 4 * 86400000 ? 86400000 : span > 36 * 3600000 ? 12 * 3600000 : span > 12 * 3600000 ? 6 * 3600000 : 3 * 3600000;
  for (let t = dayStart(x0); t <= x1; t += 3600000) {
    const h = hourOf(t);
    if (t < x0) continue;
    if (step === 86400000 ? h === 0 : h % (step / 3600000) === 0) {
      const lab = h === 0 ? new Date(t).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: TZ.mode === "utc" ? "UTC" : undefined })
        : String(h).padStart(2, "0") + ":00";
      out.push({ t, lab, major: h === 0 });
    }
  }
  // thin crowded labels: short day labels, then every other tick
  const gap = iw / Math.max(1, out.length);
  if (gap < 62) for (const k of out) if (k.major) k.lab = String(new Date(k.t).toLocaleDateString("en-GB", { day: "numeric", timeZone: TZ.mode === "utc" ? "UTC" : undefined }));
  if (gap < 30) out.forEach((k, i) => { if (i % 2) k.lab = ""; });
  return out;
}
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};
function nearest(data, t) {
  let lo = 0, hi = data.length - 1;
  if (hi < 0) return -1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (data[m][0] < t) lo = m; else hi = m; }
  return Math.abs(data[lo][0] - t) <= Math.abs(data[hi][0] - t) ? lo : hi;
}

/* ------------------------------------------------------------------ tooltip */
let tipEl = null;
export function tip(html, x, y) {
  tipEl = tipEl || document.getElementById("tip");
  if (!tipEl) return;
  if (html == null) { tipEl.hidden = true; return; }
  tipEl.innerHTML = html;
  tipEl.hidden = false;
  const r = tipEl.getBoundingClientRect();
  let left = x + 14, top = y - r.height - 12;
  if (left + r.width > innerWidth - 8) left = x - r.width - 14;
  if (top < 8) top = y + 16;
  tipEl.style.left = Math.max(8, left) + "px"; tipEl.style.top = top + "px";
}

/* ------------------------------------------------------------------ time-series line chart */
export function lineChart(host, cfg) {
  host._cfg = cfg;
  if (!host._ro) { host._ro = new ResizeObserver(() => draw(host)); host._ro.observe(host); }
  draw(host);
  return host;
}
function draw(host) {
  const cfg = host._cfg;
  const W = Math.max(260, host.clientWidth), H = cfg.h || 140;
  const m = { l: 46, r: cfg.rpad || 14, t: cfg.y.label ? 20 : 10, b: 24 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  host.innerHTML = "";
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "sw-svg", role: "img", tabindex: "0", "aria-label": cfg.aria || "" }, host);
  const { x0, x1 } = cfg;
  const Y = cfg.y;
  const ly = (v) => (Y.log ? Math.log10(Math.max(v, 1e-12)) : v);
  const y0 = ly(Y.min), y1 = ly(Y.max);
  const sx = (t) => m.l + (t - x0) / (x1 - x0) * iw;
  const sy = (v) => m.t + ih - (ly(v) - y0) / (y1 - y0) * ih;
  const clampY = (v) => Math.max(Y.min, Math.min(Y.max, v));
  const g = el("g", {}, svg);
  // bands (e.g. flare classes)
  for (const b of cfg.bands || []) {
    const ya = sy(Math.min(Y.max, b.y1)), yb = sy(Math.max(Y.min, b.y0));
    el("rect", { x: m.l, y: ya, width: iw, height: Math.max(0, yb - ya), class: "sw-band " + (b.cls || "") }, g);
    if (b.label) { const t = el("text", { x: W - m.r + 2, y: (ya + yb) / 2 + 4, class: "sw-band-lbl" }, g); t.textContent = b.label; }
  }
  // grid + y ticks
  for (const v of Y.ticks) {
    const y = sy(v);
    el("line", { x1: m.l, x2: m.l + iw, y1: y, y2: y, class: "sw-grid" }, g);
    const t = el("text", { x: m.l - 7, y: y + 4, class: "sw-tick", "text-anchor": "end" }, g);
    t.textContent = Y.fmt ? Y.fmt(v) : v;
  }
  if (Y.label) { const t = el("text", { x: m.l - 7, y: 9, class: "sw-axis-lbl", "text-anchor": "end" }, g); t.textContent = Y.label; }
  // x ticks
  for (const k of timeTicks(x0, x1, iw)) {
    const x = sx(k.t);
    el("line", { x1: x, x2: x, y1: m.t, y2: m.t + ih, class: k.major ? "sw-grid sw-grid-x" : "sw-grid sw-grid-x minor" }, g);
    const t = el("text", { x, y: H - 6, class: "sw-tick", "text-anchor": "middle" }, g);
    t.textContent = k.lab;
  }
  for (const h of cfg.hlines || []) {
    const y = sy(h.y);
    el("line", { x1: m.l, x2: m.l + iw, y1: y, y2: y, class: "sw-hline " + (h.cls || "") }, g);
    if (h.label) { const t = el("text", { x: m.l + 6, y: y - 5, class: "sw-hline-lbl" }, g); t.textContent = h.label; }
  }
  if (cfg.nowT && cfg.nowT > x0 && cfg.nowT <= x1) {
    const x = sx(cfg.nowT);
    el("line", { x1: x, x2: x, y1: m.t, y2: m.t + ih, class: "sw-now-line" }, g);
  }
  // series
  const clipId = "c" + Math.random().toString(36).slice(2, 8);
  const cp = el("clipPath", { id: clipId }, svg); el("rect", { x: m.l, y: m.t, width: iw, height: ih }, cp);
  const sg = el("g", { "clip-path": `url(#${clipId})` }, svg);
  for (const s of cfg.series) {
    const d = s.data.filter((p) => isFinite(p[1]) && p[0] >= x0 - 6e5 && p[0] <= x1 + 6e5);
    if (!d.length) continue;
    const gap = s.gap || 30 * 60000;
    let path = "", area = "", pos = "", neg = "", started = false, segStart = 0;
    const zero = sy(Math.max(Y.min, Math.min(Y.max, 0)));
    for (let i = 0; i < d.length; i++) {
      const x = sx(d[i][0]), y = sy(clampY(d[i][1]));
      const brk = i > 0 && d[i][0] - d[i - 1][0] > gap;
      if (!started || brk) {
        if (started && s.area) area += `L${sx(d[i - 1][0]).toFixed(1)},${(m.t + ih).toFixed(1)}Z`;
        path += `M${x.toFixed(1)},${y.toFixed(1)}`; started = true; segStart = x;
        if (s.area) area += `M${x.toFixed(1)},${(m.t + ih).toFixed(1)}L${x.toFixed(1)},${y.toFixed(1)}`;
      } else {
        path += `L${x.toFixed(1)},${y.toFixed(1)}`;
        if (s.area) area += `L${x.toFixed(1)},${y.toFixed(1)}`;
      }
      if (s.signed && i > 0 && !brk) {
        const xa = sx(d[i - 1][0]), ya = sy(clampY(d[i - 1][1]));
        const quad = `M${xa.toFixed(1)},${zero.toFixed(1)}L${xa.toFixed(1)},${ya.toFixed(1)}L${x.toFixed(1)},${y.toFixed(1)}L${x.toFixed(1)},${zero.toFixed(1)}Z`;
        if ((d[i][1] + d[i - 1][1]) / 2 < 0) neg += quad; else pos += quad;
      }
    }
    if (s.area && started) area += `L${sx(d[d.length - 1][0]).toFixed(1)},${(m.t + ih).toFixed(1)}Z`;
    if (s.area) el("path", { d: area, class: "sw-area", style: `--c:${s.color}` }, sg);
    if (s.signed) { el("path", { d: neg, class: "sw-area sw-neg" }, sg); el("path", { d: pos, class: "sw-area sw-pos" }, sg); }
    el("path", { d: path, class: "sw-line " + (s.cls || ""), style: `--c:${s.color}` }, sg);
  }
  // annotations (flare peaks)
  for (const a of cfg.annotations || []) {
    if (a.t < x0 || a.t > x1) continue;
    const x = sx(a.t), y = sy(clampY(a.y));
    el("circle", { cx: x, cy: y, r: 3, class: "sw-ann-dot" }, svg);
    const t = el("text", { x, y: y - 8, class: "sw-ann", "text-anchor": "middle" }, svg);
    t.textContent = a.text;
  }
  // crosshair layer
  const ch = el("g", { class: "sw-cross", visibility: "hidden" }, svg);
  const vline = el("line", { y1: m.t, y2: m.t + ih, class: "sw-cross-line" }, ch);
  const dots = cfg.series.map(() => el("circle", { r: 4, class: "sw-cross-dot" }, ch));
  const hit = el("rect", { x: m.l, y: 0, width: iw, height: H, fill: "transparent" }, svg);
  const main = cfg.series[0] ? cfg.series[0].data.filter((p) => isFinite(p[1])) : [];
  let idx = -1;
  function show(t, fromGroup, cx, cy) {
    if (!main.length) return;
    const i = nearest(main, t);
    if (i < 0) return;
    idx = i;
    const tt = main[i][0];
    if (tt < x0 || tt > x1) { hide(true); return; }
    const x = sx(tt);
    ch.setAttribute("visibility", "visible");
    vline.setAttribute("x1", x); vline.setAttribute("x2", x);
    const vals = cfg.series.map((s, k) => {
      const d = s.data, j = nearest(d, tt);
      const v = j >= 0 && Math.abs(d[j][0] - tt) < (s.gap || 1.8e6) ? d[j][1] : NaN;
      if (isFinite(v)) { dots[k].setAttribute("cx", x); dots[k].setAttribute("cy", sy(clampY(v))); dots[k].setAttribute("visibility", "visible"); dots[k].style.setProperty("--c", s.color); }
      else dots[k].setAttribute("visibility", "hidden");
      return v;
    });
    if (!fromGroup) {
      const r = svg.getBoundingClientRect();
      const px = cx !== undefined ? cx : r.left + x * r.width / W, py = cy !== undefined ? cy : r.top + m.t + 10;
      tip(cfg.tip ? cfg.tip(tt, vals) : `<b>${fmtTime(tt)}</b>`, px, py);
      if (cfg.group) cfg.group.forEach((h) => h !== host && h._show && h._show(tt));
    }
  }
  function hide(fromGroup) {
    ch.setAttribute("visibility", "hidden");
    if (!fromGroup) { tip(null); if (cfg.group) cfg.group.forEach((h) => h !== host && h._hide && h._hide()); }
  }
  host._show = (t) => show(t, true); host._hide = () => hide(true);
  hit.addEventListener("pointermove", (e) => {
    const r = svg.getBoundingClientRect();
    const x = (e.clientX - r.left) * W / r.width;
    show(x0 + (x - m.l) / iw * (x1 - x0), false, e.clientX, e.clientY);
  });
  hit.addEventListener("pointerleave", () => hide(false));
  svg.addEventListener("keydown", (e) => {
    if (!main.length || (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "End" && e.key !== "Home")) return;
    e.preventDefault();
    const stepN = e.shiftKey ? 12 : 1;
    if (idx < 0) idx = main.length - 1;
    else if (e.key === "ArrowLeft") idx = Math.max(0, idx - stepN);
    else if (e.key === "ArrowRight") idx = Math.min(main.length - 1, idx + stepN);
    else if (e.key === "Home") idx = 0; else idx = main.length - 1;
    show(main[idx][0], false);
  });
  svg.addEventListener("blur", () => hide(false));
}

/* ------------------------------------------------------------------ Kp bars */
export function barChart(host, cfg) {
  host._cfg = cfg;
  if (!host._ro) { host._ro = new ResizeObserver(() => drawBars(host)); host._ro.observe(host); }
  drawBars(host);
}
function drawBars(host) {
  const cfg = host._cfg;
  const W = Math.max(260, host.clientWidth), H = cfg.h || 220;
  const narrow = W < 520;
  const m = { l: 34, r: narrow ? 30 : 60, t: 22, b: 26 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  host.innerHTML = "";
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "sw-svg", role: "img", tabindex: "0", "aria-label": cfg.aria || "" }, host);
  const { x0, x1 } = cfg;
  const sx = (t) => m.l + (t - x0) / (x1 - x0) * iw;
  const sy = (v) => m.t + ih - v / 9 * ih;
  for (let v = 0; v <= 9; v++) {
    const y = sy(v);
    if (v % 1 === 0) el("line", { x1: m.l, x2: m.l + iw, y1: y, y2: y, class: "sw-grid" + (v % 3 ? " minor" : "") }, svg);
    const t = el("text", { x: m.l - 8, y: y + 4, class: "sw-tick", "text-anchor": "end" }, svg); t.textContent = v;
  }
  // storm thresholds, labelled on the right
  for (const [v, l] of [[5, "G1"], [6, "G2"], [7, "G3"], [8, "G4"], [9, "G5"]]) {
    const y = sy(v - 0.33);
    el("line", { x1: m.l, x2: m.l + iw, y1: y, y2: y, class: "sw-hline sw-g" }, svg);
    const t = el("text", { x: m.l + iw + 6, y: y + 4, class: "sw-hline-lbl" }, svg); t.textContent = narrow ? l : l + " " + ["minor", "moderate", "strong", "severe", "extreme"][v - 5];
  }
  const ax = el("text", { x: m.l - 8, y: 10, class: "sw-axis-lbl", "text-anchor": "end" }, svg); ax.textContent = "Kp";
  for (const k of timeTicks(x0, x1, iw)) {
    if (!k.major && (x1 - x0) > 4 * 86400000) continue;
    const x = sx(k.t);
    el("line", { x1: x, x2: x, y1: m.t, y2: m.t + ih, class: "sw-grid sw-grid-x" + (k.major ? "" : " minor") }, svg);
    const t = el("text", { x: x + 4, y: H - 7, class: "sw-tick" }, svg); t.textContent = k.lab;
  }
  if (cfg.nowT) {
    const x = sx(cfg.nowT);
    el("line", { x1: x, x2: x, y1: m.t - 4, y2: m.t + ih, class: "sw-now-line" }, svg);
    const t = el("text", { x: x + 4, y: m.t + 8, class: "sw-now-lbl" }, svg); t.textContent = "now";
  }
  const bars = [];
  cfg.bars.forEach((b, i) => {
    if (b.t1 < x0 || b.t0 > x1) return;
    const xa = sx(Math.max(x0, b.t0)) + 1, xb = sx(Math.min(x1, b.t1)) - 1;
    const v = Math.max(0.25, b.v);
    const y = sy(v), h = m.t + ih - y;
    const r = Math.min(4, (xb - xa) / 2, h);
    // rounded top, square base
    const d = `M${xa},${m.t + ih}V${y + r}Q${xa},${y} ${xa + r},${y}H${xb - r}Q${xb},${y} ${xb},${y + r}V${m.t + ih}Z`;
    const p = el("path", { d, class: `sw-bar k-${b.band}${b.fc ? " fc" : ""}` }, svg);
    bars.push({ p, b, cx: (xa + xb) / 2 });
  });
  const hit = el("rect", { x: m.l, y: 0, width: iw, height: H, fill: "transparent" }, svg);
  let cur = -1;
  function show(i, cx, cy) {
    bars.forEach((o, k) => o.p.classList.toggle("hi", k === i));
    cur = i;
    if (i < 0) { tip(null); return; }
    const o = bars[i];
    const r = svg.getBoundingClientRect();
    tip(cfg.tip(o.b), cx !== undefined ? cx : r.left + o.cx * r.width / W, cy !== undefined ? cy : r.top + 20);
  }
  hit.addEventListener("pointermove", (e) => {
    const r = svg.getBoundingClientRect(); const x = (e.clientX - r.left) * W / r.width;
    let best = -1, bd = 1e9;
    bars.forEach((o, k) => { const d = Math.abs(o.cx - x); if (d < bd) { bd = d; best = k; } });
    show(best, e.clientX, e.clientY);
  });
  hit.addEventListener("pointerleave", () => show(-1));
  svg.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    if (cur < 0) cur = bars.findIndex((o) => o.b.fc) - 1;
    show(Math.max(0, Math.min(bars.length - 1, cur + (e.key === "ArrowRight" ? 1 : -1))));
  });
  svg.addEventListener("blur", () => show(-1));
}

/* ------------------------------------------------------------------ NOAA scale gauge (0–5) */
export function gauge(host, { letter, name, value, max24, fc, words }) {
  const segs = 5, a0 = -200, a1 = 20;                  // degrees, arc from lower-left to lower-right
  const cx = 110, cy = 104, R = 82;
  const pt = (a, r) => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)];
  const arc = (aa, ab, r) => { const [x0, y0] = pt(aa, r), [x1, y1] = pt(ab, r); return `M${x0.toFixed(1)},${y0.toFixed(1)}A${r},${r} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)}`; };
  const aOf = (v) => a0 + (a1 - a0) * (v / segs);
  let segsSvg = "";
  for (let i = 0; i < segs; i++) {
    const on = value >= i + 1;
    segsSvg += `<path d="${arc(aOf(i) + 1.6, aOf(i + 1) - 1.6, R)}" class="sw-gseg s${i + 1}${on ? " on" : ""}"/>`;
    const [tx, ty] = pt(aOf(i + 0.5), R - 22);
    segsSvg += `<text x="${tx.toFixed(1)}" y="${(ty + 4).toFixed(1)}" class="sw-gnum" text-anchor="middle">${i + 1}</text>`;
  }
  const mx = isFinite(max24) && max24 > 0 ? (() => { const [x0, y0] = pt(aOf(Math.min(5, max24)), R - 10), [x1, y1] = pt(aOf(Math.min(5, max24)), R + 12); return `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" class="sw-gmax"/>`; })() : "";
  const v = isFinite(value) ? value : 0;
  host.innerHTML = `
    <svg viewBox="0 0 220 150" class="sw-gauge-svg" role="img" aria-label="${esc(name)}: ${letter}${v} ${esc(words[v])}">
      <path d="${arc(a0, a1, R)}" class="sw-gtrack"/>${segsSvg}${mx}
      <g class="sw-needle" style="transform: rotate(${aOf(0) + 90}deg)" data-to="${aOf(v === 0 ? 0.06 : v - 0.5) + 90}">
        <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - R + 18}"/><circle cx="${cx}" cy="${cy}" r="6"/>
      </g>
    </svg>
    <div class="sw-gval"><b class="lv-${v}">${letter}${v}</b><span>${esc(words[v])}</span></div>
    <div class="sw-gname">${esc(name)}</div>
    <div class="sw-gfc">${fc || ""}</div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const n = host.querySelector(".sw-needle");
    if (n) n.style.transform = `rotate(${n.dataset.to}deg)`;
  }));
}
