"""4-node Braess network. Expected to FAIL until pipeline/lib/assign.py exists.

4000 vehicles S -> E. Costs in minutes, x = link flow:
  S-A: x/100   A-E: 45   S-B: 45   B-E: x/100   A-B (shortcut): 0

Without the shortcut, UE = SO: 2000 per route, 65 min each, TSTT 260,000.
With the shortcut, UE: everyone takes S-A-B-E at 80 min, TSTT 320,000.
With the shortcut, SO (derived here, not in the brief): by symmetry p on each
outer route and 4000 - 2p on S-A-B-E, so TSTT = 2(4000 - p)^2/100 + 90p,
minimized at p = 1750: flows 1750 / 1750 / 500, TSTT 258,750, and the
price of anarchy is 320,000 / 258,750.
"""

import pytest

DEMAND = [("S", "E", 4000.0)]
LINKS = [
    {"id": "SA", "a_node": "S", "b_node": "A", "free_time": 0.0, "coef": 0.01, "power": 1.0},
    {"id": "AE", "a_node": "A", "b_node": "E", "free_time": 45.0, "coef": 0.0, "power": 1.0},
    {"id": "SB", "a_node": "S", "b_node": "B", "free_time": 45.0, "coef": 0.0, "power": 1.0},
    {"id": "BE", "a_node": "B", "b_node": "E", "free_time": 0.0, "coef": 0.01, "power": 1.0},
]
SHORTCUT = {"id": "AB", "a_node": "A", "b_node": "B", "free_time": 0.0, "coef": 0.0, "power": 1.0}
SETTINGS = {"max_iter": 5000, "rel_gap": 1e-6}
FLOW_TOL = 5.0  # vehicles


def _solve(links, mode):
    from pipeline.lib.assign import solve  # imported here so a missing solver fails, not errors
    return solve(links, DEMAND, mode=mode, **SETTINGS)


def test_ue_without_shortcut():
    res = _solve(LINKS, "UE")
    for lid in ("SA", "AE", "SB", "BE"):
        assert res["flow"][lid] == pytest.approx(2000, abs=FLOW_TOL)
    assert res["time"]["SA"] + res["time"]["AE"] == pytest.approx(65, abs=0.01)
    assert res["tstt"] == pytest.approx(260_000, rel=1e-4)


def test_ue_with_shortcut_is_worse():
    res = _solve(LINKS + [SHORTCUT], "UE")
    assert res["flow"]["AB"] == pytest.approx(4000, abs=FLOW_TOL)
    assert res["time"]["SA"] + res["time"]["AB"] + res["time"]["BE"] == pytest.approx(80, abs=0.01)
    assert res["tstt"] == pytest.approx(320_000, rel=1e-4)


def test_so_with_shortcut():
    res = _solve(LINKS + [SHORTCUT], "SO")
    assert res["flow"]["AE"] == pytest.approx(1750, abs=FLOW_TOL)
    assert res["flow"]["SB"] == pytest.approx(1750, abs=FLOW_TOL)
    assert res["flow"]["AB"] == pytest.approx(500, abs=FLOW_TOL)
    assert res["tstt"] == pytest.approx(258_750, rel=1e-4)


def test_so_without_shortcut_equals_ue():
    assert _solve(LINKS, "SO")["tstt"] == pytest.approx(260_000, rel=1e-4)
