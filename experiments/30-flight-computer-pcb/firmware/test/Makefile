# Host-side tests for the CC-FL1 flight logic.  Needs g++ (C++17) and python3 + numpy.
#   make            build + generate 4 synthetic flights + replay them
#   make sketch     syntax-check the Arduino sketch against mock headers (no hardware libs needed)
#   make clean
CXX      ?= g++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra -Wpedantic -Werror
CORE      = ../flight_logger/flight_core.cpp
SYNTH     = python3 ../../tools/synth_flight.py
B         = build

all: test sketch

$(B):
	mkdir -p $(B)

$(B)/test_flight_core: test_flight_core.cpp $(CORE) ../flight_logger/flight_core.h | $(B)
	$(CXX) $(CXXFLAGS) -o $@ test_flight_core.cpp $(CORE)

$(B)/nominal.csv: | $(B)
	$(SYNTH) -o $@ --seed 1
$(B)/bump_spike.csv: | $(B)
	$(SYNTH) -o $@ --seed 2 --pad-bump --ejection-spike
$(B)/noisy.csv: | $(B)
	$(SYNTH) -o $@ --seed 3 --baro-noise 8 --acc-noise 0.08 --ejection-spike
$(B)/high_site.csv: | $(B)
	$(SYNTH) -o $@ --seed 4 --elevation 1500

test: $(B)/test_flight_core $(B)/nominal.csv $(B)/bump_spike.csv $(B)/noisy.csv $(B)/high_site.csv
	./$(B)/test_flight_core \
	  $(B)/nominal.csv $(B)/nominal_log.csv \
	  $(B)/bump_spike.csv $(B)/bump_spike_log.csv \
	  $(B)/noisy.csv $(B)/noisy_log.csv \
	  $(B)/high_site.csv $(B)/high_site_log.csv

# Compile the whole sketch for the host against tiny mock versions of the Arduino APIs it uses.
# This catches typos and type errors; it does not prove the real libraries behave the same.
sketch: | $(B)
	cp ../flight_logger/flight_logger.ino $(B)/flight_logger_sketch.cpp
	$(CXX) -std=c++17 -Wall -Wextra -Werror -Wno-unused-parameter -fsyntax-only \
	  -Imock -I../flight_logger -include Arduino.h $(B)/flight_logger_sketch.cpp
	$(CXX) -std=c++17 -Wall -Wextra -Werror -Wno-unused-parameter -fsyntax-only -DTELEMETRY_ENABLED=1 \
	  -Imock -I../flight_logger -include Arduino.h $(B)/flight_logger_sketch.cpp
	@echo "sketch compiles against the mock Arduino API (with and without telemetry)"

clean:
	rm -rf $(B)

.PHONY: all test sketch clean
