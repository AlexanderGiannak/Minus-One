"""Write FAKE fixture files matching the data contract into web/public/data/.

Every number here is made up so the frontend can be built before the pipeline
runs. Files carry meta.fake = true and road names start with "FAKE". Replace
them by running the real pipeline (08_export.py).
"""

import json
import math
import random
import shutil
from datetime import datetime, timezone
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "public" / "data"
CONFIG = ROOT / "pipeline" / "config.yaml"

META = {
    "fake": True,
    "generated_by": "pipeline/make_fixtures.py (FAKE toy data, not results)",
    "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
}

# Toy 8-node grid near downtown Miami; positions are arbitrary.
NODES = {
    "n1": (-80.200, 25.790), "n2": (-80.190, 25.790), "n3": (-80.180, 25.790),
    "n4": (-80.200, 25.775), "n5": (-80.190, 25.775), "n6": (-80.180, 25.775),
    "n7": (-80.195, 25.760), "n8": (-80.185, 25.760),
}
# 10 two-way streets -> 20 directed links.
EDGES = [
    ("n1", "n2", "primary"), ("n2", "n3", "primary"), ("n4", "n5", "secondary"),
    ("n5", "n6", "secondary"), ("n1", "n4", "tertiary"), ("n2", "n5", "trunk"),
    ("n3", "n6", "tertiary"), ("n4", "n7", "secondary"), ("n6", "n8", "secondary"),
    ("n7", "n8", "primary"),
]


def haversine_m(p, q):
    lon1, lat1, lon2, lat2 = map(math.radians, (*p, *q))
    a = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * 6371000 * math.asin(math.sqrt(a))


def bpr(fftt, flow, cap, alpha, beta):
    return fftt * (1 + alpha * (flow / cap) ** beta)


def main():
    config = yaml.safe_load(CONFIG.read_text())
    net = config["network"]
    alpha, beta = config["cost"]["alpha"], config["cost"]["beta"]
    rng = random.Random(42)

    features, links = [], []
    for k, (a, b, cls) in enumerate(EDGES):
        for u, v in ((a, b), (b, a)):
            lid = f"L{len(features) + 1:02d}"
            length = haversine_m(NODES[u], NODES[v])
            lanes = net["default_lanes_per_direction"][cls]
            cap = lanes * net["capacity_vph_per_lane"][cls]
            fftt = length / (net["default_speed_mph"][cls] * 1609.344 / 60)
            features.append({
                "type": "Feature",
                "geometry": {"type": "LineString",
                             "coordinates": [list(NODES[u]), list(NODES[v])]},
                "properties": {
                    "id": lid, "a_node": u, "b_node": v,
                    "name": f"FAKE {cls.title()} St {k + 1}", "road_class": cls,
                    "lanes": lanes, "capacity_vph": cap, "fftt_min": round(fftt, 3),
                    "length_m": round(length, 1), "in_focus": True,
                },
            })
            ue = round(cap * rng.uniform(0.4, 1.15))
            so = round(ue * rng.uniform(0.8, 1.05))
            links.append({"id": lid, "ue_flow": ue, "ue_vc": round(ue / cap, 3),
                          "so_flow": so, "so_vc": round(so / cap, 3),
                          "_t": (fftt, cap)})

    def tstt(key):
        return sum(l[key] * bpr(l["_t"][0], l[key], l["_t"][1], alpha, beta) for l in links)

    tstt_ue, tstt_so = tstt("ue_flow"), tstt("so_flow")
    if tstt_so > tstt_ue:  # keep the fake data physically sensible
        tstt_so = tstt_ue * 0.97
    for l in links:
        del l["_t"]
    total_trips = 5000
    noise = round(tstt_ue * 1e-4, 3)
    base = {"meta": META, "tstt_ue": round(tstt_ue, 1), "tstt_so": round(tstt_so, 1),
            "price_of_anarchy": round(tstt_ue / tstt_so, 4), "relative_gap": 1e-5,
            "noise_floor_min": noise, "total_trips": total_trips, "links": links}

    # Five fake candidates covering each UI state: flagged, below threshold, worse.
    threshold = config["flagging"]["snr_threshold"]
    specs = [(18.0, True), (7.5, True), (2.0, True), (6.0, False), (25.0, False)]  # (snr, improves)
    ranked = sorted(links, key=lambda l: l["ue_flow"] - l["so_flow"], reverse=True)[:5]
    candidates = []
    shutil.rmtree(OUT / "closures", ignore_errors=True)
    (OUT / "closures").mkdir(parents=True)
    for link, (s, improves) in zip(ranked, specs):
        delta = round((-s if improves else s) * noise, 1)
        snr = round(abs(delta) / noise, 2)
        candidates.append({
            "link_id": link["id"], "delta_tstt": delta,
            "delta_pct": round(100 * delta / tstt_ue, 3),
            "min_saved_per_trip": round(-delta / total_trips, 4),
            "snr": snr, "flagged": delta < 0 and snr >= threshold, "evac_route": False,
        })
        others = rng.sample([l for l in links if l["id"] != link["id"]], 4)
        rows = [[link["id"], -link["ue_flow"]]]
        rows += [[o["id"], round(link["ue_flow"] * rng.uniform(-0.3, 0.6))] for o in others]
        (OUT / "closures" / f"{link['id']}.json").write_text(json.dumps(rows))

    (OUT / "network.geojson").write_text(json.dumps(
        {"type": "FeatureCollection", "meta": META, "features": features}))
    (OUT / "base.json").write_text(json.dumps(base, indent=1))
    (OUT / "candidates.json").write_text(json.dumps(
        {"meta": META, "candidates": candidates}, indent=1))
    (OUT / "assumptions.json").write_text(json.dumps(
        {"meta": META, "config": config}, indent=1))
    print(f"wrote FAKE fixtures to {OUT} ({len(features)} links, {len(candidates)} candidates)")


if __name__ == "__main__":
    main()
