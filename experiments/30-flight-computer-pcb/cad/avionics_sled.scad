// Cosmic Codex - CC-FL1 avionics sled for a 38 mm airframe / coupler
// ---------------------------------------------------------------------------
// Holds the 80 x 30 x 1.6 mm flight-logger PCB edge-on in two slotted rails,
// a 1S Li-Po (8 x 25 x 40 mm "802540" cell) on a shelf under the board, and
// slides over two threaded rods of your av-bay.
//
// Coordinate system (mm):  X = along the rocket (board tail edge at X=0, nose at X=80)
//                          Y = across the board (board centred, edges at Y=+-15)
//                          Z = normal to the board (board mid-plane Z=0, component side +Z)
//
// Parts (set PART below or pass -D 'PART="nose"' on the command line):
//   "sled"   rails + tail bulkhead + battery shelf. Print standing on the tail bulkhead.
//   "nose"   nose bulkhead, pressed onto the rail pegs. Print flat.
//   "all"    both, assembled (preview only).
//
// Material: PETG or ASA (PLA softens in a hot car / sunny launch field).
// 0.2 mm layers, 4 walls, 30 % gyroid. No supports needed.
// License: CERN-OHL-P-2.0

PART = "all";

// ---------------- parameters you may need to change ----------------
tube_id      = 38.0;   // inside diameter of the tube the sled slides into (measure it!)
fit          = 0.5;    // diametral clearance
pcb_len      = 80.0;
pcb_w        = 30.0;
pcb_t        = 1.6;
slot_clear   = 0.25;   // extra room in the PCB slot (per side)
rod_d        = 3.4;    // M3 / #4-40 all-thread clearance hole
rod_y        = 10.0;   // rod positions (+-Y)
rod_z        = 12.0;   //                (Z)
bulk_t       = 4.0;    // bulkhead thickness
shelf_z_top  = -4.3;   // battery shelf top (below the tallest bottom part, the 3 mm piezo)
shelf_t      = 1.6;
shelf_len    = 36.0;   // stops before the 8.5 mm tall SMD headers at X>38
$fn = 96;

R    = (tube_id - fit) / 2;   // outer radius of sled parts
rail_in  = pcb_w/2 - 1.0;     // rail jaws overlap the PCB edge by 1.0 mm
rail_out = pcb_w/2 + 3.0;
rail_h   = 3.2;               // rail half-height (Z = +-rail_h)
slot_h   = pcb_t/2 + slot_clear;
nose_x   = pcb_len;           // PCB nose edge stops against the nose bulkhead
peg_d    = 3.0;

module disc(t) { rotate([0, 90, 0]) cylinder(r = R, h = t); }

// one rail with the PCB slot; s = +1 / -1 for the two sides
module rail(s) {
    difference() {
        intersection() {
            translate([-bulk_t, s > 0 ? rail_in : -rail_out, -rail_h])
                cube([nose_x + bulk_t, rail_out - rail_in, 2 * rail_h]);
            translate([-bulk_t - 1, 0, 0]) disc(nose_x + bulk_t + 2);
        }
        // PCB slot (runs out through the tail so the board slides in from the tail)
        translate([-bulk_t - 1, s > 0 ? rail_in - 1 : -(pcb_w/2 + slot_clear), -slot_h])
            cube([nose_x + bulk_t + 2, pcb_w/2 + slot_clear - rail_in + 1, 2 * slot_h]);
    }
    // nose-end screw tab under the board (M2 pilot hole at the PCB's H1/H2 position)
    difference() {
        hull() {
            translate([nose_x - 6, s > 0 ? rail_in - 4 : -rail_in, -rail_h]) cube([6, 4, rail_h - slot_h]);
            translate([nose_x - 6, s > 0 ? rail_in : -rail_in, -rail_h - 0.01]) cube([6, 0.01, 0.01]);
        }
        translate([nose_x - 3, s * (pcb_w/2 - 3), -rail_h - 1]) cylinder(d = 1.7, h = rail_h + 1);
    }
    // alignment peg for the nose bulkhead
    translate([nose_x, s * (pcb_w/2 + 1.2), 1.8]) rotate([0, 90, 0]) cylinder(d = peg_d, h = bulk_t * 0.75, $fn = 32);
    translate([nose_x, s * (pcb_w/2 + 1.2), -1.8]) rotate([0, 90, 0]) cylinder(d = peg_d, h = bulk_t * 0.75, $fn = 32);
}

module rod_holes(x0, len) {
    for (s = [-1, 1]) translate([x0, s * rod_y, rod_z]) rotate([0, 90, 0]) cylinder(d = rod_d, h = len, $fn = 32);
}

module tail_bulkhead() {
    difference() {
        translate([-bulk_t, 0, 0]) disc(bulk_t);
        // window: USB plug + microSD access + PCB slot
        translate([-bulk_t - 1, -13, -4.3]) cube([bulk_t + 2, 26, 12]);
        translate([-bulk_t - 1, -(pcb_w/2 + slot_clear), -slot_h]) cube([bulk_t + 2, pcb_w + 2 * slot_clear, 2 * slot_h]);
        // battery lead / wire pass-through
        translate([-bulk_t - 1, -6, -R + 2.5]) cube([bulk_t + 2, 12, 5]);
        rod_holes(-bulk_t - 1, bulk_t + 2);
        // lightening crescent + label
        translate([-bulk_t - 1, 0, 11]) rotate([0, 90, 0]) linear_extrude(0.6 + 1)
            text("CC-FL1", size = 3, halign = "center", valign = "center", font = "Liberation Sans:style=Bold");
    }
}

module battery_shelf() {
    difference() {
        intersection() {
            translate([0, -rail_out, shelf_z_top - shelf_t]) cube([shelf_len, 2 * rail_out, shelf_t]);
            translate([-1, 0, 0]) disc(shelf_len + 2);
        }
        // zip-tie / hook-and-loop strap slots
        for (x = [6, shelf_len - 9]) for (s = [-1, 1])
            translate([x, s * 11 - 1.5, shelf_z_top - shelf_t - 1]) cube([3, 3, shelf_t + 2]);
    }
    // webs tying the shelf to the rails (clipped to the tube)
    intersection() {
        for (s = [-1, 1]) for (x = [0, shelf_len - 2])
            translate([x, s > 0 ? rail_in : -rail_out, shelf_z_top - shelf_t])
                cube([2, rail_out - rail_in, -shelf_z_top + shelf_t - rail_h + 0.01]);
        translate([-1, 0, 0]) disc(shelf_len + 2);
    }
}

module sled() {
    union() {
        tail_bulkhead();
        rail(+1);
        rail(-1);
        battery_shelf();
    }
}

module nose_bulkhead() {
    difference() {
        translate([nose_x, 0, 0]) disc(bulk_t);
        // peg sockets
        for (s = [-1, 1]) for (z = [1.8, -1.8])
            translate([nose_x - 0.01, s * (pcb_w/2 + 1.2), z]) rotate([0, 90, 0]) cylinder(d = peg_d + 0.25, h = bulk_t * 0.8, $fn = 32);
        rod_holes(nose_x - 1, bulk_t + 2);
        // pass-through for GPS / radio antenna leads
        translate([nose_x - 1, -5, -R + 3]) cube([bulk_t + 2, 10, 5]);
        translate([nose_x - 1, 0, -2]) rotate([0, 90, 0]) cylinder(d = 6, h = bulk_t + 2);
        // pressure equalisation: the barometer must see the bay's static pressure
        for (a = [30, 150, 210, 330]) translate([nose_x - 1, 13 * cos(a), 13 * sin(a)]) rotate([0, 90, 0]) cylinder(d = 2.5, h = bulk_t + 2, $fn = 16);
    }
}

// ---------------- output ----------------
if (PART == "sled") sled();
else if (PART == "nose") translate([-nose_x, 0, 0]) nose_bulkhead();
else { sled(); nose_bulkhead(); }
