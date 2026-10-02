/* Cosmic Library telescope simulator: the optics and the sky, as pure functions.
 *
 * No DOM: this module runs in the browser (eyepiece.js) and in Node
 * (scripts/test_eyepiece.mjs). Every number the page shows comes from here, and
 * every formula names its source.
 *
 * Main references
 *   [EQ]   Cosmic Library equations chapter "Telescopes & Optics" (site/data/equations.json):
 *          rayleigh, light-gathering, limiting-magnitude, magnification, seeing-limit.
 *   [Dawes] W. R. Dawes 1867, Memoirs of the RAS 35, 137: empirical double-star limit
 *          R = 4.56"/D(inches) = 115.8"/D(mm).
 *   [LM]   Limiting magnitude rule of thumb, m_lim = m_eye + 5 log10(D/d_eye) + 2.5 log10(tau)
 *          (the light-gathering gain applied to the naked-eye limit; see
 *          https://en.wikipedia.org/wiki/Limiting_magnitude and [EQ] "limiting-magnitude").
 *   [Bortle] J. E. Bortle 2001, "Introducing the Bortle Dark-Sky Scale", Sky & Telescope
 *          101(2), 126: naked-eye limiting magnitude and zenith sky brightness per class
 *          (values as tabulated at https://en.wikipedia.org/wiki/Bortle_scale).
 *   [Fried] D. L. Fried 1965, JOSA 55, 1427 and 1966, JOSA 56, 1372: r0 and seeing
 *          FWHM = 0.98 lambda / r0; one-axis wavefront tilt variance 0.182 (D/r0)^(5/3) (lambda/D)^2.
 *   [HNSKY] H. Kleijn, "Average number of stars per square degree up to a magnitude",
 *          hnsky.org/star_count.htm (counts from Gaia eDR3 + Tycho-2).
 *   [M]    J. Meeus, "Astronomical Algorithms", 2nd ed. (1998), ch. 44 (Jupiter's satellites),
 *          ch. 48 (position angle of the bright limb, eq. 48.5).
 *   [IAU]  B. A. Archinal et al. 2018, "Report of the IAU Working Group on Cartographic
 *          Coordinates and Rotational Elements: 2015", Celest. Mech. Dyn. Astr. 130:22 (pole directions).
 */
import { galileanLongitudes, GALILEAN, OBLIQUITY_J2000 } from "./ephemeris.js";
import { body, raDecToVec, vecToRaDec, saturnRingTilt, altAzOf, riseSetTransit, standardAltitude } from "./sky-astro.js";

export const ARCSEC_PER_RAD = 206264.806;
export const LAMBDA_VISUAL_NM = 550;        // peak sensitivity of the eye (green light)
export const EYE_PUPIL_MM = 7;              // dark-adapted pupil of a young adult ([EQ] light-gathering)
export const EYE_ACUITY_ARCSEC = 60;        // "20/20" vision resolves about 1 arcminute (Snellen chart)
export const FULL_MOON_DEG = 0.5;           // mean apparent diameter of the Moon, 29.3'-34.1'
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

/* ------------------------------------------------------ eyepiece optics --- */

/** Magnification M = f_objective / f_eyepiece ([EQ] magnification). A Barlow lens multiplies f_obj. */
export function magnification(focalMm, eyepieceMm, barlow = 1) { return focalMm * barlow / eyepieceMm; }
/** True field of view (deg) = apparent field / M ([EQ] magnification). Good to a few % for common eyepieces. */
export function trueField(apparentDeg, M) { return apparentDeg / M; }
/** Exit pupil (mm) = D / M: the width of the beam of light leaving the eyepiece. */
export function exitPupil(apertureMm, M) { return apertureMm / M; }
/** Focal ratio N = f / D. */
export function focalRatio(focalMm, apertureMm) { return focalMm / apertureMm; }
/** How many full Moons fit across a field (deg). */
export function moonsAcross(fieldDeg) { return fieldDeg / FULL_MOON_DEG; }

/** Rayleigh criterion theta = 1.22 lambda / D, in arcseconds ([EQ] rayleigh). */
export function rayleighArcsec(apertureMm, lambdaNm = LAMBDA_VISUAL_NM) {
  return 1.22 * (lambdaNm * 1e-9) / (apertureMm * 1e-3) * ARCSEC_PER_RAD;
}
/** Dawes limit R = 115.8 / D(mm) arcseconds ([Dawes]); what observers actually achieve on equal pairs. */
export function dawesArcsec(apertureMm) { return 115.8 / apertureMm; }
/** Full width at half maximum of the Airy disk, 1.029 lambda / D, arcseconds (Born & Wolf, Principles of Optics, 8.5). */
export function airyFwhmArcsec(apertureMm, lambdaNm = LAMBDA_VISUAL_NM) {
  return 1.029 * (lambdaNm * 1e-9) / (apertureMm * 1e-3) * ARCSEC_PER_RAD;
}

/** Light-gathering power relative to the dark-adapted eye, (D / d_eye)^2 ([EQ] light-gathering). */
export function lightGrasp(apertureMm, pupilMm = EYE_PUPIL_MM) { return (apertureMm / pupilMm) ** 2; }

/** Limiting magnitude, [LM]: m_lim = m_eye + 5 log10(D/d_eye) + 2.5 log10(tau).
 *  For the naked eye (D = d_eye, tau = 1) it returns m_eye. */
export function limitingMagnitude(apertureMm, mEye = 6, pupilMm = EYE_PUPIL_MM, tau = 0.8) {
  if (apertureMm <= pupilMm) return mEye + 5 * Math.log10(apertureMm / pupilMm);
  return mEye + 5 * Math.log10(apertureMm / pupilMm) + 2.5 * Math.log10(tau);
}

/** Highest useful magnification, about 2x the aperture in millimetres ([EQ] magnification):
 *  beyond it the exit pupil is under 0.5 mm and you only enlarge the blur. */
export function maxUsefulMagnification(apertureMm) { return 2 * apertureMm; }
/** Lowest useful magnification: an exit pupil wider than the eye's pupil wastes light. */
export function minUsefulMagnification(apertureMm, pupilMm = EYE_PUPIL_MM) { return apertureMm / pupilMm; }

/** A plain-words verdict on an exit pupil (mm). Ranges are the usual visual-observing guidance
 *  (e.g. Sky & Telescope, "Exit pupil" articles): >7 wasted, 5-7 bright & wide, 2-5 all-round,
 *  0.7-2 high-power detail, 0.5-0.7 the practical limit, <0.5 empty magnification. */
export function exitPupilVerdict(mm, pupilMm = EYE_PUPIL_MM) {
  if (mm > pupilMm + 0.05) return { key: "wasted", label: "Wasted light", tip: `Wider than your ${pupilMm} mm pupil: some of the light misses your eye. Use more magnification.` };
  if (mm >= 5) return { key: "wide", label: "Bright and wide", tip: "Great for big, faint things: star clusters, nebulae, galaxies." };
  if (mm >= 2) return { key: "ideal", label: "Ideal all-rounder", tip: "Bright enough and big enough: a sweet spot for most targets." };
  if (mm >= 0.7) return { key: "detail", label: "High-power detail", tip: "Good for the Moon, planets and close double stars on steady nights." };
  if (mm >= 0.5) return { key: "limit", label: "At the limit", tip: "Dim and soft. Only worth it on very steady nights." };
  return { key: "dim", label: "Too dim, too blurry", tip: "Empty magnification: bigger, but no new detail and much dimmer." };
}

/* ---------------------------------------------------------- atmosphere --- */

/** Fried parameter r0 (m) for a seeing FWHM (arcsec) at wavelength lambda, [Fried]: theta = 0.98 lambda / r0. */
export function friedR0(seeingArcsec, lambdaNm = LAMBDA_VISUAL_NM) {
  return 0.98 * lambdaNm * 1e-9 / (seeingArcsec / ARCSEC_PER_RAD);
}
/** One-axis root-mean-square image motion (arcsec) for aperture D, [Fried]:
 *  sigma^2 = 0.182 (D/r0)^(5/3) (lambda/D)^2. Small telescopes see the image dance; big ones see it boil. */
export function tiltRmsArcsec(apertureMm, seeingArcsec, lambdaNm = LAMBDA_VISUAL_NM) {
  if (seeingArcsec <= 0) return 0;
  const D = apertureMm * 1e-3, r0 = friedR0(seeingArcsec, lambdaNm), lam = lambdaNm * 1e-9;
  return Math.sqrt(0.182 * Math.pow(D / r0, 5 / 3)) * (lam / D) * ARCSEC_PER_RAD;
}
/** Blur (FWHM, arcsec) that remains in a short look once the image motion is taken out:
 *  total long-exposure seeing minus the tilt part (a simple quadrature split, adequate for a picture). */
export function seeingBlurArcsec(apertureMm, seeingArcsec, lambdaNm = LAMBDA_VISUAL_NM) {
  if (seeingArcsec <= 0) return 0;
  const tilt = 2.355 * tiltRmsArcsec(apertureMm, seeingArcsec, lambdaNm);
  return Math.sqrt(Math.max(0, seeingArcsec * seeingArcsec - tilt * tilt));
}
/** Everything that blurs the view (FWHM, arcsec): diffraction, the air, and your eye's own
 *  1-arcminute acuity shrunk by the magnification. Added in quadrature. */
export function totalBlurArcsec({ apertureMm, M = 1, seeingArcsec = 1.5, space = false, camera = false, lambdaNm = LAMBDA_VISUAL_NM }) {
  const diff = airyFwhmArcsec(apertureMm, lambdaNm);
  const see = space ? 0 : seeingBlurArcsec(apertureMm, seeingArcsec, lambdaNm);
  const eye = camera ? 0 : EYE_ACUITY_ARCSEC / Math.max(M, 1);
  return { diff, see, eye, total: Math.hypot(diff, see, eye) };
}
/** The finest detail you will really see: the worst of diffraction (Dawes), the air and your eye. */
export function effectiveResolution(o) {
  const b = totalBlurArcsec(o);
  const parts = [["telescope", dawesArcsec(o.apertureMm) * (o.lambdaNm ? o.lambdaNm / LAMBDA_VISUAL_NM : 1)], ["air", b.see], ["eye", b.eye]];
  parts.sort((a, c) => c[1] - a[1]);
  return { arcsec: parts[0][1], limitedBy: parts[0][0], ...b };
}

/* Bortle dark-sky scale [Bortle]: naked-eye limiting magnitude (middle of each class's range)
 * and zenith sky brightness in V magnitudes per square arcsecond. */
export const BORTLE = [
  null,
  { cls: 1, name: "Excellent dark site", nelm: 7.8, sb: 22.0, where: "remote desert or ocean" },
  { cls: 2, name: "Truly dark site", nelm: 7.3, sb: 21.9, where: "national park backcountry" },
  { cls: 3, name: "Rural sky", nelm: 6.8, sb: 21.7, where: "farmland far from towns" },
  { cls: 4, name: "Rural / suburban edge", nelm: 6.3, sb: 21.1, where: "edge of a small town" },
  { cls: 5, name: "Suburban sky", nelm: 5.8, sb: 20.0, where: "outer suburbs" },
  { cls: 6, name: "Bright suburban sky", nelm: 5.3, sb: 19.2, where: "inner suburbs" },
  { cls: 7, name: "Suburban / urban", nelm: 4.8, sb: 18.7, where: "near a city centre" },
  { cls: 8, name: "City sky", nelm: 4.3, sb: 18.2, where: "a city" },
  { cls: 9, name: "Inner-city sky", nelm: 4.0, sb: 17.8, where: "downtown Los Angeles" }
];
export function bortle(cls) { return BORTLE[Math.max(1, Math.min(9, Math.round(cls)))]; }

/** Dark adaptation: the eye's sensitivity recovers over ~20-30 minutes after bright light
 *  (rods; e.g. Hecht, Haig & Chase 1937). Modelled as a magnitude penalty decaying with a
 *  7-minute time constant from 2 magnitudes (straight out of a lit room) to 0. */
export function adaptationPenalty(minutesInDark) { return 2 * Math.exp(-Math.max(0, minutesInDark) / 7); }

/* ---------------------------------------------------- surface brightness --- */

/** Surface brightness (mag/arcsec^2) of an extended object seen through the instrument.
 *  A telescope can never make a nebula brighter per square arcsecond than the naked eye:
 *  at best it matches it (exit pupil = eye pupil), minus the light lost in the optics.
 *  With a smaller exit pupil it is dimmer by (exit / pupil)^2. */
export function surfaceBrightnessThrough(sbNaked, exitMm, pupilMm = EYE_PUPIL_MM, tau = 0.8) {
  const f = tau * Math.min(1, (exitMm / pupilMm) ** 2);
  return sbNaked - 2.5 * Math.log10(f);
}
/** Add two surface brightnesses (mag/arcsec^2), e.g. a nebula plus the sky glow. */
export function addMagnitudes(a, b) { return -2.5 * Math.log10(Math.pow(10, -0.4 * a) + Math.pow(10, -0.4 * b)); }

/** Average number of stars per square degree brighter than magnitude m, [HNSKY] (log-interpolated). */
const STAR_COUNTS = [0.000073, 0.000339, 0.001333, 0.004630, 0.013526, 0.042276, 0.129106, 0.400044,
  1.177102, 3.378542, 9.282355, 25.406249, 71.654207, 178.089715, 417.281555, 954.786197, 2154.900589];
export function starsPerSqDeg(m) {
  if (m <= 0) return STAR_COUNTS[0] * Math.pow(10, 0.66 * m);
  if (m >= 16) return STAR_COUNTS[16] * Math.pow(10, 0.35 * (m - 16));
  const i = Math.floor(m), f = m - i;
  return Math.pow(10, Math.log10(STAR_COUNTS[i]) * (1 - f) + Math.log10(STAR_COUNTS[i + 1]) * f);
}
/** Expected number of stars brighter than m in a circular field of the given diameter (deg). */
export function starsInField(m, fieldDeg) { return starsPerSqDeg(m) * Math.PI * (fieldDeg / 2) ** 2; }

/* ------------------------------------------------ instrument summaries --- */

/** Every readout the page shows, for one instrument + eyepiece + conditions.
 *  inst: { aperture, focal, tau, kind: "eye"|"binocular"|"telescope"|"camera", fixedMag, fixedField,
 *          space, lambdaNm, cameraFieldArcsec }
 *  ep:   { focal, afov }  (ignored for naked eye, binoculars and cameras) */
export function instrumentReadout(inst, ep, { barlow = 1, seeing = 1.5, bortleClass = 5, minutesInDark = 30 } = {}) {
  const D = inst.aperture, sky = bortle(bortleClass);
  const out = { aperture: D, kind: inst.kind, space: !!inst.space, camera: inst.kind === "camera" };
  if (inst.kind === "eye") { out.M = 1; out.field = inst.fixedField; }
  else if (inst.kind === "binocular") { out.M = inst.fixedMag; out.field = inst.fixedField; }
  else if (inst.kind === "camera") { out.M = NaN; out.field = inst.cameraFieldArcsec / 3600; }
  else { out.M = magnification(inst.focal, ep.focal, barlow); out.field = trueField(ep.afov, out.M); }
  out.exit = out.camera ? NaN : (inst.kind === "eye" ? EYE_PUPIL_MM : exitPupil(D, out.M));
  out.exitVerdict = out.camera ? null : exitPupilVerdict(out.exit);
  out.focalRatio = inst.focal ? focalRatio(inst.focal * (inst.kind === "telescope" ? barlow : 1), D) : NaN;
  out.lambdaNm = inst.lambdaNm || LAMBDA_VISUAL_NM;
  out.rayleigh = rayleighArcsec(D, out.lambdaNm);
  out.dawes = dawesArcsec(D) * out.lambdaNm / LAMBDA_VISUAL_NM;
  out.grasp = lightGrasp(D);
  const tau = inst.tau || (inst.kind === "eye" ? 1 : 0.8);
  const mEye = sky.nelm - adaptationPenalty(minutesInDark);
  out.nelm = mEye;
  out.mlim = out.camera ? inst.cameraLimit : limitingMagnitude(D, mEye, EYE_PUPIL_MM, tau);
  out.maxUseful = maxUsefulMagnification(D);
  out.tooMuch = !out.camera && inst.kind === "telescope" && out.M > out.maxUseful * 1.001;
  const res = effectiveResolution({ apertureMm: D, M: out.camera ? 1e6 : out.M, seeingArcsec: seeing, space: !!inst.space, camera: out.camera, lambdaNm: out.lambdaNm });
  out.resolution = res;
  out.seeing = inst.space ? 0 : seeing;
  out.tilt = inst.space ? 0 : tiltRmsArcsec(D, seeing);
  out.tau = tau;
  return out;
}

/* ------------------------------------------------------- sky geometry --- */

/** Position angle (deg, north through east) of a direction b as seen from direction a (J2000 unit vectors). */
export function positionAngle(a, b) {
  const A = vecToRaDec(a), B = vecToRaDec(b);
  const a0 = A.ra * D2R, d0 = A.dec * D2R, a1 = B.ra * D2R, d1 = B.dec * D2R;
  return ((Math.atan2(Math.cos(d1) * Math.sin(a1 - a0),
    Math.sin(d1) * Math.cos(d0) - Math.cos(d1) * Math.sin(d0) * Math.cos(a1 - a0)) * R2D) + 360) % 360;
}
/* Planetary north poles (J2000 RA, Dec), [IAU] 2015 report. */
export const POLES = { jupiter: [268.056595, 64.495303], saturn: [40.589, 83.537], mars: [317.68143, 52.88650], venus: [272.76, 67.16] };
/** Position angle of a planet's north pole on the sky and the planetocentric latitude of the Earth
 *  (De, deg; positive when we see the northern hemisphere). */
export function poleGeometry(id, v) {
  const [ra, dec] = POLES[id];
  const p = raDecToVec(ra, dec);
  const PA = positionAngle(v, p);
  const De = -Math.asin(p[0] * v[0] + p[1] * v[1] + p[2] * v[2]) * R2D;
  return { PA, De };
}

/** Galilean moons on the sky, from the mean longitudes in ephemeris.js ([M] ch. 44 / Lieske E5).
 *  Returns, for each moon, X (Jupiter radii, positive toward the WEST, as in [M]), Y (positive
 *  toward Jupiter's north), and whether it is in front of (transit) or behind the planet.
 *  u is the angle from superior conjunction; the E5 longitudes are referred to the B1950
 *  equinox, so the 0.698 deg of precession from B1950 to J2000 ([M] eq. 44.x term P) is added. */
export const B1950_TO_J2000_DEG = 1.3966626 * (2451545.0 - 2433282.423) / 36525;
export function galileanPositions(jd) {
  const j = body("jupiter", jd);
  const tau = j.lightSeconds / 86400;
  const lon = galileanLongitudes(jd - tau);              // light left the moons tau days ago
  const e = OBLIQUITY_J2000 * D2R, v = j.v;
  const lamJ = Math.atan2(v[1] * Math.cos(e) + v[2] * Math.sin(e), v[0]) * R2D; // geocentric ecliptic longitude
  const { PA, De } = poleGeometry("jupiter", v);
  const moons = GALILEAN.map((m, i) => {
    const u = (lon[i] + B1950_TO_J2000_DEG - lamJ) * D2R;
    const X = -m.a * Math.sin(u);                        // west positive
    const Y = m.a * Math.cos(u) * Math.sin(De * D2R);    // far side appears displaced toward the sub-Earth pole
    const behind = Math.cos(u) > 0;
    const hidden = behind && (X * X + (Y / 0.935) ** 2) < 1;
    const transit = !behind && (X * X + (Y / 0.935) ** 2) < 1;
    return { id: m.id, name: m.name, X, Y, u: ((u * R2D) % 360 + 360) % 360, behind, hidden, transit };
  });
  return { moons, PA, De, diam: j.diam, jupiter: j };
}

/** Everything needed to draw a planet: apparent diameter (arcsec), illuminated fraction,
 *  position angle of the bright limb chi ([M] eq. 48.5) and of the north pole, ring tilt. */
export function planetView(id, jd) {
  const b = body(id, jd), s = body("sun", jd);
  const chi = positionAngle(b.v, s.v);
  const out = { id, diam: b.diam, illum: b.illum, phaseAngle: b.phaseAngle, chi, mag: b.mag, au: b.au, elong: b.elong, v: b.v };
  if (POLES[id]) Object.assign(out, poleGeometry(id, b.v));
  if (id === "saturn") out.ringTilt = saturnRingTilt(b.v);
  return out;
}

/** Altitude now, and next rise / set, of a body id or J2000 {ra, dec} target. */
export function visibility(target, jd, lat, lon) {
  const tgt = typeof target === "string" ? target : raDecToVec(target.ra, target.dec);
  const now = altAzOf(tgt, jd, lat, lon);
  const h0 = typeof target === "string" ? standardAltitude(target, now.distKm) : -0.5667;
  const r = riseSetTransit(tgt, jd, lat, lon, h0, 1, 1 / 48);
  return { alt: now.alt, az: now.az, up: now.alt > 0, nextRise: r.rises[0] || null, nextSet: r.sets[0] || null, alwaysUp: r.alwaysUp, neverUp: r.neverUp };
}

/** Gnomonic (tangent-plane) projection of (ra, dec) about a centre: returns xi (toward EAST)
 *  and eta (toward NORTH) in arcseconds. */
export function tangentPlane(ra, dec, ra0, dec0) {
  const a = ra * D2R, d = dec * D2R, a0 = ra0 * D2R, d0 = dec0 * D2R;
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a - a0);
  const xi = Math.cos(d) * Math.sin(a - a0) / cosc;
  const eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a - a0)) / cosc;
  return { xi: xi * ARCSEC_PER_RAD, eta: eta * ARCSEC_PER_RAD, front: cosc > 0 };
}
