# make check   - verify the header copies match firmware/common (and experiment 30) and
#                syntax-check both sketches against the mock Arduino headers of experiment 30
# make sync    - copy firmware/common/*.h into the sketch folders and experiment 30
MOCK = ../../30-flight-computer-pcb/firmware/test/mock
EXP30 = ../../30-flight-computer-pcb/firmware/flight_logger
CXXFLAGS = -std=c++17 -Wall -Wextra -Werror -Wno-unused-parameter -fsyntax-only -I$(MOCK) -include Arduino.h

check:
	cmp common/telemetry_packet.h ground_receiver/telemetry_packet.h
	cmp common/telemetry_packet.h range_test_tx/telemetry_packet.h
	cmp common/telemetry_packet.h $(EXP30)/telemetry_packet.h
	cmp common/radio_config.h ground_receiver/radio_config.h
	cmp common/radio_config.h range_test_tx/radio_config.h
	mkdir -p build
	cp ground_receiver/ground_receiver.ino build/ground_receiver.cpp
	cp range_test_tx/range_test_tx.ino build/range_test_tx.cpp
	g++ $(CXXFLAGS) -Iground_receiver build/ground_receiver.cpp
	g++ $(CXXFLAGS) -Irange_test_tx build/range_test_tx.cpp
	@echo "headers in sync, sketches compile against the mock API"

sync:
	cp common/telemetry_packet.h common/radio_config.h ground_receiver/
	cp common/telemetry_packet.h common/radio_config.h range_test_tx/
	cp common/telemetry_packet.h $(EXP30)/

.PHONY: check sync
