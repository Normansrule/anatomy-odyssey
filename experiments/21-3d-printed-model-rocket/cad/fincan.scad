// fincan.scad — parametric slide-on fin can for paper model-rocket body tubes.
// Cosmic Library · experiments/21-3d-printed-model-rocket · MIT licence
//
// The sleeve slides over the aft end of the body tube and is glued with epoxy or CA.
// Fins are tapered (thicker at the root) and have printed root fillets.
// Print AFT END DOWN (fin trailing edges on the plate), no supports, 4 perimeters,
// 25–40 % gyroid infill. PETG or ASA near the motor if you fly C/D motors often.
//
//   openscad -o fincan_BT60.stl -D 'tube="BT-60"' fincan.scad

include <rocketlib.scad>

/* [Body tube] */
tube = "BT-50";          // [BT-20, BT-50, BT-55, BT-60, BT-70, BT-80, custom]
custom_od = 24.8;
custom_id = 24.1;

/* [Fins] (0 = use the size-based default) */
fins = 3;                // [3, 4]
root = 0;                // root chord (mm)
tip = 0;                 // tip chord (mm)
span = 0;                // semi-span, sleeve surface → tip (mm)
sweep = 0;               // root leading edge → tip leading edge, measured aft (mm)
t_root = 0;              // fin thickness at the root (mm)
t_tip = 0;               // fin thickness at the tip (mm)
fillet = 2.0;            // root fillet leg (mm)

/* [Sleeve] */
sleeve_wall = 1.6;
fit = 0.2;               // radial clearance over the tube
extra = 4;               // sleeve extends this far forward of the fin root

/* [Launch lug] */
lug = true;
lug_rod = 3.2;           // launch-rod diameter: 3.2 (1/8 in) or 4.8 (3/16 in)
lug_len = 32;

$fn = 120;

d  = tube_dims(tube, custom_od, custom_id);
D  = d[0];
Ri = D / 2 + fit;              // sleeve inner radius
Ro = Ri + sleeve_wall;         // sleeve outer radius

// Size-based defaults: a clipped delta whose trailing edge is flush with the aft end.
Cr = root  > 0 ? root  : 2.0 * D + 2;
Ct = tip   > 0 ? tip   : 0.9 * D;
S  = span  > 0 ? span  : 1.6 * D;
Xs = sweep > 0 ? sweep : Cr - Ct;
Tr = t_root > 0 ? t_root : (D < 30 ? 2.4 : 3.2);
Tt = t_tip  > 0 ? t_tip  : Tr * 0.6;
H  = Cr + extra;               // sleeve length

module slab(r0, r1, z0, z1, th) {       // thin box: radial r0→r1, axial z0→z1, thickness th (along Y)
    translate([r0, -th / 2, z0]) cube([r1 - r0, th, z1 - z0]);
}

module fin() {
    zr0 = 0;           zr1 = Cr;                     // root: trailing edge at the aft end
    zt1 = Cr - Xs;     zt0 = zt1 - Ct;               // tip leading / trailing edge
    hull() {
        slab(Ro - 0.6, Ro, zr0, zr1, Tr);            // root, buried 0.6 mm in the sleeve
        slab(Ro + S - 0.01, Ro + S, zt0, zt1, Tt);   // tip
    }
    hull() {                                         // root fillet (chamfer)
        slab(Ro - 0.6, Ro, zr0, zr1, Tr + 2 * fillet);
        slab(Ro - 0.6, Ro + fillet, zr0, zr1, Tr);
    }
}

module lug_tube() {
    lr = lug_rod / 2 + 0.3;                // 0.3 mm radial clearance on the rod
    lo = lr + 1.0;                         // 1 mm wall
    rotate([0, 0, 180 / fins]) translate([Ro + lo - 0.5, 0, 0])
        difference() {
            union() {
                cylinder(r = lo, h = lug_len);
                translate([-lo, -lo * 0.6, 0]) cube([lo, lo * 1.2, lug_len]);   // web to the sleeve
            }
            translate([0, 0, -1]) cylinder(r = lr, h = lug_len + 2);
        }
}

difference() {
    union() {
        cylinder(r = Ro, h = H);
        for (i = [0 : fins - 1]) rotate([0, 0, i * 360 / fins]) fin();
        if (lug) lug_tube();
    }
    translate([0, 0, -1]) cylinder(r = Ri, h = H + 2);
    // small entry chamfer so the sleeve starts easily over the tube
    translate([0, 0, H - 0.8]) cylinder(r1 = Ri, r2 = Ri + 0.8, h = 0.81);
}

echo(str("Fin can for ", tube, ": ", fins, " fins, root ", Cr, ", tip ", Ct, ", span ", S,
         ", sweep ", Xs, " mm; sleeve Ø", 2 * Ri, "/", 2 * Ro, " × ", H, " mm"));
