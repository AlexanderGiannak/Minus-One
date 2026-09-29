"""OSM tag parsing in 01_network.py (no network access needed)."""

import importlib.util
from pathlib import Path

import pytest

_spec = importlib.util.spec_from_file_location("network01", Path(__file__).parents[1] / "01_network.py")
net = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(net)


@pytest.mark.parametrize("value, expected", [
    ("45 mph", 45), (["35 mph", "40 mph"], 35), ("50", 50 / 1.609344), (None, None), ("signals", None),
])
def test_parse_speed_mph(value, expected):
    assert net.parse_speed_mph(value) == (pytest.approx(expected) if expected else None)


@pytest.mark.parametrize("value, expected", [("2", 2), ("2;3", 2), (["3", "2"], 3), (None, None), (float("nan"), None)])
def test_parse_first_number(value, expected):
    assert net.parse_first_number(value) == expected


def test_pick_class_prefers_highest():
    assert net.pick_class(["primary_link", "trunk"]) == "trunk"
    assert net.pick_class("tertiary") == "tertiary"
    assert net.pick_class(["service"]) is None


def test_default_key_maps_links():
    assert net.default_key("motorway_link") == "link"
    assert net.default_key("primary") == "primary"
