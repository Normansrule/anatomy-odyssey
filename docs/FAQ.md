# Cosmic Library FAQ

Short answers to the questions people ask most. For each page's controls, see the [user guide](USER_GUIDE.md), or press the <kbd>?</kbd> button at the top right of any page.

- [The page is blank or black](#the-page-is-blank-or-black)
- [It's slow](#its-slow)
- [Phones and tablets](#phones-and-tablets)
- [Live data says "offline" or "sample"](#live-data-says-offline-or-sample)
- [Are the numbers real?](#are-the-numbers-real)
- [Privacy](#privacy)
- [Can I use this in my class?](#can-i-use-this-in-my-class)
- [How do I report a mistake?](#how-do-i-report-a-mistake)

## The page is blank or black

Most simulations draw with **Web Graphics Library (WebGL)**, the part of your browser that uses the graphics card. If it is switched off you see a black page or a "WebGL is switched off" card.

1. **Turn on hardware acceleration**, then restart the browser:
   - **Chrome:** Settings → System → *Use graphics acceleration when available*.
   - **Edge:** Settings → System and performance → *Use graphics acceleration when available*.
   - **Firefox:** Settings → General → Performance → untick *Use recommended performance settings* → tick *Use hardware acceleration when available*.
   - **Safari (Mac):** WebGL is on by default. Check Safari → Settings → Advanced → *Show features for web developers*, then Develop → Feature Flags, and make sure WebGL 2.0 is on.
2. **Check it worked:** open `chrome://gpu` (Chrome/Edge) or `about:support` (Firefox) and look for "WebGL: Hardware accelerated".
3. **Update your browser and graphics driver.** A very old driver can be blocked by the browser.
4. **Work or school computers** sometimes block WebGL by policy. Try another device, or ask your IT team.

Pages that need WebGL: all *Fly* pages, Live Earth orbit, Night sky, Moon explorer, Solar system, The Sun, Black hole, Galaxy collision (WebGL 2) and Sky surveys (WebGL 2). Mission designer, Space weather, Deep Space Network and Experiments use it for one 3D view, and Home for its animated header; the rest of each page still works without it. Orbit Lab, Cosmic scale, Space Academy, Equations, Gallery, Timeline, Documents, Use a telescope, Telescope simulator and Solar observatory do not need it.

If a page is black but WebGL is on, wait a few seconds (large pages build their scenes first) and reload once.

## It's slow

- **Press <kbd>?</kbd> → *Switch to low graphics*.** It reloads the page with that page's own low-quality setting (for example `?q=low` on the landing simulations, `?quality=low` on the Solar system, fewer stars on Galaxy collision). The button only appears on pages that have such a setting; if a page runs very slowly for its first seconds, it also offers the switch once.
- **Close other tabs**, especially other 3D pages and video.
- **Laptops:** plug in the charger and set the power mode to *Best performance* (Windows) or turn off *Low Power Mode* (Mac). On battery, many laptops use the slower built-in graphics.
- **Make the window smaller** (or leave full screen): fewer pixels to draw.
- **Turn on "reduce motion"** in your system settings: the background starfield and meteors stop, and some pages start calmer.

Each page's own tips are in the [user guide](USER_GUIDE.md) under "If it's slow".

## Phones and tablets

Nearly every page works on phones: side panels become a bottom sheet (tap *▲ CONTROLS* / *▼ HIDE*), one finger drags to look around and two fingers pinch to zoom. The landing simulations show large on-screen buttons while you fly. Phones start several simulations on lower quality automatically.

Best on a bigger screen: **Rocket builder**, **Mission designer**, **Black hole**, **Galaxy collision** (these say "partly" in the help panel). An older phone may not support WebGL 2, which Galaxy collision and Sky surveys need.

## Live data says "offline" or "sample"

Some pages show live data straight from public servers:

| Page | Live from | If it can't be reached |
|---|---|---|
| Live Earth orbit | CelesTrak (orbits), The Space Devs (launches), Spaceflight News API (news) | Uses the last copy saved on your device; with none, builds *illustrative* constellations and says so |
| Space weather | Space Weather Prediction Center of the National Oceanic and Atmospheric Administration (NOAA) | Last saved copy; with none, replays the May 2024 storm, clearly labelled |
| Deep Space Network | DSN Now, from the Jet Propulsion Laboratory (JPL) of the National Aeronautics and Space Administration (NASA), every 5 seconds | Last saved copy with its age; with none, an *illustrative* sample |
| Solar observatory | Solar Dynamics Observatory (SDO), Solar and Heliospheric Observatory (SOHO), NOAA's GOES satellites, Helioviewer | A labelled drawing, never an old picture passed off as new |
| Sky surveys | Strasbourg astronomical Data Centre (CDS): Aladin Lite survey tiles and name search | A local Milky Way map, labelled "offline preview" |
| Gallery | NASA, European Space Agency (ESA), European Southern Observatory (ESO) and Wikimedia image servers; NASA's Astronomy Picture of the Day | Stories still show; pictures say "unavailable offline" |

"Offline" or "sample" usually means: you are offline, a school or office network blocks that server, an ad or privacy blocker stopped the request, or the server is briefly down. It does **not** mean the page is broken. Reload later, or press the page's *Try again* button. Nothing labelled "sample" or "illustrative" is ever presented as real, current data.

Everything else (Night sky, Moon explorer, Solar system, Orbit Lab, the landing simulations…) is calculated in your browser and needs no connection at all once loaded.

## Are the numbers real?

Yes, as far as we can make them. Every number on screen comes from a real equation or a cited source: flight reports for the launch and landings, JPL orbital elements for planet positions, the Hipparcos catalogue for stars, published papers for the black hole and galaxies. Sources are cited in each page's panels and in the code, and collected in [CREDITS.md](../CREDITS.md) and [REFERENCES.md](REFERENCES.md).

Simulations are models: they are simplified where the page says so (for example "Earth and its magnetosphere to scale; the Sun is not"). The help panel on each page says whether it shows live data, a simulation, or something calculated in your browser.

## Privacy

- **No accounts, no sign-up, no adverts, no analytics, no tracking.** The site's code contains no analytics or tracking scripts and sets no cookies. It is served by GitHub Pages; GitHub's own [privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement) covers its server logs.
- **Your location** is only used if you press *Use my location* (Home, Night sky, Live Earth orbit, Space weather, Telescope simulator). Your browser asks first; the position stays on your device and is never sent to a server.
- **Saved on your device only** (browser "local storage"; clear it any time by clearing site data):

| Page | What it remembers |
|---|---|
| Every page | Whether you've seen the first-visit hint and the "running slowly" tip |
| Saturn V launch, Booster landing, Moon landing, Mars landing, Endeavour, Rocket hangar | Your graphics-quality choice |
| Home | Which "Where do you want to start?" mood you picked last |
| Space Academy | Your course progress (use *Copy code* to move it to another device) |
| Documents | Cards or Bookshelf view |
| Live Earth orbit | Recent satellite orbits, launches and news (so it loads fast and works offline); your location if you shared it |
| Space weather | Recent NOAA data; your location and time-zone choice if you set them |
| Deep Space Network | The last good network snapshot |
| Sky surveys | Aladin Lite's colour-theme setting |

Some pages fetch pictures or data from the servers listed [above](#live-data-says-offline-or-sample); those servers see an ordinary web request from your browser, as with any website. Fonts come from Google Fonts.

## Can I use this in my class?

Yes, please. It is free and needs no accounts, so students can open a page and start.

- **Code** is under the [MIT licence](../LICENSE): copy, change and host it.
- **Written text and original diagrams** are under [Creative Commons Attribution 4.0 (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/): reuse them with credit to "Cosmic Library, Aleksander Norman".
- **Third-party images and libraries keep their own terms.** NASA images are generally not copyrighted in the United States (credit NASA); ESA/Webb, ESA/Hubble and ESO images are CC BY 4.0; Wikimedia files follow each file's licence; Aladin Lite is LGPL-3.0. Details in [CREDITS.md](../CREDITS.md).
- Useful for class: the [Space Academy](https://normansrule.github.io/cosmic-library/academy.html) course (progress codes and a printable certificate), the [Equations](https://normansrule.github.io/cosmic-library/equations.html) page's worked examples, and the [Experiments](https://normansrule.github.io/cosmic-library/experiments.html) ladder. Most simulations accept links that open a set-up (for example Rocket builder and Mission designer keep your design in the address).

Cosmic Library is independent and not affiliated with or endorsed by NASA or any other agency or company.

## How do I report a mistake?

- **A wrong number, date or claim:** open a [factual error report](https://github.com/Normansrule/cosmic-library/issues/new?template=factual-error.md). Say which page, what it says, what it should say, and link a primary source.
- **Something broken** (a page won't load, a button does nothing): open a [new issue](https://github.com/Normansrule/cosmic-library/issues/new) with your browser, device and the page address.
- **An idea** for a page or experiment: use the [idea template](https://github.com/Normansrule/cosmic-library/issues/new?template=idea.md).

Both report links are also in the <kbd>?</kbd> help panel on every page, already filled in with the page name. You need a free GitHub account to open an issue.
