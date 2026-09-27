// Cosmic Codex - 21 cm hydrogen-line pyramidal horn (dimensions from tools/horn_design.py)
// ---------------------------------------------------------------------------
// PART = "horn"         the whole horn as a thin shell - a PREVIEW / fit-check model, far too big to
//                       print (build it from foam board + aluminium tape using images/horn-cutting-diagram.svg)
//        "probe_jig"    printable gauge: marks the probe hole lambda_g/4 from the back plate and checks
//                       the probe length
// License: CERN-OHL-P-2.0
include <horn_params.scad>

PART = "horn";
t = 3;          // preview wall thickness

module frustum(w0, h0, w1, h1, len) {
    hull() {
        translate([-w0 / 2, -h0 / 2, 0]) cube([w0, h0, 0.01]);
        translate([-w1 / 2, -h1 / 2, len]) cube([w1, h1, 0.01]);
    }
}

module horn() {
    // waveguide section (z < 0), closed at the back
    difference() {
        translate([-a / 2 - t, -b / 2 - t, -guide_len - t]) cube([a + 2 * t, b + 2 * t, guide_len + t]);
        translate([-a / 2, -b / 2, -guide_len]) cube([a, b, guide_len + 1]);
        // probe hole in the broad wall
        translate([0, b / 2 - 1, -guide_len + probe_from_back]) rotate([-90, 0, 0]) cylinder(d = 12, h = t + 2, $fn = 32);
    }
    // flare
    difference() {
        frustum(a + 2 * t, b + 2 * t, a1 + 2 * t, b1 + 2 * t, pe);
        translate([0, 0, -0.01]) frustum(a, b, a1, b1, pe + 0.02);
    }
}

module probe_jig() {
    // strip that butts against the inside of the back plate; the hole marks the probe centre,
    // the notch at the other end is exactly probe_len deep for checking the cut probe
    w = 20; h = 3;
    difference() {
        union() {
            cube([probe_from_back + 15, w, h]);
            translate([-4, 0, 0]) cube([4, w, 12]);  // stop that rests against the back plate
        }
        translate([probe_from_back, w / 2, -1]) cylinder(d = 3, h = h + 2, $fn = 24);
        translate([probe_from_back + 6, w / 2 - 1.1, -1]) cube([10, 2.2, h + 2]);
    }
    translate([0, w + 5, 0]) difference() {
        cube([probe_len + 10, 14, 6]);
        translate([10, 7 - 0.9, 3]) cube([probe_len + 1, 1.8, 4]);  // lay the probe in: flush = correct length
    }
}

if (PART == "horn") horn();
else if (PART == "probe_jig") probe_jig();
