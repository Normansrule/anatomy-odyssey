import importlib

import pytest

MODULES = ["black_hole_raytracer", "nbody", "rocket_ascent", "transfers", "exoplanet_transit", "stellar",
           "orbital_elements"]


@pytest.mark.parametrize("name", MODULES)
def test_help(name, capsys):
    mod = importlib.import_module(f"cosmic.{name}")
    with pytest.raises(SystemExit) as exc:
        mod.main(["--help"])
    assert exc.value.code == 0
    assert "usage" in capsys.readouterr().out


@pytest.mark.parametrize("name", MODULES)
def test_module_has_physics_docstring(name):
    mod = importlib.import_module(f"cosmic.{name}")
    assert "physics" in mod.__doc__.lower() and len(mod.__doc__) > 800
