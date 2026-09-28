// motor_mount.scad — centering rings, engine blocks and a one-piece motor mount
// for 18 mm and 24 mm certified model-rocket motors.
// Cosmic Library · experiments/21-3d-printed-model-rocket · MIT licence
//
//   part = "ring"   centering ring: motor tube (BT-20 / BT-50) → body tube
//   part = "block"  engine block (thrust ring) glued inside the FORWARD end of the paper motor tube
//   part = "mount"  one-piece printed motor tube + thrust lip + two centering rings
//
// SAFETY: this holds commercially made, certified motors only (NAR Model Rocket Safety
// Code rule 2). Never modify a motor. Motor casings get hot after burnout: print mounts in
// PETG or ASA, not PLA, and keep a paper motor tube when you can (part = "ring").
//
//   openscad -o ring_18mm_BT60.stl -D 'part="ring"' -D 'motor=18' -D 'tube="BT-60"' motor_mount.scad

include <rocketlib.scad>

/* [What to make] */
part = "ring";           // [ring, block, mount]
motor = 18;              // [13, 18, 24] motor diameter (mm)
tube = "BT-60";          // [BT-50, BT-55, BT-60, BT-70, BT-80, custom] body tube
custom_od = 41.6;
custom_id = 40.5;

/* [Centering ring] */
ring_t = 3.0;            // thickness
fit_out = 0.15;          // radial clearance to the body tube wall
fit_in = 0.10;           // radial clearance to the motor tube
hook_notch = true;       // notch for a metal engine hook running along the motor tube
notch_w = 3.5;           // hook notch width (mm)
notch_d = 1.6;           // hook notch depth (mm)
lightening = true;       // lightening holes on big rings

/* [Engine block] */
block_len = 6;
block_id = 0;            // 0 = auto (leaves a 2 mm shoulder for the motor to push on)

/* [One-piece mount] */
mount_wall = 1.4;
motor_fit = 0.25;        // radial clearance around the motor casing
lip = 2.0;               // forward thrust lip (radial)
overhang = 6;            // motor sticks out this far aft (for the hook / to grab it)

$fn = 120;

bd = tube_dims(tube, custom_od, custom_id);
mt = motor_tube(motor);          // [od, id] of the matching paper motor tube

module ring2d(ro, ri) { difference() { circle(r = ro); circle(r = ri); } }

module centering_ring(ri) {
    ro = bd[1] / 2 - fit_out;
    difference() {
        linear_extrude(ring_t) ring2d(ro, ri);
        if (hook_notch) translate([ri - 0.5, -notch_w / 2, -1]) cube([notch_d + 0.5, notch_w, ring_t + 2]);
        // lightening holes when there is room (≥ 7 mm radial land)
        land = ro - ri;
        if (lightening && land > 9) {
            rm = (ro + ri) / 2; hr = (land - 4) / 2;
            for (a = [45 : 90 : 315]) rotate([0, 0, a]) translate([rm, 0, -1]) cylinder(r = hr, h = ring_t + 2, $fn = 48);
        }
    }
}

if (part == "ring") {
    centering_ring(mt[0] / 2 + fit_in);
}

if (part == "block") {
    ro = mt[1] / 2 - 0.1;
    ri = block_id > 0 ? block_id / 2 : motor / 2 - 2;
    linear_extrude(block_len) ring2d(ro, ri);
}

if (part == "mount") {
    ri = motor / 2 + motor_fit;              // bore for the casing
    ro = ri + mount_wall;
    Lm = motor_len(motor) - overhang;        // printed tube length up to the lip
    difference() {
        union() {
            cylinder(r = ro, h = Lm + 2);                          // tube + lip section
            translate([0, 0, 2])         centering_ring(ro - 0.4);  // aft ring (2 mm up from the end)
            translate([0, 0, Lm - ring_t]) centering_ring(ro - 0.4);// forward ring
        }
        translate([0, 0, -1]) cylinder(r = ri, h = Lm + 1);           // motor bore (stops at the lip)
        translate([0, 0, -1]) cylinder(r = ri - lip, h = Lm + 4);     // ejection-gas passage through the lip
    }
    // Retention: this one-piece mount has no hook. Retain the motor with a snug masking-tape
    // friction wrap (the classic method), or use the paper-tube + kit engine hook build instead.
}
