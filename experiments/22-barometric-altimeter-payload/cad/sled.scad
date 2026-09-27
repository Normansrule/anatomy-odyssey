// sled.scad — avionics sled for a Raspberry Pi Pico + BMP280/BMP390 breakout + small battery,
// sliding into a BT-60 (40.5 mm inner diameter) payload bay.
// Cosmic Codex · experiments/22-barometric-altimeter-payload · MIT licence
//
//   top of deck : Pico on four M2 standoffs (holes 47.0 × 11.4 mm, from the Pico datasheet)
//                 + sensor pad with two zip-tie slots
//   under deck  : battery, held by two zip ties through the slots
//   two arches  : locate the sled against the tube wall; the deck edges touch the wall too
//
// Print DECK DOWN, no supports (the arches bridge fine), PETG or PLA, 3 perimeters, 20 % infill.
//   openscad -o sled.stl sled.scad

/* [Tube] */
tube_id = 40.5;        // BT-60 inner diameter; BT-55 = 32.6 (too narrow for a Pico lying flat), BT-70 = 55.2
clear = 0.35;          // radial clearance

/* [Sled] */
len = 92;              // overall length
deck_t = 2.4;
deck_y = -8.5;         // deck bottom height relative to the tube axis (negative = below)
arch_w = 4;            // arch thickness along the axis
arch_t = 2.4;          // arch radial thickness
standoff_h = 4;
standoff_d = 5;
screw_d = 1.8;         // M2 self-tapping into plastic

$fn = 96;

R = tube_id / 2 - clear;
half_w = sqrt(R * R - deck_y * deck_y);          // deck half-width at its bottom face

module deck() {
    // deck = slab of the tube cross-section between deck_y and deck_y + deck_t, extruded along X
    rotate([90, 0, 90]) linear_extrude(len)
        intersection() {
            circle(r = R);
            translate([-R, deck_y]) square([2 * R, deck_t]);
        }
}

module arch(x0) {
    translate([x0, 0, 0]) rotate([90, 0, 90]) linear_extrude(arch_w)
        intersection() {
            difference() { circle(r = R); circle(r = R - arch_t); }
            translate([-R, deck_y]) square([2 * R, 2 * R]);
        }
}

// Pico hole pattern centred on the deck (datasheet: 51 × 21 mm board, holes 47 × 11.4 mm)
pico_x = 8 + 25.5;               // board centre along the sled
module standoffs() {
    for (dx = [-23.5, 23.5], dy = [-5.7, 5.7])
        translate([pico_x + dx, dy, deck_y + deck_t]) cylinder(d = standoff_d, h = standoff_h);
}
module screw_holes() {
    for (dx = [-23.5, 23.5], dy = [-5.7, 5.7])
        translate([pico_x + dx, dy, deck_y - 1]) cylinder(d = screw_d, h = deck_t + standoff_h + 2);
}
module slot(x, y) { translate([x - 2, y - 1, deck_y - 1]) cube([4, 2, deck_t + 2]); }

difference() {
    union() {
        deck();
        arch(0);
        arch(len - arch_w);
        standoffs();
    }
    screw_holes();
    // zip-tie slots: battery (under) and sensor pad (top, aft of the Pico)
    for (x = [22, 45, 68]) { slot(x, half_w - 5); slot(x, -(half_w - 5)); }
    for (y = [-9, 9]) slot(len - 14, y);
    // wire pass-through and a label window
    translate([len - 24, -3, deck_y - 1]) cube([6, 6, deck_t + 2]);
}

echo(str("Sled: deck width ", 2 * half_w, " mm, headroom above deck ", R - deck_y - deck_t,
         " mm, space below ", R + deck_y, " mm"));
