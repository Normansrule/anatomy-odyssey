// rocketlib.scad — shared dimensions and profile maths for Cosmic Library rocket parts.
// Units: millimetres. Z axis = rocket axis, +Z points toward the nose.
//
// Body-tube sizes are the nominal Estes-standard values (inches → mm):
//   BT-5  0.544 / 0.518 in   BT-20 0.736 / 0.710 in   BT-50 0.976 / 0.950 in
//   BT-55 1.325 / 1.283 in   BT-60 1.637 / 1.595 in   BT-70 2.217 / 2.175 in
//   BT-80 2.600 / 2.558 in
// Real tubes vary by ±0.1 mm between batches and brands: MEASURE yours with calipers
// and use tube = "custom" if the fit is wrong.

// [outer diameter, inner diameter] in mm
function tube_dims(name, custom_od = 24.8, custom_id = 24.1) =
    name == "BT-5"  ? [13.8, 13.2] :
    name == "BT-20" ? [18.7, 18.0] :
    name == "BT-50" ? [24.8, 24.1] :
    name == "BT-55" ? [33.7, 32.6] :
    name == "BT-60" ? [41.6, 40.5] :
    name == "BT-70" ? [56.3, 55.2] :
    name == "BT-80" ? [66.0, 65.0] :
    [custom_od, custom_id];

// Motor casings (certified commercial motors only — see experiments/SAFETY.md)
//   13 mm "mini"  : 13 x 45 mm   (1/4A–A)
//   18 mm standard: 18 x 70 mm   (A–C, e.g. A8-3, B6-4, C6-5)
//   24 mm standard: 24 x 70 mm   (C–D, e.g. D12-3); some E motors are 95 mm long
function motor_len(d) = d == 13 ? 45 : 70;
// The paper motor tube that each motor normally lives in: [od, id]
function motor_tube(d) = d == 13 ? tube_dims("BT-5") : d == 18 ? tube_dims("BT-20") : tube_dims("BT-50");

PI_ = 3.14159265358979;

// Nose-cone radius y at distance x from the tip (0 <= x <= L), base radius R.
// Formulas: Crowell, "The Descriptive Geometry of Nose Cones" (1996).
// OpenSCAD trig works in DEGREES; the Haack series needs theta in radians too.
function nose_r(shape, x, L, R, n = 0.5, K = 1) =
    let(t = max(0, min(1, x / L)))
    shape == "conical"    ? R * t :
    shape == "ogive"      ? let(rho = (R * R + L * L) / (2 * R))           // tangent ogive
                            sqrt(max(0, rho * rho - (L - x) * (L - x))) + R - rho :
    shape == "elliptical" ? R * sqrt(max(0, 1 - (1 - t) * (1 - t))) :
    shape == "parabolic"  ? R * (2 * t - K * t * t) / (2 - K) :
    shape == "power"      ? R * pow(t, n) :
    // Haack series: C = 0 → von Kármán (LD-Haack), C = 1/3 → LV-Haack
    let(C = shape == "lvhaack" ? 1 / 3 : 0,
        th_deg = acos(1 - 2 * t),
        th = th_deg * PI_ / 180,
        s = sin(th_deg))
    R / sqrt(PI_) * sqrt(max(0, th - sin(2 * th_deg) / 2 + C * s * s * s));

// n+1 stations from tip to base, clustered near the tip (where most shapes curve hardest)
function stations(L, n) = [for (i = [0 : n]) L * pow(i / n, 1.6)];
