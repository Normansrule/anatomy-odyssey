# Routing the CC-FL1 board — a step-by-step exercise

The generator places every footprint, assigns every net and pours ground on both layers, then
**stops**: the 82 remaining connections (the dashed "ratsnest" lines in
[`../images/pcb-placement.png`](../images/pcb-placement.png)) are yours to route. Routing a real board
by hand is the single best way to learn why placement matters. Budget 3–5 hours the first time.

> [!IMPORTANT]
> After routing, the board must pass **DRC with 0 errors and 0 unconnected items** before you
> order it. Never order an unrouted board: the fab house will happily make it, and nothing will work.

## 0. Open the project

1. Install **KiCad 8** (or 9) from [kicad.org](https://www.kicad.org/download/).
2. Open `hardware/kicad/cc-flight-logger.kicad_pro`. The files were written in the KiCad 7 format;
   KiCad 8/9 upgrade them the first time you save — that is expected.
3. In the PCB editor press **B** (refill zones) and look at the ratsnest.
4. *Board Setup → Design Rules → Constraints*: minimum track 0.15 mm, minimum clearance 0.15 mm,
   minimum via 0.5 mm / 0.3 mm drill — comfortably inside JLCPCB's and PCBWay's standard 2-layer process.
   Net classes are already set: **Default** 0.25 mm tracks, **Power** 0.5 mm tracks (GND, VBUS,
   VBUS_C, VSYS, +BATT, VBAT_SW, +3V3).

## 1. Understand the stack-up you are using

| Layer | Carries |
|---|---|
| **F.Cu (top)** | the Pico's castellated pads, the sensors, the power parts, short signal hops |
| **B.Cu (bottom)** | a mostly-solid ground plane, the microSD, headers, beeper driver |

Rule of thumb for a 2-layer board: keep **B.Cu as unbroken as possible** — every track you run on the
bottom cuts the return path of the signals above it. Prefer short bottom-layer "jumpers" that cross
*under* a single obstacle, and run them perpendicular to the long axis where you can.

> The Pico has test pads (TP1–TP6) on its underside near the USB end. Do **not** put vias or exposed
> copper on F.Cu underneath the Pico: tracks there are fine (they are covered by solder mask), vias are not.

## 2. Route in this order

1. **Power first, wide (0.5 mm).**
   - `VBUS_C`: J1 A9/B9 → D1 anode. `VBUS`: D1 cathode → C1, U2 pin 4, R4, and to U1 pin 40
     (VBUS) along the top edge of the board.
   - `+BATT`: U2 pin 3 → C2 → J2 pin 1 → J3 pin 1 (bottom). `VBAT_SW`: J3 pin 2 → D2 anode, R11.
   - `VSYS`: D2 cathode → U1 pin 39, U5 pin 1, C3, R7, J7 pin 1, D4 cathode.
   - `+3V3` (sensor rail): U5 pin 5 → C4 → U3, U4, C5–C7, R8/R9 (top), then **one** via to the
     bottom for J4 (microSD), R13–R16, C9, C10, J5 pin 1, J6 pin 1.
2. **Decoupling next.** Each 100 nF capacitor must sit between its pin and the nearest ground
   via — track length under 2 mm. Drop a GND via right beside every capacitor ground pad and every
   IC ground pin (the pours only connect what they can reach).
3. **The fine-pitch sensors.** Fan out U3/U4 pads with 0.15 mm tracks for 0.5 mm, then widen to 0.25 mm.
   Tie U3 pins 1-3 and 6-7 to GND and pin 12 (CS) to +3V3 as close to the package as possible. Keep
   I2C_SDA/I2C_SCL as a pair from U3/U4 to the Pico's pins 6/7 (GP4/GP5) — they cross the board, so
   use the bottom layer under the Pico for the long run, with one via at each end.
4. **SPI to the microSD (SD_SCK/MOSI/MISO/CS on Pico pins 21–25).** Short, on the bottom, directly
   from the Pico's pads (vias at the pad, outside the Pico body) to J4. Keep SD_SCK away from the
   barometer.
5. **Everything else**: radio header J5 (Pico pins 14–17, 26, 27), GPS J6 (pins 1, 2), LED/beeper
   (pins 19, 20), `LDO_EN` (pin 29), `VBAT_SENSE` (pin 34), `SD_DET` (pin 11), interrupts (pins 9, 10).
6. **Stitch the pours**: *Place → Via* a GND via every ~5 mm along the board edges and around the
   sensors, then press **B** to refill. Remove islands (*Zone properties → Remove islands: Always*).

## 3. Check

```text
Inspect → Design Rules Checker → Run DRC   (0 errors, 0 unconnected)
Inspect → Electrical Rules Checker (schematic) (0 errors)
View → 3D Viewer                             (does anything collide?)
```

Then run `hardware/scripts/export_fab.sh` (KiCad 8+) to produce gerbers, drill files, the
pick-and-place file and the BOM, and follow [ORDERING.md](ORDERING.md).

## 4. Why the placement looks the way it does

- The **Pico** sits at the tail with its micro-USB flush with the board edge so a cable reaches it
  through the sled's tail window; the **microSD** is right below it on the bottom side for the same reason.
- The **IMU (U3)** sits near the board centre-line; the accelerometer should be on the rocket's axis
  so spin does not add centripetal acceleration ($a_c = \omega^2 r$: 5 rev/s at 10 mm off-axis is already 1 g).
- The **barometer (U4)** is away from the LDO and charger (heat) and from the LEDs (the BMP390 is
  light-sensitive). Cover it with a scrap of open-cell foam in flight.
- **Power enters at the nose end** (USB-C, charger), far from the sensitive analogue sensor rail.
- A 1 mm strip along both long edges is free of parts: it slides into the sled's rail slots.
