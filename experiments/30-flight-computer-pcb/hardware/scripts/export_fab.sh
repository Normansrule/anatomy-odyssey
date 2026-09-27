#!/usr/bin/env bash
# Export manufacturing files for CC-FL1 once the board is ROUTED and passes DRC.
# Needs KiCad 8+ (kicad-cli). Output: hardware/fab/  (zip the gerbers folder for the fab house)
set -euo pipefail
cd "$(dirname "$0")/../kicad"
PCB=cc-flight-logger.kicad_pcb
SCH=cc-flight-logger.kicad_sch
OUT=../fab
mkdir -p "$OUT/gerbers"

echo "== DRC (must report 0 violations and 0 unconnected items)"
kicad-cli pcb drc --severity-error --exit-code-violations -o "$OUT/drc.rpt" "$PCB"

echo "== ERC"
kicad-cli sch erc --severity-error --exit-code-violations -o "$OUT/erc.rpt" "$SCH" || \
  echo "   ERC reported errors - read $OUT/erc.rpt before ordering"

echo "== Gerbers + drill (JLCPCB / PCBWay accept these directly)"
kicad-cli pcb export gerbers --layers F.Cu,B.Cu,F.Paste,B.Paste,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts \
  --subtract-soldermask --no-x2 -o "$OUT/gerbers/" "$PCB"
kicad-cli pcb export drill --format excellon --excellon-separate-th --generate-map --map-format gerberx2 \
  -o "$OUT/gerbers/" "$PCB"
(cd "$OUT" && rm -f cc-fl1-gerbers.zip && zip -qj cc-fl1-gerbers.zip gerbers/*)

echo "== Pick-and-place (for assembly of the fine-pitch sensors)"
kicad-cli pcb export pos --format csv --units mm --side both -o "$OUT/cc-fl1-cpl.csv" "$PCB"

echo "== BOM"
kicad-cli sch export bom --fields 'Reference,Value,Footprint,${QUANTITY},MPN,LCSC' \
  --group-by Value,Footprint,MPN -o "$OUT/cc-fl1-bom.csv" "$SCH"

echo "done -> $(cd "$OUT" && pwd)"
