"""Validate web/public/data/ against the data contract in CLAUDE.md.

Usage: python -m pipeline.contract [data_dir]
Keep in sync with web/src/types/contract.ts.
"""

import json
import sys
from pathlib import Path

DEFAULT_DIR = Path(__file__).resolve().parent.parent / "web" / "public" / "data"

NETWORK_PROPS = {
    "id": str, "a_node": str, "b_node": str, "name": str, "road_class": str,
    "lanes": (int, float), "capacity_vph": (int, float), "fftt_min": (int, float),
    "length_m": (int, float), "in_focus": bool,
}
BASE_KEYS = {
    "tstt_ue": (int, float), "tstt_so": (int, float), "price_of_anarchy": (int, float),
    "relative_gap": (int, float), "noise_floor_min": (int, float), "total_trips": (int, float),
    "links": list,
}
BASE_LINK_KEYS = {"id": str, "ue_flow": (int, float), "ue_vc": (int, float),
                  "so_flow": (int, float), "so_vc": (int, float)}
CANDIDATE_KEYS = {
    "link_id": str, "delta_tstt": (int, float), "delta_pct": (int, float),
    "min_saved_per_trip": (int, float), "snr": (int, float), "flagged": bool,
    "evac_route": bool,
}
META_KEYS = {"fake": bool, "generated_by": str, "generated_at": str}


def _check_keys(obj, spec, where, errors):
    if not isinstance(obj, dict):
        errors.append(f"{where}: expected object")
        return
    for key, typ in spec.items():
        if key not in obj:
            errors.append(f"{where}: missing '{key}'")
        elif isinstance(obj[key], bool) and typ is not bool:
            # bool is a subclass of int in Python; don't let True pass as a number
            errors.append(f"{where}.{key}: bool where {typ} expected")
        elif not isinstance(obj[key], typ):
            errors.append(f"{where}.{key}: expected {typ}, got {type(obj[key]).__name__}")


def _decimals(x):
    s = repr(float(x))
    return len(s.split(".")[1]) if "." in s and "e" not in s else 0


def validate(data_dir=DEFAULT_DIR):
    """Return a list of human-readable errors; empty means valid."""
    data_dir = Path(data_dir)
    errors = []

    def load(name):
        path = data_dir / name
        if not path.exists():
            errors.append(f"missing file {name}")
            return None
        return json.loads(path.read_text())

    network, base = load("network.geojson"), load("base.json")
    candidates, assumptions = load("candidates.json"), load("assumptions.json")
    for name, doc in [("network.geojson", network), ("base.json", base),
                      ("candidates.json", candidates), ("assumptions.json", assumptions)]:
        if isinstance(doc, dict):
            _check_keys(doc.get("meta"), META_KEYS, f"{name}.meta", errors)

    link_ids = set()
    if network is not None:
        if network.get("type") != "FeatureCollection":
            errors.append("network.geojson: not a FeatureCollection")
        for i, feat in enumerate(network.get("features", [])):
            where = f"network.geojson feature {i}"
            props = feat.get("properties", {})
            _check_keys(props, NETWORK_PROPS, where, errors)
            if props.get("id") in link_ids:
                errors.append(f"{where}: duplicate id {props.get('id')}")
            link_ids.add(props.get("id"))
            geom = feat.get("geometry") or {}
            if geom.get("type") != "LineString" or len(geom.get("coordinates", [])) < 2:
                errors.append(f"{where}: geometry must be a LineString with >= 2 points")
            elif any(_decimals(c) > 5 for pt in geom["coordinates"] for c in pt):
                errors.append(f"{where}: coordinates have more than 5 decimals")

    if base is not None:
        _check_keys(base, BASE_KEYS, "base.json", errors)
        base_ids = set()
        for i, link in enumerate(base.get("links", [])):
            _check_keys(link, BASE_LINK_KEYS, f"base.json links[{i}]", errors)
            base_ids.add(link.get("id"))
        if network is not None and base_ids != link_ids:
            errors.append(f"base.json links do not match network ids "
                          f"(missing {len(link_ids - base_ids)}, extra {len(base_ids - link_ids)})")
        if base.get("tstt_so", 0) > base.get("tstt_ue", 0) * (1 + 1e-9):
            errors.append("base.json: tstt_so > tstt_ue (SO can never be worse than UE)")

    threshold = (assumptions or {}).get("config", {}).get("flagging", {}).get("snr_threshold")
    if assumptions is not None and threshold is None:
        errors.append("assumptions.json: missing config.flagging.snr_threshold")

    if candidates is not None:
        for i, cand in enumerate(candidates.get("candidates", [])):
            where = f"candidates.json candidates[{i}]"
            _check_keys(cand, CANDIDATE_KEYS, where, errors)
            lid = cand.get("link_id")
            if network is not None and lid not in link_ids:
                errors.append(f"{where}: unknown link_id {lid}")
            if threshold is not None and "flagged" in cand:
                should = cand.get("delta_tstt", 0) < 0 and cand.get("snr", 0) >= threshold
                if cand["flagged"] != should:
                    errors.append(f"{where}: flagged={cand['flagged']} disagrees with snr_threshold rule")
            closure = data_dir / "closures" / f"{lid}.json"
            if not closure.exists():
                errors.append(f"missing closures/{lid}.json")
                continue
            for j, row in enumerate(json.loads(closure.read_text())):
                if not (isinstance(row, list) and len(row) == 2 and isinstance(row[1], (int, float))):
                    errors.append(f"closures/{lid}.json[{j}]: expected [link_id, delta_flow]")
                elif network is not None and row[0] not in link_ids:
                    errors.append(f"closures/{lid}.json[{j}]: unknown link {row[0]}")

    return errors


if __name__ == "__main__":
    errs = validate(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DIR)
    print("\n".join(errs) if errs else "contract OK")
    sys.exit(1 if errs else 0)
