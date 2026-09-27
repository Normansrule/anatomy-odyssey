// Cosmic Codex - 1U CubeSat-style structure for a high-altitude balloon payload
// ---------------------------------------------------------------------------
// Outer envelope follows the CubeSat Design Specification 1U size: 100.0 x 100.0 mm footprint,
// 113.5 mm tall, with 8.5 mm square corner rails. (A balloon flight does not need CDS compliance; using
// the format means your electronics would also fit a real 1U structure later.)
//
// PART = "frame"       one-piece open frame: 4 rails + top and bottom rings with a centre line-guide
//                      and 4 M3 rod channels for stacking 82 x 82 mm boards on threaded rods
//        "panel"       side panel (x4), screws to the rails
//        "panel_cam"   side panel with a camera window and a cable/antenna gland
//        "all"         assembled preview
// Print: PETG or ASA (PLA gets brittle at -50 C), 0.2 mm, 4 walls, 30 % gyroid. Frame prints upright
// without supports (the ring cross-members bridge 60 mm). The printed structure rides INSIDE an
// insulating foam box on the flight line - see the README.
// License: CERN-OHL-P-2.0

PART = "all";
$fn = 48;

W = 100.0;        // footprint
H = 113.5;        // height
rail = 8.5;       // rail square
ring_h = 6;       // top/bottom ring thickness
rod_off = 37.0;   // M3 rod channels at (+-37, +-37): 82 x 82 mm boards with holes on a 74 mm square (4 mm from the edges)
m3 = 3.4;
line_d = 12;      // flight-line guide through the centre (the load goes through the line, not the plastic)

module rails() {
    for (x = [0, W - rail]) for (y = [0, W - rail])
        translate([x, y, 0]) cube([rail, rail, H]);
}

module ring(z) {
    translate([0, 0, z]) difference() {
        union() {
            difference() {
                cube([W, W, ring_h]);
                translate([rail + 2, rail + 2, -1]) cube([W - 2 * (rail + 2), W - 2 * (rail + 2), ring_h + 2]);
            }
            // diagonal cross-members meeting at the centre line guide
            for (a = [45, 135]) translate([W / 2, W / 2, 0]) rotate(a) translate([-W * 0.66, -4, 0]) cube([W * 1.32, 8, ring_h]);
            translate([W / 2, W / 2, 0]) cylinder(d = line_d + 8, h = ring_h);
            // bosses for the M3 rods
            for (sx = [-1, 1]) for (sy = [-1, 1]) translate([W / 2 + sx * rod_off, W / 2 + sy * rod_off, 0]) cylinder(d = 8, h = ring_h);
        }
        translate([W / 2, W / 2, -1]) cylinder(d = line_d, h = ring_h + 2);
        for (sx = [-1, 1]) for (sy = [-1, 1]) translate([W / 2 + sx * rod_off, W / 2 + sy * rod_off, -1]) cylinder(d = m3, h = ring_h + 2);
    }
}

// panel screw holes: 3 per rail edge, M2.5 self-tapping into the rails
panel_z = [15, H / 2, H - 15];
module rail_holes() {
    for (x = [rail / 2, W - rail / 2]) for (z = panel_z)
        translate([x, -1, z]) rotate([-90, 0, 0]) cylinder(d = 2.2, h = rail + 2);
}

module frame() {
    intersection() {
        difference() {
            union() {
                rails();
                ring(0);
                ring(H - ring_h);
                ring(H / 2 - ring_h / 2);  // mid ring stiffens the rails
            }
            // pilot holes for the panels on all four faces
            for (r = [0, 90, 180, 270]) translate([W / 2, W / 2, 0]) rotate(r) translate([-W / 2, -W / 2, 0]) rail_holes();
        }
        cube([W, W, H]);
    }
}

panel_t = 2.0;
module panel(cam = false) {
    // lies flat for printing: X = width (100), Y = height (113.5), Z = thickness
    difference() {
        cube([W, H, panel_t]);
        for (x = [rail / 2, W - rail / 2]) for (z = panel_z) translate([x, z, -1]) cylinder(d = 2.9, h = panel_t + 2);
        // lightening / vent slots (vent: the inside must equalise with the outside pressure)
        for (i = [0:(cam ? 2 : 3)]) translate([25, 20 + i * 22, -1]) cube([50, 6, panel_t + 2]);
        if (cam) {
            translate([W / 2, H * 0.72, -1]) cylinder(d = 14, h = panel_t + 2);   // lens window
            translate([15, 18, -1]) cylinder(d = 7, h = panel_t + 2);             // cable / antenna gland
        }
    }
}

if (PART == "frame") frame();
else if (PART == "panel") panel(false);
else if (PART == "panel_cam") panel(true);
else {
    frame();
    // two panels shown in place
    translate([0, -panel_t, 0]) rotate([90, 0, 0]) translate([0, 0, -panel_t]) panel(true);
    translate([W + panel_t, 0, 0]) rotate([90, 0, 90]) panel(false);
}
