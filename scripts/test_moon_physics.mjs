// Node checks for site/assets/js/moon-physics.js (Apollo 11 powered descent).
//   node scripts/test_moon_physics.mjs
// Compares the simulated automatic descent with the Apollo 11 plan and flight.
import {
  Descent, nominal, LM, DPS, isp, G_SURF, G0, FT, LB, DEG, PDI, MU, R_MOON
} from '../site/assets/js/moon-physics.js';

let fails = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) fails++;
}
const within = (v, lo, hi) => v >= lo && v <= hi;

// 1. constants
check('surface gravity ≈ 1.62 m/s²', within(G_SURF, 1.61, 1.635), G_SURF.toFixed(4));
check('LM mass at PDI 14.5–15.1 t (launch 33,205 lb less DOI and RCS)', within(LM.massPDI, 14500, 15100), LM.massPDI.toFixed(0) + ' kg');
check('DPS propellant at PDI ≈ 8.1 t (18,100 lb loaded less DOI)', within(LM.propPDI, 7900, 8210), LM.propPDI.toFixed(0) + ' kg');
check('Isp 311 s at FTP, 285 s at 10 %', isp(DPS.ftp) === 311 && isp(DPS.min) === 285);
check('PDI speed matches a 60 × 8.5 nmi orbit perilune (vis-viva)', Math.abs(PDI.v - Math.sqrt(MU * (2 / (R_MOON + PDI.h) - 2 / (2 * R_MOON + PDI.h + 111120)))) < 8,
  `${PDI.v.toFixed(0)} vs ${Math.sqrt(MU * (2 / (R_MOON + PDI.h) - 2 / (2 * R_MOON + PDI.h + 111120))).toFixed(0)} m/s`);

// 2. coasting orbit stays near perilune altitude
{
  const s = new Descent({ engine: false, auto: false });
  s.runTo(60);
  check('engine off: 60 s coast from perilune changes altitude by < 300 m', Math.abs(s.d.h - PDI.h) < 300, (s.d.h - PDI.h).toFixed(0) + ' m');
}

// 3. nominal automatic descent against the Apollo 11 plan
const run = nominal();
const s = run.sim, td = s.touchdown;
const tdn = run.at('throttledown'), hg = run.at('p64'), lg = run.at('lowgate');
const hgS = run.samples.find(q => q.t >= hg), lgS = run.samples.find(q => q.t >= lg);
check('throttle down near 386 s (planned 384 s) [MR]', within(tdn, 356, 416), tdn.toFixed(0) + ' s');
check('High Gate near 8 min 26 s [TN D-6846]', within(hg, 476, 536), hg.toFixed(0) + ' s');
check('High Gate altitude 6,000–8,000 ft', within(hgS.alt / FT, 6000, 8000), (hgS.alt / FT).toFixed(0) + ' ft');
check('High Gate descent rate ≈125 ft/s [MR]', within(-hgS.vh / FT, 100, 150), (-hgS.vh / FT).toFixed(0) + ' ft/s');
check('Low Gate 500 ft: 40–80 ft/s forward (60 planned)', within(lgS.vx / FT, 40, 80), (lgS.vx / FT).toFixed(0) + ' ft/s');
check('Low Gate 500 ft: 8–25 ft/s down (16 planned)', within(-lgS.vh / FT, 8, 25), (-lgS.vh / FT).toFixed(0) + ' ft/s');
check('Low Gate attitude 10–25° from vertical (≈16° planned)', within(lgS.theta, 10, 25), lgS.theta.toFixed(1) + '°');
check('automatic landing achieved', !!td && td.grade === 'good', td && td.grade);
check('touchdown 10.5–13 min after ignition (plan 11:54, flown 12:35)', within(td.t, 630, 780), (td.t / 60).toFixed(2) + ' min');
const dvFt = td.dv / FT;
check('Δv within 5 % of the planned 6,827 ft/s [TN D-6846]', Math.abs(dvFt / 6827 - 1) < 0.05, dvFt.toFixed(0) + ' ft/s');
check('Δv exceeds the orbital speed it cancels (gravity losses)', td.dv > PDI.v && td.dv < 1.3 * PDI.v, `${td.dv.toFixed(0)} vs ${PDI.v.toFixed(0)} m/s`);
const used = LM.propPDI - td.prop;
check('propellant used < usable load, margin ≥ 60 s of hover', used < LM.propPDI - LM.unusable && td.hoverLeft > 60,
  `${used.toFixed(0)} kg used, ${td.hoverLeft.toFixed(0)} s hover left`);

// 4. hover burn rate at the Apollo 11 landing mass
{
  const m = LM.dry + 770 * LB;                     // ≈770 lb aboard at touchdown [ALSJ]
  const F = m * G_SURF, frac = F / DPS.rated;
  const mdot = F / (isp(frac) * G0);
  check('hover throttle ≈ 25 % (flight: ≈26 % nominal in the final 140 s)', within(frac, 0.22, 0.30), (frac * 100).toFixed(1) + ' %');
  check('hover burn 3.5–4.5 kg/s', within(mdot, 3.5, 4.5), mdot.toFixed(2) + ' kg/s');
  const t = (670 * LB) / mdot;                     // ≈670 lb usable at touchdown [ALSJ]
  check('670 lb usable ≈ 45–80 s of hover (TN D-7143: 63.5 s)', within(t, 45, 80), t.toFixed(0) + ' s');
}

// 5. Apollo 11's P66: Armstrong at 400 ft, 58 ft/s forward, 9 ft/s down (102:43:26)
{
  const a = new Descent({ mode: 'P66', x: -120, h: 400 * FT + LM.cgHeight, vx: 58 * FT, vh: -9 * FT, theta: 5 * DEG, m: LM.dry + 800, prop: 800, auto: false });
  a.takeOver(true);
  a.runTo(1200);
  const t = a.touchdown;
  check('P66 stand-in lands on the clear area', !!t && Math.abs(t.x - 335) < 15 && t.grade === 'good', t && `${t.x.toFixed(0)} m, ${t.grade}`);
  check('P66 flight time 90–160 s (Apollo 11: 134 s)', within(t.t, 90, 160), t.t.toFixed(0) + ' s');
  check('hover left at touchdown 35–80 s (TN D-7143: 63.5 s)', within(t.hoverLeft, 35, 80), t.hoverLeft.toFixed(0) + ' s');
  check('low-level light and 60-second call happen before touchdown', !!a.flags.lowlevel && !!a.flags.bingo60);
}

// 6. throttle band honesty
{
  const b = new Descent({ mode: 'P64', h: 2000, vx: 100, vh: -30, theta: 40 * DEG, auto: false, m: 9000, prop: 2000 });
  b.ftpMode = false;
  b.throttleCmd = 0.75; b._throttle(10); const lo = b.throttleCmd;
  b.throttleCmd = 0.85; b._throttle(10); const hi = b.throttleCmd;
  check('commands in the 60–92.5 % band snap to 60 % or FTP', lo === DPS.maxThrottled && hi === DPS.ftp, `${lo} / ${hi}`);
}

// 7. ROD switch: 1 ft/s per click
{
  const c = new Descent({ mode: 'P66', h: 100, vx: 0, vh: -1, theta: 0, auto: false, m: 7500, prop: 700 });
  c.takeOver(false);
  const r0 = c.rodCmd; c.rod(+1); c.rod(+1);
  check('two ROD clicks up = +2 ft/s', Math.abs(c.rodCmd - r0 - 2 * FT) < 1e-9);
  c.runTo(8);
  check('ROD loop holds the commanded rate within 0.2 m/s', Math.abs(c.d.vh - c.rodCmd) < 0.2, `${c.d.vh.toFixed(2)} vs ${c.rodCmd.toFixed(2)}`);
}

// 8. Landing Point Designator: one click further moves the aim point downrange by ≈2°
{
  const r = nominal({}, 1);
  const s0 = new Descent({});
  s0.runTo(r.at('p64') + 20);
  const a0 = s0.lpdAngle(), x0 = s0.lpdX;
  const ok = s0.redesignate(+1);
  check('LPD click "further" moves the target downrange by 2° of look angle', ok && s0.lpdX > x0 && Math.abs(s0.lpdAngle() - a0 - 2) < 0.05, `${(s0.lpdX - x0).toFixed(0)} m, ${a0.toFixed(1)}° → ${s0.lpdAngle().toFixed(1)}°`);
  s0.runTo(2000);
  check('after a redesignation the automatic landing lands on the new point', !!s0.touchdown && Math.abs(s0.touchdown.x - s0.lpdX) < 10, s0.touchdown && s0.touchdown.x.toFixed(0) + ' m');
}

console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
process.exit(fails ? 1 : 0);
