/* Cosmic Codex shell: navigation, footer, starfield, meteors and small UI
 * behaviours shared by every page. Plain script (no modules) so it runs first
 * and works from file:// too.
 *
 * Usage in a page:
 *   <body data-page="launch">            (optional: class="sim" for full-screen)
 *   <script src="assets/js/codex.js"></script>
 */
(function () {
  "use strict";

  var REPO = "https://github.com/Normansrule/cosmic-codex";
  var PAGES = [
    ["index", "Home", "index.html"],
    ["launch", "Launch", "launch.html"],
    ["shuttle", "Endeavour", "shuttle.html"],
    ["black-hole", "Black Hole", "black-hole.html"],
    ["sun", "The Sun", "sun.html"],
    ["solar-system", "Solar System", "solar-system.html"],
    ["orbits", "Orbit Lab", "orbits.html"],
    ["equations", "Equations", "equations.html"],
    ["gallery", "Gallery", "gallery.html"],
    ["timeline", "Timeline", "timeline.html"],
    ["library", "Library", "library.html"],
    ["experiments", "Experiments", "experiments.html"]
  ];

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
  var links = PAGES.map(function (p) {
    return '<a href="' + p[2] + '"' + (p[0] === current ? ' aria-current="page"' : "") + ">" + p[1] + "</a>";
  }).join("");
  nav.innerHTML =
    '<a class="brand" href="index.html">' + MARK + '<span>Cosmic Codex</span></a>' +
    '<button class="nav-toggle" aria-expanded="false" aria-controls="cx-links">Menu</button>' +
    '<nav class="links" id="cx-links" aria-label="Site">' + links +
    '<a href="' + REPO + '" rel="noopener">GitHub ↗</a></nav>';
  body.insertBefore(nav, body.firstChild);
  var toggle = nav.querySelector(".nav-toggle");
  toggle.addEventListener("click", function () {
    var open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.textContent = open ? "Close" : "Menu";
  });

  /* ---------- footer (atlas pages only) ---------- */
  if (!isSim) {
    var foot = document.createElement("footer");
    foot.className = "codex-footer";
    foot.innerHTML =
      '<div class="shell"><div class="cols">' +
      '<div><h4>Cosmic Codex</h4><p class="muted" style="font-size:.88rem">An open atlas of space science and spaceflight: simulations you can touch, the equations behind them, and experiments you can build.</p></div>' +
      '<div><h4>Explore</h4>' + PAGES.slice(1, 7).map(function (p) { return '<a href="' + p[2] + '">' + p[1] + "</a>"; }).join("") + "</div>" +
      '<div><h4>Learn</h4>' + PAGES.slice(7).map(function (p) { return '<a href="' + p[2] + '">' + p[1] + "</a>"; }).join("") + "</div>" +
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
