# Security model

Anatomy Odyssey is a static, local-first web app. It has no server, no accounts and no user data leaving the browser. This document lists what it trusts, what could go wrong, and what defends against it.

## Trust boundaries

| Boundary | Trusted? | Notes |
|---|---|---|
| Code in this repository, built by CI | Yes | Reviewed, tested, built from a pinned lockfile |
| npm dependencies | Conditionally | Exact versions (`save-exact`), lockfile, `npm ci --ignore-scripts`, `npm audit`, Dependabot |
| GitHub Actions | Conditionally | Every third-party action pinned by full commit hash; least-privilege `permissions` per job |
| 3D assets (from Milestone 2) | No, until verified | Must match `assets/manifest.json` (SHA-256 and size) before parsing |
| Text typed into search | No | Normalized, length-capped, rendered as text only |
| Browser local storage | No | Read defensively; bad or missing data falls back to defaults |

## Threats and defenses

### Script injection (cross-site scripting)
- A strict Content Security Policy (CSP) in `index.html`: `default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`, no inline scripts in the production build.
- All dynamic text goes through `textContent` (`src/ui/dom.js`). The codebase never assigns `innerHTML`.
- Search input is Unicode-normalized, stripped to letters, digits, spaces and a few punctuation marks, and capped at 60 characters (`src/ui/search.js`). A test feeds it an `<img onerror>` payload.
- External reference links open with `rel="noopener noreferrer"`, and the page sends `no-referrer`.

The single-file preview build (`npm run build:preview`) has to inline its script, so it relaxes `script-src` and `style-src` to allow inline code. Use it only for previews; GitHub Pages serves the strict build.

### Malicious or corrupted assets
Milestone 1 renders procedural geometry and fetches nothing. The guards for Milestone 2's glTF pipeline are already in `src/security/assetIntegrity.js` and tested:

1. **Allowlisted origins.** Assets load only from the same origin or listed HTTPS hosts. `javascript:` and plain HTTP URLs are rejected.
2. **Size cap before parsing** (40 MB per file) to stop oversized downloads.
3. **Hash check.** SHA-256 must match `assets/manifest.json`, which CI regenerates and compares (`npm run manifest -- --check`).
4. **Format check.** The file must be binary glTF version 2 with a consistent declared length.
5. **Vertex budget after decode** (3 million vertices) to catch decompression bombs, where a small Draco or meshopt payload expands into a mesh that exhausts memory.
6. **No executable content.** glTF is data. Extensions that could reference scripts are not supported, and the loader will be configured with only the Draco/meshopt decoders shipped in this repo.

Planned for Milestone 5: sign `manifest.json` in CI and verify the signature in the app, so a compromised asset host cannot swap both a file and its hash.

### Supply chain (OWASP Top 10 2025, A03: Software Supply Chain Failures)
- Lockfile committed; installs use `npm ci --ignore-scripts` so dependency install scripts never run in CI.
- CI produces a Software Bill of Materials (SBOM, CycloneDX) as a build artifact.
- CodeQL scans JavaScript on every push and weekly; gitleaks scans history for secrets.
- Dependabot updates npm packages and pinned actions weekly.
- Desktop releases publish SHA-256 checksums; code signing is still to do.

### Privacy
- No analytics, trackers, third-party fonts or CDNs. Fonts are bundled.
- Progress (visited tiers, preferences) is stored only in `localStorage` under one key, and **About → Clear my progress** removes it.
- The first-launch benchmark stores two frame times, a tier name and a date with the other preferences. It reads no device identifiers, uses no fingerprinting APIs (no GPU strings, no canvas readback) and sends nothing anywhere.
- Test tools (`tools/screenshots.py`, `tools/a11y-audit.py`) open headless pages with Playwright's `bypass_csp` so they can inject axe-core or poll state. That applies only to the test browser; the shipped page keeps its strict Content Security Policy, and axe-core is a development dependency that is never bundled.

### Desktop app
- Built with Tauri 2 (`src-tauri/`). The window shows the same static build as the website, loaded from inside the app bundle; nothing is fetched at run time.
- The page gets **no** system permissions: `capabilities/default.json` grants an empty permission list, the app registers no custom commands, and the global Tauri object is not injected (`withGlobalTauri: false`).
- The window runs under the same strict Content Security Policy as the website, and Tauri's prototype freezing is on.
- No network listeners and no updater; the app works fully offline.
- Installers are built in CI from a tagged commit, with SHA-256 checksums attached to the release. Code signing is still to do.

### Content safety
- Visible disclaimer on every screen: teaching model, not medical advice. No diagnosis features.
- Content is non-graphic and written for a broad, possibly young audience.

## Reporting a vulnerability

Open a private security advisory on the GitHub repository (Security → Report a vulnerability) rather than a public issue.
