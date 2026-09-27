#!/usr/bin/env bash
# Capture one ON / OFF pair with an RTL-SDR (RTL-SDR Blog V3/V4 drivers: rtl_sdr, rtl_biast).
#   ./capture.sh 30          # label = galactic longitude you are pointing at
# ON  = horn pointed at the Galactic plane at longitude l
# OFF = horn pointed at a cold reference: high galactic latitude (|b| > 40 deg), same elevation if possible
# 1420.305751768 MHz centre (100 kHz below the line), 2.4 MS/s, 60 s per capture = 288 MB per file.
set -euo pipefail
L=${1:?give the galactic longitude label, e.g. 30}
FC=1420305752
FS=2400000
SECONDS_PER=60
N=$((FS * SECONDS_PER))
GAIN=40                 # dB; lower it if the spectrum shows spurs or the ADC clips
rtl_biast -b 1          # power the LNA through the coax (skip if your LNA has its own supply)
sleep 2
read -p "Point the horn at l = ${L} deg (b = 0) and press Enter..."
rtl_sdr -f $FC -s $FS -g $GAIN -n $N "on_l$(printf %03d $L).cu8"
read -p "Point the horn at the OFF (cold sky) position and press Enter..."
rtl_sdr -f $FC -s $FS -g $GAIN -n $N "off_l$(printf %03d $L).cu8"
rtl_biast -b 0
echo "add this to obs.json:"
echo "  {\"l_deg\": $L, \"b_deg\": 0, \"on\": \"on_l$(printf %03d $L).cu8\", \"off\": \"off_l$(printf %03d $L).cu8\","
echo "   \"time\": \"$(date -u +%Y-%m-%dT%H:%M:%S)\", \"lat\": YOUR_LAT, \"lon\": YOUR_LON}"
