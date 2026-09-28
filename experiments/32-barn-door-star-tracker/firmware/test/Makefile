# make        run the host simulation check (python) and syntax-check the sketch against mock headers
# make clean  remove build/
MOCK = ../../../30-flight-computer-pcb/firmware/test/mock
all:
	python3 ../../tools/check_tangent.py
	mkdir -p build && cp ../barn_door_tracker/barn_door_tracker.ino build/sketch.cpp
	g++ -std=c++17 -Wall -Wextra -Werror -Wno-unused-parameter -fsyntax-only -I$(MOCK) -I../barn_door_tracker \
	  -include Arduino.h build/sketch.cpp
	@echo "sketch compiles against the mock Arduino API"
clean:
	rm -rf build
.PHONY: all clean
