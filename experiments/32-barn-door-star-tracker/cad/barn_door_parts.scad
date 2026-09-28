// Cosmic Library - barn-door star tracker, printed parts
// ---------------------------------------------------------------------------
// "Type 1" tracker: a straight M6 x 1.0 threaded rod, perpendicular to the base board at
// distance R from the hinge, turned by a 28BYJ-48 stepper. A nut carriage rides up the rod and
// pushes the top board open. The firmware adds the tangent correction (see README).
//
//   PART = "motor_mount"  bracket under the base board: 28BYJ-48 + 608ZZ thrust bearing
//          "coupler"      5 mm D-shaft -> M6 rod (captive nut + jam nut)
//          "carriage"     M6 nut carriage with a domed contact and an anti-rotation guide hole
//          "contact_plate" smooth plate screwed under the top board where the dome slides
//          "polar_sight"  clip that holds a 6 mm tube parallel to the hinge for polar alignment
//          "all"          everything laid out for a preview
// Print: PETG, 0.2 mm layers, 4 walls, 40 % infill. All parts print flat, no supports.
// License: CERN-OHL-P-2.0

PART = "all";
$fn = 72;

// ---- hardware dimensions (measure yours!)
m6_clear   = 6.5;    // M6 clearance
m6_nut_af  = 10.2;   // M6 nut across flats + clearance
m6_nut_h   = 5.2;
b608_d     = 22.25;  // 608ZZ outer diameter + press-fit clearance
b608_h     = 7.0;
shaft_d    = 5.1;    // 28BYJ-48 output shaft
shaft_flat = 3.1;    // across the two flats
ear_pitch  = 35.0;   // 28BYJ-48 mounting-ear hole spacing
ear_hole   = 4.3;
shaft_off  = 8.0;    // shaft axis is 8 mm off the motor body centre, perpendicular to the ears
motor_d    = 28.5;
screw_d    = 4.2;    // wood screws into the plywood
guide_off  = 20.0;   // anti-rotation guide rod, parallel to the drive rod, offset along the hinge
guide_d    = 6.6;    // 6 mm steel/aluminium rod or another M6 rod

// ---------------------------------------------------------------- motor mount
// z = 0 is where the motor's ears sit; the top face (z = mount_h) screws to the base board underside.
mount_h = 34;
module motor_mount() {
    plate_t = 9;
    difference() {
        union() {
            // top plate
            translate([-30, -22, mount_h - plate_t]) cube([60, 44, plate_t]);
            // two pillars down to the motor ears (ears at x = +-17.5 around the motor centre at y = -shaft_off)
            for (s = [-1, 1]) hull() {
                translate([s * ear_pitch / 2, -shaft_off, 0]) cylinder(d = 9, h = 1);
                translate([s * ear_pitch / 2 - 5, -shaft_off - 5, mount_h - plate_t]) cube([10, 10, 1]);
            }
        }
        // 608 bearing pocket, open at the top so the rod's jam nuts rest on the inner race
        translate([0, 0, mount_h - b608_h]) cylinder(d = b608_d, h = b608_h + 1);
        // clearance for the coupler / rod below the bearing (shoulder supports the outer race)
        translate([0, 0, -1]) cylinder(d = 17.5, h = mount_h + 2);
        // motor ear screw holes (M4 x 10 into the pillar, or through + nut)
        for (s = [-1, 1]) translate([s * ear_pitch / 2, -shaft_off, -1]) cylinder(d = 3.5, h = 14);
        // wood-screw holes, countersunk from below
        for (x = [-24, 24]) for (y = [-16, 16]) {
            translate([x, y, -1]) cylinder(d = screw_d, h = mount_h + 2);
            translate([x, y, mount_h - plate_t - 0.01]) cylinder(d1 = 9, d2 = screw_d, h = 2.5);
        }
    }
}

// ---------------------------------------------------------------- coupler
coup_d = 16; coup_h = 24;
module coupler() {
    difference() {
        cylinder(d = coup_d, h = coup_h);
        // D-shaft bore, 9 mm deep
        translate([0, 0, -1]) intersection() {
            cylinder(d = shaft_d, h = 10);
            translate([-shaft_d / 2, -shaft_flat / 2, 0]) cube([shaft_d, shaft_flat, 10]);
        }
        // M3 set screw across the flat (self-tapping into plastic)
        translate([0, 0, 4.5]) rotate([90, 0, 0]) cylinder(d = 2.7, h = coup_d);
        // M6 rod bore + captive nut from the top
        translate([0, 0, 11]) cylinder(d = m6_clear, h = coup_h);
        translate([0, 0, coup_h - m6_nut_h]) cylinder(d = m6_nut_af / cos(30), h = m6_nut_h + 1, $fn = 6);
    }
}

// ---------------------------------------------------------------- nut carriage
car_w = 18; car_h = 12; dome_r = 9; dome_h = 3.5;
module carriage() {
    difference() {
        union() {
            translate([-car_w / 2, -car_w / 2, 0]) cube([car_w, guide_off + car_w, car_h]);
            // dome centred over the drive rod: the contact point stays at distance R from the hinge
            intersection() {
                translate([0, 0, car_h + dome_h - dome_r]) sphere(r = dome_r);
                translate([-dome_r, -dome_r, car_h - 0.01]) cube([2 * dome_r, 2 * dome_r, dome_h + 0.02]);
            }
        }
        // drive rod: M6 nut trapped from below + clearance through the dome
        translate([0, 0, -1]) cylinder(d = m6_nut_af / cos(30), h = m6_nut_h + 1, $fn = 6);
        translate([0, 0, -1]) cylinder(d = m6_clear, h = car_h + dome_h + 2);
        // guide rod slot (a slot, not a hole, so a slightly non-parallel rod cannot bind)
        hull() for (dy = [-0.6, 0.6]) translate([0, guide_off + dy, -1]) cylinder(d = guide_d, h = car_h + 2);
    }
}

// ---------------------------------------------------------------- contact plate
// Screwed under the top board, centred on the slot the rod passes through. The carriage's dome
// slides along it on both sides of the slot.
module contact_plate() {
    difference() {
        hull() for (x = [-35, 35]) for (y = [-12, 12]) translate([x, y, 0]) cylinder(r = 3, h = 3);
        // slot for the drive rod: the rod stays perpendicular to the base while the top board
        // tilts, so it passes through a slot in the plate (and in the top board) - 8 x 50 mm
        hull() for (x = [-21, 21]) translate([x, 0, -1]) cylinder(d = 8, h = 5);
        for (x = [-31, 31]) translate([x, 0, -1]) {
            cylinder(d = 3.6, h = 5);
            translate([0, 0, 1.4]) cylinder(d1 = 3.6, d2 = 7.4, h = 1.61);
        }
    }
}

// ---------------------------------------------------------------- polar sight
// A 6 mm OD tube (aluminium/brass, ~150 mm) pressed into the bore is a sighting tube for Polaris.
// Screw the clip to the top board so the bore is parallel to the hinge pin.
module polar_sight() {
    difference() {
        union() {
            translate([-40, -8, 0]) cube([80, 16, 14]);      // tube block
            translate([-40, -16, 0]) cube([80, 32, 4]);      // screw flanges
        }
        translate([-41, 0, 8.5]) rotate([0, 90, 0]) cylinder(d = 6.15, h = 82);  // press fit, add a drop of glue
        for (x = [-30, 30]) for (y = [-12, 12]) translate([x, y, -1]) {
            cylinder(d = 3.6, h = 6);
            translate([0, 0, 2.4]) cylinder(d1 = 3.6, d2 = 7.4, h = 1.61);
        }
    }
}

if (PART == "motor_mount") motor_mount();
else if (PART == "coupler") coupler();
else if (PART == "carriage") carriage();
else if (PART == "contact_plate") contact_plate();
else if (PART == "polar_sight") polar_sight();
else {
    motor_mount();
    translate([55, 0, 0]) coupler();
    translate([85, 0, 0]) carriage();
    translate([0, 70, 0]) contact_plate();
    translate([0, 110, 0]) polar_sight();
}
