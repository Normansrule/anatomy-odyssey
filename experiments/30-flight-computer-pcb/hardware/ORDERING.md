# Ordering CC-FL1 boards (JLCPCB or PCBWay)

Only order after the board is **routed and passes DRC with zero errors and zero unconnected items**
(see [ROUTING.md](ROUTING.md)). Then run `scripts/export_fab.sh` (KiCad 8+). It writes:

| File | What the fab needs it for |
|---|---|
| `fab/cc-fl1-gerbers.zip` | copper, solder mask, silkscreen, paste and outline layers + Excellon drill files |
| `fab/cc-fl1-cpl.csv` | component placement list ("CPL" / "centroid") — only for assembly |
| `fab/cc-fl1-bom.csv` | bill of materials with the LCSC column — only for assembly |

## Board options (both fabs)

| Option | Choose | Why |
|---|---|---|
| Layers | 2 | the design is 2-layer |
| Dimensions | 80 × 30 mm (auto-detected from the gerbers) | |
| Thickness | **1.6 mm** | the sled's rail slots are cut for 1.6 mm |
| Material | FR-4, TG 135–155 | standard |
| Min track / spacing | 6/6 mil (0.15 mm) | the design uses ≥ 0.15 mm |
| Min hole | 0.3 mm | |
| Surface finish | **ENIG** (recommended) or lead-free HASL | ENIG is flat: the 0.5 mm-pitch LGA sensors solder far more reliably on it |
| Solder mask | any colour | green is cheapest and fastest |
| Castellated holes | **No** | the *Pico* has castellations; this board has ordinary pads |
| Remove order number | "specify a location" or pay to remove | put it under the Pico |
| Stencil | **yes, if you reflow the sensors yourself** (framework-less, top side) | |

A pack of 5 boards typically costs a few US dollars plus shipping; ENIG adds a little.

## Assembly strategy — pick one

The two sensors are 2 × 2 mm and 2.5 × 3 mm **LGA** packages: the pads are *under* the part, so a
soldering iron cannot reach them. Everything else on this board is hand-solderable 0805 / SOT-23 / SMA.

1. **Let the fab place the fine-pitch parts (easiest).** Order "PCB Assembly", top side only, and
   in the uploaded BOM *exclude* everything except U3 (LSM6DSO32), U4 (BMP390), U5, U2 and the 0805
   parts around them if you like. Search each MPN in the fab's parts library; LGA sensors are usually
   "extended" parts with a small per-part loading fee. Check the placement preview: **pin 1 of each
   sensor must match the dot on the silkscreen** — rotate in the preview if it does not.
2. **Hot plate + stencil (best learning).** Apply paste through the stencil, place U3/U4 with
   tweezers, reflow on a small hot plate (≈ 235 °C peak for lead-free, or follow the paste's profile),
   then hand-solder the rest. Inspect the sensors' edges with a loupe; you cannot see the pads, so
   the power-on self-test in the README is your real inspection.
3. **Hot-air only.** Tin the pads thinly, add flux, place the part, heat from above until it settles
   ("self-aligns"). Works, but is the least repeatable of the three.

Solder the **Pico last**: align it over its pads, tack two diagonal corners, check it sits flat, then
drag-solder each castellation with plenty of flux.

## Before you click "order"

- [ ] DRC: 0 errors, 0 unconnected. ERC: 0 errors.
- [ ] Gerber viewer (the fab's online viewer or KiCad's GerbView): outline closed, no missing layers,
      drill hits line up with pads, silkscreen does not cover pads.
- [ ] The BMP390 land pattern matches Bosch's drawing in datasheet BST-BMP390-DS002 (section
      "Landing pattern recommendation"). The footprint here was derived from the pin table and the
      common 2 × 2 mm 10-pad layout — **measure it against the PDF yourself**; this is the one
      footprint in the design that is not from KiCad's reviewed library.
- [ ] Battery connector polarity: many hobby Li-Po leads are wired opposite to JST's pin 1 = +
      convention. Check with a meter before plugging in.
- [ ] Part numbers: LCSC / DigiKey numbers in `BOM.csv` are a starting point — search by
      **manufacturer part number (MPN)** to confirm stock, package and price on the day you order.
