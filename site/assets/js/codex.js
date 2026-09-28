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
    ["earth", "Live Earth orbit", "earth.html", "Explore", "Real satellites, launches and news, live"],
    ["sky", "Night sky", "sky.html", "Explore", "A planetarium for your location, tonight"],
    ["solar-system", "Solar system", "solar-system.html", "Explore", "Every planet where it is today"],
    ["sun", "The Sun", "sun.html", "Explore", "Five wavelengths, flares, and the inside"],
    ["black-hole", "Black hole", "black-hole.html", "Explore", "Light bent through curved spacetime"],
    ["scale", "Cosmic scale", "scale.html", "Explore", "Zoom from a person to the whole universe"],
    ["space-weather", "Space weather", "space-weather.html", "Explore", "Solar wind, storms and aurora, live"],
    ["galaxies", "Galaxy collision", "galaxies.html", "Explore", "Milky Way meets Andromeda"],
    ["orbits", "Orbit Lab", "orbits.html", "Learn", "Newton, Kepler, Hohmann and Lagrange"],
    ["equations", "Equations", "equations.html", "Learn", "47 equations with live calculators"],
    ["gallery", "Gallery", "gallery.html", "Learn", "Fifty photographs that changed us"],
    ["timeline", "Timeline", "timeline.html", "Learn", "1903 to today, every milestone"],
    ["library", "Documents", "library.html", "Learn", "Flight manuals, reports and user guides"],
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
      d.innerHTML = '<div class="card" style="max-width:520px"><h3>WebGL is switched off</h3><p>' + (msg || "This simulation needs WebGL. Turn on hardware acceleration in your browser settings, or try Chrome, Edge or Firefox.") + "</p></div>";
      document.body.appendChild(d);
    }
  };
})();
