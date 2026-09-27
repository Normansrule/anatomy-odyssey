"""Single source of truth for the Cosmic Codex flight logger ("CC-FL1").

Every part, every pin-to-net connection, the schematic position and the PCB
placement live here. `generate.py` turns this into the KiCad schematic,
the KiCad board and BOM.csv, and `check.py` verifies that KiCad's own
netlist export agrees with this file.

Coordinates
-----------
* `sch`: (x, y, rotation) in millimetres on an A3 sheet, Y down, rotation CCW degrees.
* `pcb`: (x, y, rotation, side) in millimetres relative to the board's top-left
  corner (board is 80 x 30 mm), rotation CCW degrees, side "F" (top) or "B" (bottom).

Pin map of the Raspberry Pi Pico (GPn = RP2040 GPIO n)
-------------------------------------------------------
GP0/GP1   UART0  -> GPS header         GP4/GP5   I2C0 -> IMU + barometer
GP6       IMU INT1                     GP7       barometer INT
GP8       microSD card-detect          GP10-13   SPI1 -> radio header (RFM95W)
GP14      status LED                   GP15      buzzer driver
GP16-19   SPI0 -> microSD              GP20/21   radio DIO0 / RESET
GP22      sensor-rail LDO enable       GP28/ADC2 battery voltage / 2
"""

PROJECT = "cc-flight-logger"
TITLE = "Cosmic Codex Flight Logger CC-FL1"
REV = "A"
DATE = "2026-09-26"

# (ref, lib_id, value, footprint, pins{pin: net}, sch(x,y,rot), pcb(x,y,rot,side), bom{...})
# A net called "NC" means "leave unconnected" (a no-connect flag is drawn).

R0805 = "Resistor_SMD:R_0805_2012Metric_Pad1.20x1.40mm_HandSolder"
C0805 = "Capacitor_SMD:C_0805_2012Metric_Pad1.18x1.45mm_HandSolder"
LED0805 = "LED_SMD:LED_0805_2012Metric_Pad1.15x1.40mm_HandSolder"


def R(ref, value, n1, n2, sch, pcb, lcsc, note=""):
    return dict(ref=ref, lib="Device:R", value=value, fp=R0805, pins={"1": n1, "2": n2}, sch=sch, pcb=pcb,
                bom=dict(desc=f"Resistor {value} 1% 0805", mfr="UNI-ROYAL", mpn=f"0805W8F{_rcode(value)}T5E",
                         lcsc=lcsc, digikey="", note=note))


def C(ref, value, n1, n2, sch, pcb, lcsc, desc, mpn, mfr="Samsung", note=""):
    return dict(ref=ref, lib="Device:C", value=value, fp=C0805, pins={"1": n1, "2": n2}, sch=sch, pcb=pcb,
                bom=dict(desc=desc, mfr=mfr, mpn=mpn, lcsc=lcsc, digikey="", note=note))


def _rcode(v):
    """UNI-ROYAL 0805W8F part code: 1k -> 1001, 4.7k -> 4701, 100k -> 1003, 5.1k -> 5101."""
    mult = {"k": 1e3, "M": 1e6}
    num = float(v.rstrip("kM")) * mult.get(v[-1], 1)
    exp = 0
    while num >= 1000:
        num /= 10
        exp += 1
    return f"{int(round(num)):03d}{exp}"


PARTS = [
    # ------------------------------------------------------------------ MCU module
    dict(ref="U1", lib="cosmic_codex:RaspberryPi_Pico", value="Raspberry Pi Pico",
         fp="cosmic_codex:RaspberryPi_Pico_Castellated_HandSolder",
         pins={"1": "GPS_RX", "2": "GPS_TX", "3": "GND", "4": "NC", "5": "NC", "6": "I2C_SDA", "7": "I2C_SCL",
               "8": "GND", "9": "IMU_INT1", "10": "BARO_INT", "11": "SD_DET", "12": "NC", "13": "GND",
               "14": "RADIO_SCK", "15": "RADIO_MOSI", "16": "RADIO_MISO", "17": "RADIO_CS", "18": "GND",
               "19": "LED_STATUS", "20": "BUZZ_GPIO", "21": "SD_MISO", "22": "SD_CS", "23": "GND",
               "24": "SD_SCK", "25": "SD_MOSI", "26": "RADIO_DIO0", "27": "RADIO_RST", "28": "GND",
               "29": "LDO_EN", "30": "NC", "31": "NC", "32": "NC", "33": "GND", "34": "VBAT_SENSE",
               "35": "NC", "36": "NC", "37": "NC", "38": "GND", "39": "VSYS", "40": "VBUS"},
         sch=(203.2, 139.7, 0), pcb=(25.5, 15.0, 90, "F"),
         bom=dict(desc="Raspberry Pi Pico (RP2040, 2 MB flash), castellated module", mfr="Raspberry Pi Ltd",
                  mpn="SC0915", lcsc="", digikey="2648-SC0915CT-ND",
                  note="Pico W (SC0918) also fits; GP29/VSYS-sense differs on W")),

    # ------------------------------------------------------------------ USB-C charge input
    dict(ref="J1", lib="Connector:USB_C_Receptacle_PowerOnly_6P", value="USB-C (power only)",
         fp="Connector_USB:USB_C_Receptacle_GCT_USB4125-xx-x_6P_TopMnt_Horizontal",
         pins={"A9": "VBUS_C", "B9": "VBUS_C", "A5": "CC1", "B5": "CC2", "A12": "GND", "B12": "GND", "S1": "GND"},
         sch=(40.64, 63.5, 0), pcb=(76.0, 15.0, 90, "F"),
         bom=dict(desc="USB Type-C receptacle, 6-pin power only, top mount", mfr="GCT", mpn="USB4125-GF-A",
                  lcsc="", digikey="2073-USB4125-GF-ACT-ND", note="Charge/power only; data uses the Pico's micro-USB")),
    R("R1", "5.1k", "CC1", "GND", (68.58, 78.74, 0), (69.5, 12.5, 90, "F"), "C27834", "Sink (UFP) pull-down on CC1"),
    R("R2", "5.1k", "CC2", "GND", (78.74, 78.74, 0), (69.5, 17.5, 90, "F"), "C27834", "Sink (UFP) pull-down on CC2"),
    dict(ref="D1", lib="Diode:SS14", value="SS14", fp="Diode_SMD:D_SMA",
         pins={"1": "VBUS", "2": "VBUS_C"}, sch=(76.2, 45.72, 0), pcb=(65.0, 4.2, 0, "F"),
         bom=dict(desc="Schottky diode 40 V 1 A, SMA", mfr="MDD", mpn="SS14", lcsc="C2480", digikey="",
                  note="Stops the USB-C port back-feeding the Pico micro-USB")),

    # ------------------------------------------------------------------ Li-Po charger
    dict(ref="U2", lib="Battery_Management:MCP73831-2-OT", value="MCP73831-2-OT",
         fp="Package_TO_SOT_SMD:SOT-23-5",
         pins={"1": "CHG_STAT", "2": "GND", "3": "+BATT", "4": "VBUS", "5": "CHG_PROG"},
         sch=(114.3, 63.5, 0), pcb=(64.5, 25.5, 0, "F"),
         bom=dict(desc="Li-ion/Li-Po linear charger 4.20 V, SOT-23-5", mfr="Microchip", mpn="MCP73831T-2ACI/OT",
                  lcsc="C424093", digikey="MCP73831T-2ACI/OTCT-ND", note="")),
    R("R3", "4.7k", "CHG_PROG", "GND", (96.52, 78.74, 0), (60.4, 27.2, 90, "F"), "C17673",
      "I_charge = 1000 V / R_PROG = 213 mA"),
    C("C1", "4.7uF", "VBUS", "GND", (101.6, 45.72, 0), (68.3, 25.5, 90, "F"), "C1779",
      "MLCC 4.7 uF 25 V X5R 0805", "CL21A475KAQNNNE"),
    C("C2", "4.7uF", "+BATT", "GND", (137.16, 76.2, 0), (60.5, 23.3, 0, "F"), "C1779",
      "MLCC 4.7 uF 25 V X5R 0805", "CL21A475KAQNNNE"),
    R("R4", "1k", "VBUS", "CHG_LED_A", (152.4, 45.72, 0), (70.6, 25.5, 90, "F"), "C17513", "Charge LED current ~2 mA"),
    dict(ref="D5", lib="Device:LED", value="RED", fp=LED0805, pins={"1": "CHG_STAT", "2": "CHG_LED_A"},
         sch=(152.4, 60.96, 90), pcb=(72.9, 25.5, 90, "F"),
         bom=dict(desc="LED red 0805 (charging)", mfr="Hubei KENTO", mpn="KT-0805R", lcsc="C84256", digikey="",
                  note="On while charging, off when full")),

    # ------------------------------------------------------------------ battery, switch, OR-ing
    dict(ref="J2", lib="Connector_Generic:Conn_01x02", value="LiPo 1S",
         fp="Connector_JST:JST_PH_B2B-PH-K_1x02_P2.00mm_Vertical",
         pins={"1": "+BATT", "2": "GND"}, sch=(40.64, 106.68, 0), pcb=(56.0, 25.8, 0, "B"),
         bom=dict(desc="JST PH 2-pin vertical header (battery)", mfr="JST", mpn="B2B-PH-K-S(LF)(SN)",
                  lcsc="", digikey="455-1704-ND", note="CHECK battery lead polarity: + on pin 1")),
    dict(ref="J3", lib="Connector_Generic:Conn_01x02", value="PWR SW",
         fp="Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical_SMD_Pin1Left",
         pins={"1": "+BATT", "2": "VBAT_SW"}, sch=(40.64, 124.46, 0), pcb=(48.5, 5.77, 0, "B"),
         bom=dict(desc="2-pin 2.54 mm SMD header: external arming/screw switch", mfr="generic",
                  mpn="2.54 mm 1x02 SMD header", lcsc="", digikey="", note="Jumper for bench use")),
    dict(ref="D2", lib="Diode:SS14", value="SS14", fp="Diode_SMD:D_SMA",
         pins={"1": "VSYS", "2": "VBAT_SW"}, sch=(76.2, 119.38, 0), pcb=(57.5, 4.2, 0, "F"),
         bom=dict(desc="Schottky diode 40 V 1 A, SMA", mfr="MDD", mpn="SS14", lcsc="C2480", digikey="",
                  note="Battery -> VSYS OR-ing, as in Pico datasheet section 4.5")),

    # ------------------------------------------------------------------ 3.3 V sensor rail
    dict(ref="U5", lib="Regulator_Linear:AP2112K-3.3", value="AP2112K-3.3",
         fp="Package_TO_SOT_SMD:SOT-23-5",
         pins={"1": "VSYS", "2": "GND", "3": "LDO_EN", "4": "NC", "5": "+3V3"},
         sch=(88.9, 160.02, 0), pcb=(59.0, 19.5, 0, "F"),
         bom=dict(desc="600 mA LDO 3.3 V, SOT-23-5", mfr="Diodes Inc", mpn="AP2112K-3.3TRG1", lcsc="C51118",
                  digikey="AP2112K-3.3TRG1DICT-ND", note="Firmware can power-cycle sensors + SD via EN")),
    C("C3", "1uF", "VSYS", "GND", (63.5, 172.72, 0), (54.6, 19.5, 90, "F"), "C28323",
      "MLCC 1 uF 25 V X5R 0805", "CL21B105KAFNNNE"),
    C("C4", "10uF", "+3V3", "GND", (111.76, 172.72, 0), (63.3, 19.5, 90, "F"), "C15850",
      "MLCC 10 uF 25 V X5R 0805", "CL21A106KAYNNNE"),
    R("R10", "100k", "LDO_EN", "GND", (50.8, 172.72, 0), (54.6, 13.5, 90, "F"), "C17407", "Keeps sensors off until firmware starts"),
    R("R11", "100k", "VBAT_SW", "VBAT_SENSE", (160.02, 152.4, 0), (32.5, 24.8, 0, "B"), "C17407", "Divider top"),
    R("R12", "100k", "VBAT_SENSE", "GND", (160.02, 195.58, 0), (32.5, 27.3, 0, "B"), "C17407", "Divider bottom"),
    C("C11", "100nF", "VBAT_SENSE", "GND", (149.86, 195.58, 0), (28.0, 27.3, 0, "B"), "C49678",
      "MLCC 100 nF 50 V X7R 0805", "CL21B104KBCNNNC"),

    # ------------------------------------------------------------------ IMU
    dict(ref="U3", lib="cosmic_codex:LSM6DSO32", value="LSM6DSO32",
         fp="Package_LGA:LGA-14_3x2.5mm_P0.5mm_LayoutBorder3x4y",
         pins={"1": "GND", "2": "GND", "3": "GND", "4": "IMU_INT1", "5": "+3V3", "6": "GND", "7": "GND",
               "8": "+3V3", "9": "NC", "10": "NC", "11": "NC", "12": "+3V3", "13": "I2C_SCL", "14": "I2C_SDA"},
         sch=(322.58, 76.2, 0), pcb=(62.0, 12.0, 0, "F"),
         bom=dict(desc="6-axis IMU, +/-32 g accel, +/-2000 dps gyro, LGA-14L", mfr="STMicroelectronics",
                  mpn="LSM6DSO32TR", lcsc="", digikey="",
                  note="Fine pitch: reflow (hot plate/hot air) or order assembled. SA0=GND -> I2C 0x6A")),
    C("C5", "100nF", "+3V3", "GND", (292.1, 50.8, 0), (65.6, 12.0, 90, "F"), "C49678",
      "MLCC 100 nF 50 V X7R 0805", "CL21B104KBCNNNC"),
    C("C6", "100nF", "+3V3", "GND", (302.26, 50.8, 0), (58.6, 12.0, 90, "F"), "C49678",
      "MLCC 100 nF 50 V X7R 0805", "CL21B104KBCNNNC"),

    # ------------------------------------------------------------------ barometer
    dict(ref="U4", lib="cosmic_codex:BMP390", value="BMP390",
         fp="cosmic_codex:Bosch_LGA-10_2x2mm_P0.5mm_BMP390",
         pins={"1": "+3V3", "2": "I2C_SCL", "3": "GND", "4": "I2C_SDA", "5": "+3V3", "6": "+3V3",
               "7": "BARO_INT", "8": "GND", "9": "GND", "10": "+3V3"},
         sch=(322.58, 142.24, 0), pcb=(69.0, 7.5, 0, "F"),
         bom=dict(desc="Barometric pressure sensor, LGA-10 2x2 mm", mfr="Bosch Sensortec", mpn="BMP390",
                  lcsc="", digikey="",
                  note="Fine pitch: reflow. SDO=VDDIO -> I2C 0x77. Shield from light and airflow with open-cell foam")),
    C("C7", "100nF", "+3V3", "GND", (292.1, 119.38, 0), (72.0, 7.0, 90, "F"), "C49678",
      "MLCC 100 nF 50 V X7R 0805", "CL21B104KBCNNNC"),
    R("R8", "4.7k", "+3V3", "I2C_SDA", (363.22, 116.84, 0), (55.0, 8.0, 90, "F"), "C17673", "I2C pull-up"),
    R("R9", "4.7k", "+3V3", "I2C_SCL", (373.38, 116.84, 0), (57.2, 8.0, 90, "F"), "C17673", "I2C pull-up"),

    # ------------------------------------------------------------------ microSD (bottom side)
    dict(ref="J4", lib="Connector:Micro_SD_Card_Det_Hirose_DM3AT", value="microSD",
         fp="Connector_Card:microSD_HC_Hirose_DM3AT-SF-PEJM5",
         pins={"1": "SD_DAT2", "2": "SD_CS", "3": "SD_MOSI", "4": "+3V3", "5": "SD_SCK", "6": "GND",
               "7": "SD_MISO", "8": "SD_DAT1", "9": "SD_DET", "10": "GND", "11": "GND"},
         sch=(340.36, 220.98, 0), pcb=(10.1, 15.0, 90, "B"),
         bom=dict(desc="microSD push-push socket with card detect", mfr="Hirose", mpn="DM3AT-SF-PEJM5",
                  lcsc="", digikey="HR1941CT-ND", note="Bottom side, card slot at the board end")),
    R("R13", "10k", "+3V3", "SD_CS", (284.48, 190.5, 0), (21.5, 4.0, 90, "B"), "C17414", "Keeps card deselected at boot"),
    R("R14", "10k", "+3V3", "SD_MISO", (292.1, 190.5, 0), (24.0, 4.0, 90, "B"), "C17414", "SD DAT0 pull-up"),
    R("R15", "10k", "+3V3", "SD_DAT1", (299.72, 190.5, 0), (26.5, 4.0, 90, "B"), "C17414", "Unused DAT1 pull-up"),
    R("R16", "10k", "+3V3", "SD_DAT2", (307.34, 190.5, 0), (29.0, 4.0, 90, "B"), "C17414", "Unused DAT2 pull-up"),
    C("C9", "10uF", "+3V3", "GND", (284.48, 243.84, 0), (21.5, 26.0, 90, "B"), "C15850",
      "MLCC 10 uF 25 V X5R 0805", "CL21A106KAYNNNE", note="SD write bursts draw ~100 mA"),
    C("C10", "100nF", "+3V3", "GND", (294.64, 243.84, 0), (24.0, 26.0, 90, "B"), "C49678",
      "MLCC 100 nF 50 V X7R 0805", "CL21B104KBCNNNC"),

    # ------------------------------------------------------------------ status LED + buzzer
    R("R5", "1k", "LED_STATUS", "LED_STAT_A", (45.72, 218.44, 0), (63.2, 24.0, 0, "B"), "C17513", "Status LED ~1.5 mA"),
    dict(ref="D3", lib="Device:LED", value="GREEN", fp=LED0805, pins={"1": "GND", "2": "LED_STAT_A"},
         sch=(45.72, 236.22, 90), pcb=(67.3, 24.0, 0, "B"),
         bom=dict(desc="LED green 0805 (status)", mfr="Hubei KENTO", mpn="KT-0805G", lcsc="C2297", digikey="",
                  note="")),
    R("R6", "1k", "BUZZ_GPIO", "Q1_BASE", (68.58, 223.52, 90), (63.2, 27.5, 0, "B"), "C17513", "Base resistor"),
    dict(ref="Q1", lib="Transistor_BJT:MMBT3904", value="MMBT3904", fp="Package_TO_SOT_SMD:SOT-23",
         pins={"1": "Q1_BASE", "2": "GND", "3": "BUZZ_DRV"}, sch=(86.36, 223.52, 0), pcb=(67.3, 27.0, 0, "B"),
         bom=dict(desc="NPN transistor 40 V 200 mA, SOT-23", mfr="Changjiang", mpn="MMBT3904", lcsc="C20526",
                  digikey="", note="Low-side buzzer switch")),
    R("R7", "1k", "VSYS", "BUZZ_DRV", (106.68, 205.74, 0), (71.2, 27.5, 0, "B"), "C17513", "Pull-up: piezo swings ~VSYS peak-to-peak"),
    dict(ref="BZ1", lib="Device:Buzzer", value="PKLCS1212E4001", fp="Buzzer_Beeper:Buzzer_Murata_PKLCS1212E",
         pins={"1": "BUZZ_DRV", "2": "GND"}, sch=(124.46, 223.52, 0), pcb=(31.5, 15.0, 90, "B"),
         bom=dict(desc="Piezo sounder 4 kHz, 12x12 mm SMD", mfr="Murata", mpn="PKLCS1212E4001-R1",
                  lcsc="", digikey="", note="Drive at 4 kHz; J7 accepts a louder external beeper")),
    dict(ref="J7", lib="Connector_Generic:Conn_01x02", value="EXT BEEPER",
         fp="Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical_SMD_Pin1Left",
         pins={"1": "VSYS", "2": "BUZZ_DRV"}, sch=(142.24, 205.74, 0), pcb=(48.5, 23.77, 0, "B"),
         bom=dict(desc="2-pin 2.54 mm SMD header: optional external magnetic beeper", mfr="generic",
                  mpn="2.54 mm 1x02 SMD header", lcsc="", digikey="", note="")),
    dict(ref="D4", lib="Diode:1N4148W", value="1N4148W", fp="Diode_SMD:D_SOD-123",
         pins={"1": "VSYS", "2": "BUZZ_DRV"}, sch=(124.46, 200.66, 90), pcb=(54.5, 21.0, 0, "B"),
         bom=dict(desc="Switching diode SOD-123 (flyback for external magnetic beeper)", mfr="Changjiang",
                  mpn="1N4148W", lcsc="C81598", digikey="", note="")),

    # ------------------------------------------------------------------ expansion headers (bottom side)
    dict(ref="J5", lib="Connector_Generic:Conn_01x08", value="RADIO (RFM95W)",
         fp="Connector_PinHeader_2.54mm:PinHeader_1x08_P2.54mm_Vertical_SMD_Pin1Left",
         pins={"1": "+3V3", "2": "GND", "3": "RADIO_SCK", "4": "RADIO_MOSI", "5": "RADIO_MISO",
               "6": "RADIO_CS", "7": "RADIO_DIO0", "8": "RADIO_RST"},
         sch=(215.9, 213.36, 0), pcb=(41.5, 15.0, 0, "B"),
         bom=dict(desc="8-pin 2.54 mm SMD header: LoRa radio (experiment 31)", mfr="generic",
                  mpn="2.54 mm 1x08 SMD header", lcsc="", digikey="", note="")),
    dict(ref="J6", lib="Connector_Generic:Conn_01x04", value="GPS UART",
         fp="Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical_SMD_Pin1Left",
         pins={"1": "+3V3", "2": "GND", "3": "GPS_TX", "4": "GPS_RX"},
         sch=(215.9, 246.38, 0), pcb=(48.5, 15.0, 0, "B"),
         bom=dict(desc="4-pin 2.54 mm SMD header: GPS module (3.3 V UART)", mfr="generic",
                  mpn="2.54 mm 1x04 SMD header", lcsc="", digikey="", note="GPS TX -> Pico GP1 (RX)")),

    # ------------------------------------------------------------------ power flags + mounting
    dict(ref="#FLG01", lib="power:PWR_FLAG", value="PWR_FLAG", fp="", pins={"1": "GND"},
         sch=(55.88, 99.06, 0), pcb=None, bom=None),
    dict(ref="#FLG02", lib="power:PWR_FLAG", value="PWR_FLAG", fp="", pins={"1": "VBUS"},
         sch=(88.9, 35.56, 0), pcb=None, bom=None),
    dict(ref="#FLG03", lib="power:PWR_FLAG", value="PWR_FLAG", fp="", pins={"1": "VSYS"},
         sch=(96.52, 111.76, 0), pcb=None, bom=None),
    dict(ref="H1", lib="Mechanical:MountingHole_Pad", value="M2", fp="MountingHole:MountingHole_2.2mm_M2_Pad",
         pins={"1": "GND"}, sch=(175.26, 264.16, 0), pcb=(77.0, 3.0, 0, "F"), bom=None),
    dict(ref="H2", lib="Mechanical:MountingHole_Pad", value="M2", fp="MountingHole:MountingHole_2.2mm_M2_Pad",
         pins={"1": "GND"}, sch=(185.42, 264.16, 0), pcb=(77.0, 27.0, 0, "F"), bom=None),
]

# Nets drawn with KiCad power symbols (global) instead of labels
POWER_NETS = {"GND": "power:GND", "+3V3": "power:+3V3", "VBUS": "power:VBUS", "+BATT": "power:+BATT"}

# Block titles/notes printed on the schematic: (x, y, size, text)
NOTES = [
    (20.32, 25.4, 2.5, "1. USB-C charge input + Li-Po charger (MCP73831, 213 mA)"),
    (20.32, 93.98, 2.5, "2. Battery, arming switch, OR-ing diode"),
    (20.32, 144.78, 2.5, "3. 3.3 V sensor rail (AP2112K, firmware-switchable) + battery sense"),
    (20.32, 190.5, 2.5, "4. Status LED and beeper"),
    (170.18, 25.4, 2.5, "5. Raspberry Pi Pico (RP2040)"),
    (170.18, 190.5, 2.5, "7. Expansion: LoRa radio (exp. 31) + GPS"),
    (269.24, 25.4, 2.5, "6. Sensors on I2C0 (400 kHz): LSM6DSO32 @0x6A, BMP390 @0x77"),
    (269.24, 175.26, 2.5, "8. microSD in SPI mode (SPI0)"),
    (20.32, 279.4, 1.8, "Data logger only: this board has NO pyrotechnic/deployment outputs. "
                        "Use a certified commercial altimeter for recovery events (see experiment 40)."),
]

BOARD_W, BOARD_H = 80.0, 30.0
