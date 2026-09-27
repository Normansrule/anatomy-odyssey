// water_rocket.scad — 3D-printed nose cone and fin can for a standard 2-litre PET soda bottle.
// Cosmic Codex · experiments/10-water-bottle-rocket · MIT licence
//
// The rocket flies NECK DOWN: the neck is the nozzle, the bottle's petaloid base is the top.
//   part = "nose"    ogive nose with a skirt that slips over the bottle's base;
//                    hollow so you can press modelling-clay ballast into the tip;
//                    flat soft-tip land for a glued foam pad (safer on landing)
//   part = "fincan"  sleeve that slides down the bottle from the base end until its inner lip
//                    seats on the shoulder; tapered fins with root fillets
//
// MEASURE YOUR BOTTLE: wrap a paper strip around the widest part, mark it, measure the
// length and divide by π. Typical 2 L carbonated-drink bottles are ≈ 110 mm (4.33 in).
//
// Print both parts in PETG (tougher than PLA on hard landings), 3–4 perimeters, 15 % infill.
//   nose:   tip UP, no supports (≈ 190 mm tall)
//   fincan: lip DOWN, no supports; needs a 256 mm bed (Bambu X1/P1/A1). For an A1 mini,
//           set span = 40.
//
//   openscad -o nose.stl   -D 'part="nose"'   water_rocket.scad
//   openscad -o fincan.stl -D 'part="fincan"' water_rocket.scad

/* [Bottle] */
part = "nose";          // [nose, fincan]
bottle_d = 110;         // measured body diameter (mm)
fit = 0.5;              // radial clearance over the bottle

/* [Nose cone] */
nose_len = 140;         // ogive length (mm)
skirt_len = 45;         // how far the skirt overlaps the bottle
nose_wall = 1.6;
soft_tip_d = 18;        // flat land at the tip for a foam pad (0 = pointed)

/* [Fin can] */
fins = 3;               // [3, 4]
sleeve_len = 80;        // = fin root chord
sleeve_wall = 1.6;
lip = 5;                // inward lip that rests on the shoulder (radial, mm)
tip_chord = 40;
span = 60;              // sleeve surface → fin tip
sweep = 40;             // root leading edge → tip leading edge, aft
t_root = 2.8;
t_tip = 1.8;
fillet = 2.5;

$fn = 128;
N = 45;                 // profile stations

Ri = bottle_d / 2 + fit;       // inner radius of skirt / sleeve
Ro_n = Ri + nose_wall;         // nose outer radius
Ro_s = Ri + sleeve_wall;       // sleeve outer radius

// tangent ogive, x from tip (0) to base (L)
function ogive(x, L, R) = let(rho = (R * R + L * L) / (2 * R)) sqrt(max(0, rho * rho - (L - x) * (L - x))) + R - rho;

module nose() {
    L = nose_len; R = Ro_n;
    // first station where the ogive is wider than the soft-tip land
    xs = [for (i = [0 : N]) L * pow(i / N, 1.5)];
    x0 = soft_tip_d > 0 ? min([for (x = xs) if (ogive(x, L, R) >= soft_tip_d / 2) x]) : 0;
    outer = concat([[0, L - x0]], [for (x = xs) if (x >= x0) [ogive(x, L, R), L - x]]);
    skirt = [[R, -skirt_len], [Ri, -skirt_len], [Ri, 0]];
    // inner wall: offset inward horizontally, stops where it would get thinner than 1 mm
    ins = [for (x = xs) if (x > x0 + 6 && ogive(x, L, R) - nose_wall > 1) x];
    inner = [for (i = [len(ins) - 1 : -1 : 0]) [ogive(ins[i], L, R) - nose_wall, L - ins[i]]];
    rotate_extrude(convexity = 6)
        polygon(concat(outer, skirt, inner, [[0, L - ins[0]]]));
}

module slab(r0, r1, z0, z1, th) { translate([r0, -th / 2, z0]) cube([r1 - r0, th, z1 - z0]); }

module fin() {
    zt1 = sleeve_len - sweep; zt0 = zt1 - tip_chord;
    hull() {
        slab(Ro_s - 0.6, Ro_s, 0, sleeve_len, t_root);
        slab(Ro_s + span - 0.01, Ro_s + span, zt0, zt1, t_tip);
    }
    hull() {
        slab(Ro_s - 0.6, Ro_s, 0, sleeve_len, t_root + 2 * fillet);
        slab(Ro_s - 0.6, Ro_s + fillet, 0, sleeve_len, t_root);
    }
}

module fincan() {
    difference() {
        union() {
            cylinder(r = Ro_s, h = sleeve_len);
            for (i = [0 : fins - 1]) rotate([0, 0, i * 360 / fins]) fin();
        }
        // bore, with a 45° inward lip at the aft (bottom) end that seats on the bottle shoulder
        translate([0, 0, lip]) cylinder(r = Ri, h = sleeve_len);
        translate([0, 0, -1]) cylinder(r = Ri - lip, h = lip + 2);
        translate([0, 0, -0.001]) cylinder(r1 = Ri - lip, r2 = Ri, h = lip + 0.002);
        // entry chamfer at the top
        translate([0, 0, sleeve_len - 1]) cylinder(r1 = Ri, r2 = Ri + 1, h = 1.01);
    }
}

if (part == "nose") nose();
if (part == "fincan") fincan();

echo(str("Bottle Ø", bottle_d, " mm → skirt/sleeve bore Ø", 2 * Ri, " mm"));
