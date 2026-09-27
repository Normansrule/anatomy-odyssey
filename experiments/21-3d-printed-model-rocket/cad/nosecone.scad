// nosecone.scad — parametric, hollow, 3D-printable model-rocket nose cone.
// Cosmic Codex · experiments/21-3d-printed-model-rocket · MIT licence
//
// Print TIP UP, no supports: 2–3 perimeters, 0.16–0.2 mm layers, 10–15 % infill.
// The shoulder is open at the bottom; a printed cross-bar inside the shoulder is the
// shock-cord anchor (tie the cord around it, or loop a Kevlar leader through).
//
// Export one variant from the command line, e.g.
//   openscad -o nose_ogive_BT50.stl -D 'profile="ogive"' -D 'tube="BT-50"' nosecone.scad

include <rocketlib.scad>

/* [Body tube] */
tube = "BT-50";           // [BT-5, BT-20, BT-50, BT-55, BT-60, BT-70, BT-80, custom]
custom_od = 24.8;         // used only when tube = "custom"
custom_id = 24.1;

/* [Shape] */
profile = "vonkarman";    // [conical, ogive, vonkarman, lvhaack, parabolic, elliptical, power]
fineness = 3.5;           // nose length ÷ body diameter (3–5 is typical)
power_n = 0.5;            // exponent for "power" (0.5 = blunt, 0.75 = sharper)
parabolic_k = 1.0;        // K for "parabolic" (0 = cone, 0.5 = ½ parabola, 1 = full)

/* [Construction] */
wall = 1.2;               // shell thickness measured horizontally (= 3 lines of 0.4 mm)
shoulder_cal = 0.9;       // shoulder length in body diameters
fit = 0.15;               // radial clearance between shoulder and tube wall
solid_tip = 8;            // the last few mm at the tip are solid for strength
anchor_bar = true;        // printed cross-bar for the shock cord
bar_w = 3.2;              // cross-bar width and height (mm)

/* [Quality] */
$fn = 96;
n_st = 70;                // profile stations

d  = tube_dims(tube, custom_od, custom_id);
R  = d[0] / 2;                     // outer radius = body-tube outer radius
Rs = d[1] / 2 - fit;               // shoulder outer radius
L  = fineness * d[0];              // nose length
Ls = shoulder_cal * d[0];          // shoulder length

xs = stations(L, n_st);
function ro(x) = nose_r(profile, x, L, R, power_n, parabolic_k);

// inner cavity stops where the wall would get too thin, or at the solid tip
x_in_top = max([for (x = xs) if (x <= solid_tip || ro(x) - wall < 0.6) x]);
inner_xs = [for (x = xs) if (x > x_in_top) x];

// 2-D half-section in (r, z) with z = L - x (tip at z = L, base at z = 0)
outer_pts = [for (x = xs) [ro(x), L - x]];
shoulder  = [[Rs, 0], [Rs, -Ls], [Rs - wall, -Ls], [Rs - wall, 0]];
inner_pts = [for (i = [len(inner_xs) - 1 : -1 : 0]) let(x = inner_xs[i]) [ro(x) - wall, L - x]];
close_pts = [[0, L - inner_xs[0]]];

module shell() {
    rotate_extrude(convexity = 6)
        polygon(concat(outer_pts, shoulder, inner_pts, close_pts));
}

module anchor() {
    // horizontal bar across the shoulder, 3 mm above its bottom edge; ends buried 0.4 mm in the wall
    span = 2 * (Rs - wall) + 0.8;
    translate([0, 0, -Ls + 3 + bar_w / 2]) cube([span, bar_w, bar_w], center = true);
}

union() {
    shell();
    if (anchor_bar) intersection() {
        anchor();
        cylinder(r = Rs - 0.2, h = 4 * Ls, center = true);   // keep it inside the shoulder
    }
}

echo(str("Nose cone: ", profile, " for ", tube, "  L = ", L, " mm, shoulder = ", Ls,
         " mm, base Ø ", 2 * R, " mm, shoulder Ø ", 2 * Rs, " mm"));
