/* Cosmic Library shell: navigation, footer, starfield, meteors and small UI
 * behaviours shared by every page. Plain script (no modules) so it runs first
 * and works from file:// too.
 *
 * Usage in a page:
 *   <body data-page="launch">            (optional: class="sim" for full-screen)
 *   <script src="assets/js/codex.js"></script>
 */
(function () {
  "use strict";

  var REPO = "https://github.com/Normansrule/cosmic-library";
  // [id, label, file, group, one-line description]
  var PAGES = [
    ["index", "Home", "index.html", "", ""],
    ["launch", "Saturn V launch", "launch.html", "Fly", "Ride Apollo 11 from the pad to orbit"],
    ["booster", "Booster landing", "booster.html", "Fly", "Land a reusable first stage yourself"],
    ["moon-landing", "Moon landing", "moon-landing.html", "Fly", "Fly the Apollo lunar module down"],
    ["mars-landing", "Mars landing", "mars-landing.html", "Fly", "Seven minutes of terror, step by step"],
    ["shuttle", "Endeavour", "shuttle.html", "Fly", "The Space Shuttle in Los Angeles"],
    ["hangar", "Rocket hangar", "hangar.html", "Fly", "Every major rocket, side by side to scale"],
    ["builder", "Rocket builder", "builder.html", "Fly", "Design a rocket, then fly it to orbit"],
    ["mission-designer", "Mission designer", "mission-designer.html", "Fly", "Plan a real interplanetary mission, end to end"],
    ["earth", "Live Earth orbit", "earth.html", "Explore", "Real satellites, launches and news, live"],
    ["sky", "Night sky", "sky.html", "Explore", "A planetarium for your location, tonight"],
    ["moon", "Moon explorer", "moon.html", "Explore", "Every landing site, phases and eclipses"],
    ["solar-system", "Solar system", "solar-system.html", "Explore", "Every planet where it is today"],
    ["sun", "The Sun", "sun.html", "Explore", "Five wavelengths, flares, and the inside"],
    ["solar-observatory", "Solar observatory", "solar-observatory.html", "Explore", "Today's real Sun from SDO, SOHO and GOES"],
    ["black-hole", "Black hole", "black-hole.html", "Explore", "Light bent through curved spacetime"],
    ["scale", "Cosmic scale", "scale.html", "Explore", "Zoom from a person to the whole universe"],
    ["space-weather", "Space weather", "space-weather.html", "Explore", "Solar wind, storms and aurora, live"],
    ["galaxies", "Galaxy collision", "galaxies.html", "Explore", "Milky Way meets Andromeda"],
    ["surveys", "Sky surveys", "surveys.html", "Explore", "Pan the real sky in a dozen wavelengths"],
    ["dsn", "Deep Space Network", "dsn.html", "Explore", "Which spacecraft are talking to Earth right now"],
    ["academy", "Space Academy", "academy.html", "Learn", "A guided course with quizzes and badges"],
    ["orbits", "Orbit Lab", "orbits.html", "Learn", "Newton, Kepler, Hohmann and Lagrange"],
    ["equations", "Equations", "equations.html", "Learn", "94 equations with live calculators"],
    ["gallery", "Gallery", "gallery.html", "Learn", "Photographs that changed how we see"],
    ["timeline", "Timeline", "timeline.html", "Learn", "1903 to today, every milestone"],
    ["library", "Documents", "library.html", "Learn", "Flight manuals, reports and user guides"],
    ["telescopes", "Use a telescope", "telescopes.html", "Learn", "Free robotic telescopes, live feeds, simulators"],
    ["eyepiece", "Telescope simulator", "eyepiece.html", "Learn", "See what a telescope would really show you"],
    ["experiments", "Experiments", "experiments.html", "Build", "20 builds from $0 to a custom circuit board"]
  ];
  var GROUPS = ["Fly", "Explore", "Learn"];

  var MARK =
    '<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">' +
    '<defs><radialGradient id="cxp" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#e9f6ff"/>' +
    '<stop offset=".45" stop-color="#7cc8ff"/><stop offset="1" stop-color="#3b2a8f"/></radialGradient></defs>' +
    '<ellipse cx="16" cy="16" rx="15" ry="5.2" fill="none" stroke="#b18cff" stroke-width="1.2" transform="rotate(-24 16 16)" opacity=".85"/>' +
    '<circle cx="16" cy="16" r="8" fill="url(#cxp)"/>' +
    '<circle cx="27.5" cy="9.6" r="1.6" fill="#ff7a3d"/></svg>';

  var body = document.body;
  var current = body.getAttribute("data-page") || "";
  var isSim = body.classList.contains("sim");

  /* ---------- nav ---------- */
  var nav = document.createElement("header");
  nav.className = "codex-nav";
  function link(p, cls) {
    return '<a class="' + (cls || "") + '" href="' + p[2] + '"' + (p[0] === current ? ' aria-current="page"' : "") + ">" +
      '<span class="nl">' + p[1] + "</span>" + (p[4] && cls === "item" ? '<span class="nd">' + p[4] + "</span>" : "") + "</a>";
  }
  var curGroup = (PAGES.filter(function (p) { return p[0] === current; })[0] || [])[3] || "";
  var groupsHtml = GROUPS.map(function (g, gi) {
    var items = PAGES.filter(function (p) { return p[3] === g; });
    return '<div class="grp' + (g === curGroup ? " active" : "") + '">' +
      '<button class="grp-btn" aria-expanded="false" aria-controls="cx-g' + gi + '">' + g + '<svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>' +
      '<div class="grp-menu" id="cx-g' + gi + '"><div class="grp-title">' + g + "</div>" + items.map(function (p) { return link(p, "item"); }).join("") + "</div></div>";
  }).join("");
  var exp = PAGES.filter(function (p) { return p[0] === "experiments"; })[0];
  nav.innerHTML =
    '<a class="brand" href="index.html">' + MARK + '<span>Cosmic Library</span></a>' +
    '<button class="nav-toggle" aria-expanded="false" aria-controls="cx-links">Menu</button>' +
    '<nav class="links" id="cx-links" aria-label="Site">' + groupsHtml +
    link(exp, "top" + (current === "experiments" ? " active" : "")) +
    '<a class="top" href="' + REPO + '" rel="noopener"><span class="nl">GitHub ↗</span></a></nav>';
  body.insertBefore(nav, body.firstChild);
  var toggle = nav.querySelector(".nav-toggle");
  toggle.addEventListener("click", function () {
    var open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.textContent = open ? "Close" : "Menu";
  });
  var grpBtns = nav.querySelectorAll(".grp-btn");
  function closeAll(except) {
    grpBtns.forEach(function (b) { if (b !== except) { b.setAttribute("aria-expanded", "false"); b.parentNode.classList.remove("open"); } });
  }
  grpBtns.forEach(function (b) {
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      // A mouse hover already opened it: a click right after should not close it again.
      var open = !b.parentNode.classList.contains("open") || (Date.now() - (b._hoverAt || 0) < 400);
      closeAll(b);
      b.parentNode.classList.toggle("open", open);
      b.setAttribute("aria-expanded", open ? "true" : "false");
    });
    // Hover opens on devices with a real pointer
    b.parentNode.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse" && innerWidth > 1080) { closeAll(b); b._hoverAt = Date.now(); b.parentNode.classList.add("open"); b.setAttribute("aria-expanded", "true"); } });
    b.parentNode.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse" && innerWidth > 1080) { b.parentNode.classList.remove("open"); b.setAttribute("aria-expanded", "false"); } });
  });
  document.addEventListener("click", function () { if (innerWidth > 1080) closeAll(null); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAll(null); });

  /* ---------- footer (atlas pages only) ---------- */
  if (!isSim) {
    var foot = document.createElement("footer");
    foot.className = "codex-footer";
    foot.innerHTML =
      '<div class="shell"><div class="cols">' +
      '<div><h4>Cosmic Library</h4><p class="muted" style="font-size:.88rem">An open atlas of space science and spaceflight: simulations you can touch, the equations behind them, and experiments you can build.</p></div>' +
      GROUPS.concat(["Build"]).map(function (g) {
        return "<div><h4>" + g + "</h4>" + PAGES.filter(function (p) { return p[3] === g; }).map(function (p) { return '<a href="' + p[2] + '">' + p[1] + "</a>"; }).join("") + "</div>";
      }).join("") +
      '<div><h4>Credits</h4><a href="https://www.nasa.gov/nasa-brand-center/images-and-media/">NASA media guidelines</a>' +
      '<a href="https://images.nasa.gov/">NASA Image and Video Library</a><a href="https://ssd.jpl.nasa.gov/">JPL Solar System Dynamics</a>' +
      '<a href="' + REPO + '/blob/main/CREDITS.md">All credits &amp; licences</a></div>' +
      "</div><p style=\"margin-top:28px;font-size:.8rem\" class=\"muted\">Code MIT-licensed. NASA imagery is generally not copyrighted; use of NASA material does not imply NASA endorsement. Not affiliated with NASA, JPL, SpaceX or the California Science Center.</p></div>";
    body.appendChild(foot);
  }

  /* ---------- starfield + aurora + meteors (atlas pages) ---------- */
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!isSim && !body.hasAttribute("data-no-sky")) {
    var aur = document.createElement("div"); aur.className = "codex-aurora"; body.appendChild(aur);
    var met = document.createElement("div"); met.className = "meteors"; met.setAttribute("aria-hidden", "true");
    for (var m = 0; m < 14; m++) {
      var s = document.createElement("span"); s.className = "meteor";
      s.style.left = Math.floor(Math.random() * 110) + "%";
      s.style.animationDelay = (Math.random() * 12).toFixed(2) + "s";
      s.style.animationDuration = (4 + Math.random() * 7).toFixed(2) + "s";
      met.appendChild(s);
    }
    body.appendChild(met);
    starfield();
  }

  function starfield() {
    var c = document.createElement("canvas");
    c.id = "codex-sky"; c.setAttribute("aria-hidden", "true");
    body.appendChild(c);
    var ctx = c.getContext("2d");
    var stars = [], W = 0, H = 0, dpr = 1, px = 0, py = 0, tx = 0, ty = 0;
    var palette = ["#ffffff", "#cfe6ff", "#ffe9c7", "#bcd4ff", "#ffd2a6"];
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = c.width = innerWidth * dpr; H = c.height = innerHeight * dpr;
      c.style.width = innerWidth + "px"; c.style.height = innerHeight + "px";
      var n = Math.round((innerWidth * innerHeight) / 2600);
      stars = [];
      for (var i = 0; i < n; i++) {
        var z = Math.random();
        stars.push({ x: Math.random() * W, y: Math.random() * H, z: z, r: (0.25 + z * z * 1.4) * dpr,
          tw: Math.random() * 6.28, sp: 0.5 + Math.random() * 2, c: palette[(Math.random() * palette.length) | 0] });
      }
    }
    resize(); addEventListener("resize", resize);
    addEventListener("pointermove", function (e) { tx = (e.clientX / innerWidth - 0.5); ty = (e.clientY / innerHeight - 0.5); });
    var t0 = performance.now();
    function frame(now) {
      var t = (now - t0) / 1000;
      px += (tx - px) * 0.04; py += (ty - py) * 0.04;
      var scroll = scrollY * dpr;
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var x = (s.x - px * 30 * dpr * s.z) % W; if (x < 0) x += W;
        var y = (s.y - py * 30 * dpr * s.z - scroll * 0.08 * s.z) % H; if (y < 0) y += H;
        var a = reduce ? 0.8 : 0.55 + 0.45 * Math.sin(t * s.sp + s.tw);
        ctx.globalAlpha = a * (0.35 + s.z * 0.65);
        ctx.fillStyle = s.c;
        ctx.beginPath(); ctx.arc(x, y, s.r, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduce) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- behaviours ---------- */
  function onReady(fn) { if (document.readyState !== "loading") fn(); else document.addEventListener("DOMContentLoaded", fn); }

  onReady(function () {
    // Spotlight cards (MagicCard idea)
    document.addEventListener("pointermove", function (e) {
      var card = e.target.closest && e.target.closest(".card.spot");
      if (!card) return;
      var r = card.getBoundingClientRect();
      card.style.setProperty("--mx", (e.clientX - r.left) + "px");
      card.style.setProperty("--my", (e.clientY - r.top) + "px");
    });

    // Scroll reveal (BlurText idea)
    var io = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" }) : null;
    document.querySelectorAll(".reveal").forEach(function (el, i) {
      if (!el.style.transitionDelay && el.dataset.delay) el.style.transitionDelay = el.dataset.delay + "ms";
      if (io) io.observe(el); else el.classList.add("in");
    });

    // Number tickers (NumberTicker idea): <span data-count="1969" data-decimals="0">
    var tio = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        tio.unobserve(en.target);
        countUp(en.target);
      });
    }) : null;
    document.querySelectorAll("[data-count]").forEach(function (el) { if (tio) tio.observe(el); else countUp(el); });

    // Range sliders: paint the filled part of the track
    function paint(r) {
      var min = +r.min || 0, max = +r.max || 100;
      r.style.setProperty("--fill", ((r.value - min) / (max - min) * 100) + "%");
    }
    document.querySelectorAll('input[type="range"]').forEach(function (r) { paint(r); r.addEventListener("input", function () { paint(r); }); });

    // Collapsible HUD panels on phones
    document.querySelectorAll(".hud-collapse").forEach(function (b) {
      b.addEventListener("click", function () {
        var p = b.closest(".hud-panel");
        var c = p.classList.toggle("collapsed");
        b.textContent = c ? "▲ CONTROLS" : "▼ HIDE";
      });
    });
  });

  function countUp(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    var dec = +(el.getAttribute("data-decimals") || 0);
    var sep = el.hasAttribute("data-nosep") ? "" : ",";
    var dur = 1600, t0 = performance.now();
    function fmt(v) {
      var s = v.toFixed(dec);
      if (!sep) return s;
      var p = s.split("."); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, sep); return p.join(".");
    }
    if (reduce) { el.textContent = fmt(target); return; }
    (function step(now) {
      var k = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - k, 4);
      el.textContent = fmt(target * e);
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }

  /* ---------- help: "?" button, help panel, first-visit hint, slow-frame hint ----------
   * Content lives in data/help.json (one entry per page id; checked by
   * `node scripts/build_user_guide.mjs --check`). Nothing here touches page code:
   * the frame-time probe is its own requestAnimationFrame loop that stops after 5 s. */
  var GUIDE_URL = REPO + "/blob/main/docs/USER_GUIDE.md";
  var FAQ_URL = REPO + "/blob/main/docs/FAQ.md";
  var ISSUE_FACT = REPO + "/issues/new?template=factual-error.md";
  var ISSUE_BUG = REPO + "/issues/new";
  // Pages that already bind "?" themselves: the global shortcut stays off there.
  // (build_user_guide.mjs --check fails if a page binds "?" and is missing here.)
  var OWN_QKEY = { equations: 1 };
  var pageRow = PAGES.filter(function (p) { return p[0] === current; })[0] || null;
  var helpPromise = null, helpEntry = null, helpOpen = false, helpReturn = null, helpEl = null;
  // Automated browsers (screenshots, tests) get no unprompted toasts unless ?hints=1.
  var autoHints = !navigator.webdriver || /[?&]hints=1\b/.test(location.search);

  function coarseNow() { return !!(window.matchMedia && matchMedia("(pointer: coarse)").matches); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return undefined; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function loadHelp() {
    if (!helpPromise) {
      helpPromise = (window.fetch ? fetch("data/help.json").then(function (r) { return r.ok ? r.json() : null; }) : Promise.resolve(null))
        .catch(function () { return null; })
        .then(function (d) { helpEntry = (d && d.pages && d.pages[current]) || null; return helpEntry; });
    }
    return helpPromise;
  }

  var ICON = (function () {
    var mouse = '<rect x="11" y="5" width="10" height="17" rx="5"/><path d="M16 5v6.5"/>';
    var lb = '<path d="M16 5.8a4.2 4.2 0 0 0-4.2 4.2v1.5H16z" fill="currentColor" stroke="none" opacity=".55"/>';
    var rb = '<path d="M16 5.8a4.2 4.2 0 0 1 4.2 4.2v1.5H16z" fill="currentColor" stroke="none" opacity=".55"/>';
    var lr = '<path d="M2.5 14h5.5M4.8 11.7 2.5 14l2.3 2.3M29.5 14H24M27.2 11.7l2.3 2.3-2.3 2.3"/>';
    var finger = '<path d="M12.6 30V15.2a3.4 3.4 0 0 1 6.8 0V30"/>';
    var tip = '<circle cx="16" cy="15.4" r="1.6" fill="currentColor" stroke="none"/>';
    return {
      drag: mouse + lb + lr,
      rdrag: mouse + rb + lr,
      scroll: mouse + '<path d="M16 7.6v2.6" stroke-width="2.6"/><path d="M26.5 4v7M24.4 6.1l2.1-2.1 2.1 2.1M26.5 27v-7M24.4 24.9l2.1 2.1 2.1-2.1"/>',
      click: mouse + lb + '<path d="M5 3.5l2.2 2.2M3 9h3.1M9.5 1.5v3"/>',
      dblclick: mouse + lb + '<path d="M5 3.5l2.2 2.2M3 9h3.1M9.5 1.5v3"/><text x="22" y="30" font-size="8.5" font-weight="700" fill="currentColor" stroke="none" font-family="ui-monospace,monospace">2×</text>',
      tap: finger + tip + '<path d="M9.6 9.6a7.6 7.6 0 0 1 12.8 0"/>',
      dtap: finger + tip + '<path d="M9.6 9.6a7.6 7.6 0 0 1 12.8 0M6.6 7a11.6 11.6 0 0 1 18.8 0"/>',
      hold: finger + tip + '<circle cx="16" cy="12.4" r="8.4" stroke-dasharray="3 2.2" opacity=".8"/>',
      tdrag: finger + tip + '<path d="M2.5 8h7M4.8 5.7 2.5 8l2.3 2.3M29.5 8h-7M27.2 5.7l2.3 2.3-2.3 2.3"/>',
      twodrag: '<circle cx="11" cy="14" r="3.4" fill="currentColor" fill-opacity=".35"/><circle cx="21" cy="14" r="3.4" fill="currentColor" fill-opacity=".35"/><path d="M5 25h22M7.4 22.6 5 25l2.4 2.4M24.6 22.6 27 25l-2.4 2.4"/>',
      pinch: '<circle cx="12.5" cy="19.5" r="3.3" fill="currentColor" fill-opacity=".35"/><circle cx="19.5" cy="12.5" r="3.3" fill="currentColor" fill-opacity=".35"/><path d="M9 23l-5 5M4 23.5V28h4.5M23 9l5-5M23.5 4H28v4.5"/>'
    };
  })();
  function icon(name) {
    return '<svg class="cxh-ic" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[name] || ICON.click) + "</svg>";
  }
  function kbd(k) {
    if (k.length > 2 && k.indexOf("+") > 0) return k.split("+").map(function (x) { return "<kbd>" + esc(x) + "</kbd>"; }).join('<span class="cxh-op">+</span>');
    var m = /^(.+)–(.+)$/.exec(k);
    if (m) return "<kbd>" + esc(m[1]) + '</kbd><span class="cxh-op">–</span><kbd>' + esc(m[2]) + "</kbd>";
    return "<kbd>" + esc(k) + "</kbd>";
  }
  var ICON_NAME = { drag: "Drag", rdrag: "Right-drag", scroll: "Scroll wheel", click: "Click", dblclick: "Double-click", tap: "Tap", dtap: "Double-tap", hold: "Press and hold", tdrag: "One-finger drag", twodrag: "Two-finger drag", pinch: "Pinch" };
  var KIND = { live: ["Live data", "aurora"], simulated: ["Simulation", "nebula"], computed: ["Calculated", "ice"] };

  // The page's real low-graphics switch, from help.json: {set:{q:"low"}} (URL) or {store:{key:"low"}} (saved setting).
  function lowSwitch(e) {
    var l = e && e.slow && e.slow.low;
    if (!l) return null;
    var already = true, k;
    if (l.set) {
      var u = new URL(location.href);
      for (k in l.set) { if (u.searchParams.get(k) !== l.set[k]) already = false; u.searchParams.set(k, l.set[k]); }
      return { already: already, go: function () { location.href = u.toString(); } };
    }
    if (l.store) {
      for (k in l.store) if (lsGet(k) !== l.store[k]) already = false;
      return { already: already, go: function () { for (var kk in l.store) lsSet(kk, l.store[kk]); location.reload(); } };
    }
    return null;
  }
  function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement; }
  function fsOK() { return isSim && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled); }
  function toggleFS() {
    var d = document.documentElement;
    if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else { var r = (d.requestFullscreen || d.webkitRequestFullscreen).call(d); if (r && r.catch) r.catch(function () {}); }
  }

  function renderHelp(e) {
    var title = (e && e.title) || (pageRow ? pageRow[1] : document.title);
    var group = pageRow && pageRow[3] ? pageRow[3] : "Cosmic Library";
    var h = '<header class="cxh-head"><div><div class="cxh-eyebrow">Help · ' + esc(group) + "</div>" +
      '<h2 id="cx-help-t">' + esc(title) + "</h2>" +
      '<p class="cxh-what">' + esc((e && e.what) || (pageRow && pageRow[4]) || "") + "</p></div>" +
      '<button class="cxh-close" type="button" data-cxh="close" aria-label="Close help">' +
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button></header>';
    h += '<div class="cxh-body">';
    if (!e) {
      h += '<p class="cxh-note">Detailed help for this page could not be loaded (you may be offline, or opened the file directly). The full guide is on GitHub.</p>';
    } else {
      if (e.try && e.try.length) h += '<section class="cxh-sec"><h3>Try this first</h3><ol class="cxh-try">' + e.try.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ol></section>";
      var coarse = coarseNow();
      var order = coarse ? ["touch", "mouse", "keyboard"] : ["mouse", "touch", "keyboard"];
      var label = { mouse: "Mouse", touch: "Touch", keyboard: "Keyboard" };
      var c = e.controls || {};
      var groups = order.filter(function (g) { return c[g] && c[g].length; }).map(function (g) {
        return '<div class="cxh-grp cxh-g-' + g + '"><h4>' + label[g] + '</h4><ul class="cxh-list cxh-' + g + '">' + c[g].map(function (r) {
          var lead = g === "keyboard" ? '<span class="cxh-keys">' + r.keys.map(kbd).join(" ") + "</span>"
            : '<span class="cxh-icw" title="' + esc(ICON_NAME[r.icon] || r.icon) + '">' + icon(r.icon) + '<span class="sr-only">' + esc(ICON_NAME[r.icon] || r.icon) + ": </span></span>";
          return "<li>" + lead + '<span class="cxh-do">' + esc(r.do) + "</span></li>";
        }).join("") + "</ul></div>";
      }).join("");
      if (groups) h += '<section class="cxh-sec"><h3>Controls</h3><div class="cxh-grps">' + groups + "</div></section>";
      var d = e.data || {}, kind = KIND[d.kind] || KIND.computed;
      // The chip already says "Yes", so drop a leading "Yes;" from the sentence.
      var phoneTxt = String((e.phone && e.phone.text) || "").replace(/^yes[.;:,]?\s*/i, "");
      if (phoneTxt) phoneTxt = phoneTxt.charAt(0).toUpperCase() + phoneTxt.slice(1);
      h += '<section class="cxh-sec cxh-facts">' +
        '<div class="cxh-fact"><h4>Live or simulated?</h4><span class="chip ' + kind[1] + '">' + kind[0] + "</span><p>" + esc(d.text) + "</p>" + (d.offline ? '<p class="cxh-sub"><b>Offline:</b> ' + esc(d.offline) + "</p>" : "") + "</div>" +
        '<div class="cxh-fact"><h4>If it’s slow</h4><p>' + esc(e.slow && e.slow.text) + "</p></div>" +
        '<div class="cxh-fact"><h4>On a phone?</h4><span class="chip ' + (e.phone && e.phone.level === "yes" ? "aurora" : "sol") + '">' + (e.phone && e.phone.level === "yes" ? "Yes" : "Partly") + "</span>" + (phoneTxt ? "<p>" + esc(phoneTxt) + "</p>" : "") + "</div></section>";
    }
    var low = lowSwitch(e);
    var acts = "";
    if (low && !low.already) acts += '<button class="btn small primary" type="button" data-cxh="low">Switch to low graphics</button>';
    else if (low) acts += '<span class="chip ice">Low graphics is on</span>';
    if (fsOK()) acts += '<button class="btn small" type="button" data-cxh="fs">' + (fsEl() ? "Exit full screen" : "Full screen") + "</button>";
    var t = encodeURIComponent(title + ": ");
    acts += '<a class="btn small" href="' + ISSUE_FACT + "&title=" + t + '" target="_blank" rel="noopener">Report a wrong fact ↗</a>' +
      '<a class="btn small" href="' + ISSUE_BUG + "?title=" + t + '" target="_blank" rel="noopener">Report a problem ↗</a>';
    h += '<section class="cxh-sec cxh-acts">' + acts + "</section>";
    var rel = (e && e.related || []).map(function (id) { return PAGES.filter(function (p) { return p[0] === id; })[0]; }).filter(Boolean);
    if (rel.length) h += '<section class="cxh-sec"><h3>You might also like</h3><div class="cxh-rel">' + rel.map(function (p) {
      return '<a href="' + p[2] + '"><b>' + esc(p[1]) + "</b><span>" + esc(p[4]) + "</span></a>";
    }).join("") + "</div></section>";
    h += '<footer class="cxh-foot">' + (OWN_QKEY[current] || coarseNow() ? "" : "<span>Press " + kbd("?") + " any time for this panel.</span>") +
      '<span><a href="' + GUIDE_URL + '" target="_blank" rel="noopener">User guide ↗</a> · <a href="' + FAQ_URL + '" target="_blank" rel="noopener">FAQ ↗</a></span></footer>';
    return h + "</div>";
  }

  function helpFocusables() {
    return [].slice.call(helpEl.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(function (x) { return x.offsetParent !== null || x === document.activeElement; });
  }
  function openHelp(fromKey) {
    if (helpOpen) return;
    helpOpen = true;
    helpReturn = fromKey ? document.activeElement : helpBtn;
    hideToast(true);
    if (!helpEl) {
      helpEl = document.createElement("div");
      helpEl.className = "cx-help"; helpEl.id = "cx-help";
      helpEl.innerHTML = '<div class="cxh-scrim" data-cxh="close"></div><div class="cxh-box" role="dialog" aria-modal="true" aria-labelledby="cx-help-t" tabindex="-1"><div class="cxh-loading">Loading help…</div></div>';
      body.appendChild(helpEl);
      helpEl.addEventListener("click", function (ev) {
        var a = ev.target.closest("[data-cxh]"); if (!a) return;
        var act = a.getAttribute("data-cxh");
        if (act === "close") closeHelp();
        else if (act === "low") { var l = lowSwitch(helpEntry); if (l) l.go(); }
        else if (act === "fs") { toggleFS(); closeHelp(); }
      });
    }
    var box = helpEl.querySelector(".cxh-box");
    helpEl.hidden = false;
    document.documentElement.classList.add("cx-help-open");
    helpBtn.setAttribute("aria-expanded", "true");
    box.focus({ preventScroll: true });
    loadHelp().then(function (e) {
      if (!helpOpen) return;
      box.innerHTML = renderHelp(e);
      var close = box.querySelector(".cxh-close"); if (close) close.focus({ preventScroll: true });
    });
  }
  function closeHelp() {
    if (!helpOpen) return;
    helpOpen = false;
    helpEl.hidden = true;
    document.documentElement.classList.remove("cx-help-open");
    helpBtn.setAttribute("aria-expanded", "false");
    var r = helpReturn; helpReturn = null;
    if (r && r !== document.body && document.contains(r) && r.focus) r.focus({ preventScroll: true });
    else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    setTimeout(flushToasts, 400);
  }
  function isTyping(t) {
    if (!t || !t.tagName) return false;
    if (t.isContentEditable || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return true;
    return t.tagName === "INPUT" && !/^(range|checkbox|radio|button|submit|reset|color|file|image)$/i.test(t.type);
  }
  // Capture phase on window: runs before every page handler, so while the panel is open
  // page shortcuts (Space = launch, Esc = pause…) never fire behind it.
  window.addEventListener("keydown", function (e) {
    if (helpOpen) {
      e.stopPropagation();
      if (e.key === "Escape") { e.preventDefault(); closeHelp(); return; }
      if (e.key === "Tab") {
        var f = helpFocusables(); if (!f.length) { e.preventDefault(); return; }
        var first = f[0], last = f[f.length - 1], a = document.activeElement;
        if (e.shiftKey && (a === first || !helpEl.contains(a))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (a === last || !helpEl.contains(a))) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey || OWN_QKEY[current] || isTyping(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    openHelp(true);
  }, true);

  var helpBtn = document.createElement("button");
  helpBtn.type = "button"; helpBtn.className = "help-btn";
  helpBtn.setAttribute("aria-label", "Help for this page");
  helpBtn.setAttribute("aria-haspopup", "dialog");
  helpBtn.setAttribute("aria-expanded", "false");
  helpBtn.setAttribute("aria-controls", "cx-help");
  if (!OWN_QKEY[current]) helpBtn.setAttribute("aria-keyshortcuts", "Shift+?");
  helpBtn.title = OWN_QKEY[current] ? "Help for this page" : "Help for this page (?)";
  helpBtn.innerHTML = '<span aria-hidden="true">?</span>';
  helpBtn.addEventListener("click", function (e) { e.stopPropagation(); if (helpOpen) closeHelp(); else openHelp(false); });
  nav.appendChild(helpBtn);

  /* toasts: one at a time, never modal, never steal focus */
  var toastEl = null, toastTimer = 0, toastQueue = [], toastHover = false;
  function showToast(html, opts) {
    if (helpOpen || toastEl) { toastQueue.push([html, opts]); return; }
    toastEl = document.createElement("div");
    toastEl.className = "cx-toast"; toastEl.setAttribute("role", "status");
    toastEl.innerHTML = '<div class="cxt-msg">' + html + "</div>" + (opts.action ? '<button type="button" class="btn small primary" data-cxt="act">' + esc(opts.action) + "</button>" : "") +
      '<button type="button" class="cxt-x" data-cxt="x" aria-label="Dismiss"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>';
    var r = helpBtn.getBoundingClientRect();
    toastEl.style.setProperty("--ax", Math.max(14, Math.min(innerWidth - (r.left + r.width / 2) - 12, 300)) + "px");
    body.appendChild(toastEl);
    toastEl.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-cxt]");
      if (b && b.getAttribute("data-cxt") === "act") { hideToast(); opts.onAction(); }
      else if (b) hideToast();
      else if (opts.onBody) { hideToast(); opts.onBody(); }
    });
    toastEl.addEventListener("pointerenter", function () { toastHover = true; });
    toastEl.addEventListener("pointerleave", function () { toastHover = false; });
    var left = opts.ms || 6000;
    toastTimer = setInterval(function () {
      if (toastHover || (toastEl && toastEl.contains(document.activeElement))) return;
      left -= 250; if (left <= 0) hideToast();
    }, 250);
  }
  function hideToast(keepQueue) {
    clearInterval(toastTimer);
    if (toastEl) { var t = toastEl; toastEl = null; t.classList.add("out"); setTimeout(function () { t.remove(); }, reduce ? 0 : 260); }
    toastHover = false;
    if (!keepQueue && toastQueue.length) { var n = toastQueue.shift(); setTimeout(function () { showToast(n[0], n[1]); }, 400); }
  }
  function flushToasts() { if (!helpOpen && !toastEl && toastQueue.length) { var n = toastQueue.shift(); showToast(n[0], n[1]); } }

  function afterLoad(fn, ms) {
    var go = function () { setTimeout(fn, ms); };
    if (document.readyState === "complete") go(); else addEventListener("load", go);
  }

  // First visit to a simulation page: a small hint next to the "?" button.
  afterLoad(function () {
    if (!autoHints) return;
    loadHelp().then(function (e) {
      if (!e || !e.hint) return;
      var key = "cx-hint-" + current;
      if (lsGet(key) !== null) return;              // seen before, or storage blocked (undefined)
      if (!lsSet(key, "1")) return;
      var coarse = coarseNow();
      var html = esc(coarse && e.hintTouch ? e.hintTouch : e.hint).replace(/(^|\s)\?(\s|$)/g, "$1<kbd>?</kbd>$2");
      showToast(html, { ms: 6000, onBody: function () { openHelp(false); } });
    });
  }, 1200);

  // Frame-time probe: if the page renders very slowly for 5 s after load, suggest low graphics
  // once per page (only where help.json names a real low-quality switch).
  afterLoad(function () {
    if (!autoHints || !window.requestAnimationFrame) return;
    loadHelp().then(function (e) {
      var low = lowSwitch(e);
      if (!low || low.already) return;
      var key = "cx-slow-" + current;
      if (lsGet(key) !== null) return;
      var dts = [], last = 0, t0 = 0, skipped = false;
      function tick(now) {
        if (document.hidden) { skipped = true; return; }
        if (last) dts.push(now - last);
        last = now; if (!t0) t0 = now;
        if (now - t0 < 5000) { requestAnimationFrame(tick); return; }
        if (skipped || dts.length < 3) return;
        dts.sort(function (a, b) { return a - b; });
        var med = dts[dts.length >> 1];
        if (med < 50) return;                       // slower than ~20 frames per second
        if (!lsSet(key, "1")) return;
        showToast("Running slowly? Try low graphics.", { ms: 9000, action: "Switch", onAction: low.go });
      }
      requestAnimationFrame(tick);
    });
  }, 1000);

  /* ---------- tiny shared helpers for page scripts ---------- */
  window.Codex = {
    repo: REPO,
    pages: PAGES,
    reducedMotion: reduce,
    fmt: function (v, d) {
      if (!isFinite(v)) return "—";
      var a = Math.abs(v);
      if (a !== 0 && (a >= 1e7 || a < 1e-3)) return v.toExponential(d == null ? 2 : d);
      return v.toLocaleString("en-US", { maximumFractionDigits: d == null ? 2 : d, minimumFractionDigits: 0 });
    },
    webgl: function () {
      try { var c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; }
    },
    noGL: function (msg) {
      var d = document.createElement("div"); d.className = "nogl";
      d.innerHTML = '<div class="card" style="max-width:520px"><h3>WebGL is switched off</h3><p>' + (msg || "This simulation needs WebGL. Turn on hardware acceleration in your browser settings, or try Chrome, Edge or Firefox.") + "</p>" +
        '<p class="nogl-help"><button type="button" class="btn small" data-cx-help>Help for this page</button>' +
        '<a class="btn small" href="' + FAQ_URL + '#the-page-is-blank-or-black" target="_blank" rel="noopener">How to turn WebGL on ↗</a></p></div>';
      d.querySelector("[data-cx-help]").addEventListener("click", function () { openHelp(false); });
      document.body.appendChild(d);
    },
    help: { open: function () { openHelp(false); }, close: closeHelp, get isOpen() { return helpOpen; }, load: loadHelp }
  };
})();
