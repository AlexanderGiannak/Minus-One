"""Build the directed Miami road network from OpenStreetMap.

All of Miami-Dade at motorway/trunk/primary (+ links), plus secondary/tertiary
(+ links) inside the focus polygon. One-ways are kept (osmnx adds both
directions only for two-way roads), nearby intersections are consolidated, and
missing lanes/speeds are defaulted by road class from config.yaml.

Outputs (data/processed/):
  network.gpkg   layers "links" and "nodes", EPSG:4326
  network_meta.json

Usage: python pipeline/01_network.py
Needs internet (Nominatim + Overpass); responses are cached in data/raw/osmnx_cache.
"""

import math
import re
import sys
from pathlib import Path

import geopandas as gpd
import networkx as nx
import osmnx as ox
from shapely.geometry import box

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline.lib.common import METRIC_CRS, PROCESSED, RAW, load_config, write_meta  # noqa: E402

# Highest class first; used when simplification merged several OSM ways.
CLASS_RANK = ["motorway", "trunk", "primary", "secondary", "tertiary",
              "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link"]


def highway_filter(classes):
    return (f'["highway"~"^({"|".join(classes)})$"]'
            '["area"!~"yes"]["access"!~"^(private|no)$"]')


def focus_polygon(net_cfg):
    if net_cfg.get("focus_polygon_file"):
        gdf = gpd.read_file(net_cfg["focus_polygon_file"]).to_crs("EPSG:4326")
        return gdf.union_all()
    b = net_cfg["focus_bbox"]
    return box(b["west"], b["south"], b["east"], b["north"])


def as_list(value):
    if isinstance(value, list):
        return value
    return [] if value is None or (isinstance(value, float) and math.isnan(value)) else [value]


def pick_class(highway):
    classes = [h for h in as_list(highway) if h in CLASS_RANK]
    return min(classes, key=CLASS_RANK.index) if classes else None


def default_key(road_class):
    return "link" if road_class.endswith("_link") else road_class


def parse_first_number(value):
    """First number in an OSM tag value ('2', '2;3', ['3', '2'], '45 mph')."""
    for v in as_list(value):
        m = re.search(r"\d+(\.\d+)?", str(v))
        if m:
            return float(m.group())
    return None


def parse_speed_mph(value):
    for v in as_list(value):
        m = re.search(r"(\d+(\.\d+)?)\s*(mph)?", str(v))
        if m:
            speed = float(m.group(1))
            # OSM default unit is km/h; US tags normally say "mph" explicitly.
            return speed if m.group(3) else speed / 1.609344
    return None


def main():
    cfg = load_config()
    net = cfg["network"]
    ox.settings.use_cache = True
    ox.settings.cache_folder = str(RAW / "osmnx_cache")
    ox.settings.requests_timeout = 300
    if net.get("overpass_url"):
        ox.settings.overpass_url = net["overpass_url"]
        ox.settings.overpass_rate_limit = False  # mirror's /status endpoint doesn't answer

    county = ox.geocode_to_gdf(net["county_name"]).to_crs("EPSG:4326").geometry.iloc[0]
    focus = focus_polygon(net)
    print(f"county area {county.area:.3f} deg², focus bbox {focus.bounds}")

    # Download unsimplified and simplify once after merging; simplifying each
    # download separately would duplicate major roads that cross focus streets.
    g_major = ox.graph_from_polygon(county, custom_filter=highway_filter(net["county_classes"]),
                                    simplify=False, retain_all=True)
    focus_classes = net["county_classes"] + net["focus_extra_classes"]
    g_focus = ox.graph_from_polygon(focus, custom_filter=highway_filter(focus_classes),
                                    simplify=False, retain_all=True)
    print(f"downloaded: county {len(g_major.edges)} edges, focus {len(g_focus.edges)} edges")
    g = nx.compose(g_major, g_focus)
    g = ox.simplify_graph(g, edge_attrs_differ=["highway"])

    g = ox.project_graph(g, to_crs=METRIC_CRS)
    g = ox.consolidate_intersections(g, tolerance=net["consolidate_tolerance_m"],
                                     rebuild_graph=True, dead_ends=False, reconnect_edges=True)
    n_before = len(g.nodes)
    if net["largest_strong_component"]:
        g = ox.truncate.largest_component(g, strongly=True)
    print(f"consolidated: {n_before} nodes; largest strong component {len(g.nodes)} nodes, {len(g.edges)} edges")
    g = ox.project_graph(g, to_latlong=True)

    nodes, edges = ox.graph_to_gdfs(g)
    edges = edges.reset_index().sort_values(["u", "v", "key"]).reset_index(drop=True)

    rows, skipped, self_loops, lanes_defaulted, speed_defaulted = [], 0, 0, 0, 0
    for i, e in enumerate(edges.itertuples(index=False)):
        if e.u == e.v:  # loops left by intersection consolidation carry no trips
            self_loops += 1
            continue
        road_class = pick_class(getattr(e, "highway", None))
        if road_class is None:
            skipped += 1
            continue
        key = default_key(road_class)
        lanes = parse_first_number(getattr(e, "lanes", None))
        ow = as_list(getattr(e, "oneway", False))
        oneway = bool(ow) and all(bool(v) for v in ow)
        if lanes is None:
            lanes = net["default_lanes_per_direction"][key]
            lanes_defaulted += 1
        elif not oneway and net["two_way_lanes_split"]:
            lanes = max(1, math.floor(lanes / 2))
        lanes = max(1, int(lanes))
        speed = parse_speed_mph(getattr(e, "maxspeed", None))
        if not speed:
            speed = net["default_speed_mph"][key]
            speed_defaulted += 1
        length = float(e.length)
        names = [str(n) for n in as_list(getattr(e, "name", None))]
        rows.append({
            "id": f"L{i}",
            "a_node": f"n{e.u}",
            "b_node": f"n{e.v}",
            "name": names[0] if names else "",
            "road_class": road_class,
            "lanes": lanes,
            "capacity_vph": lanes * net["capacity_vph_per_lane"][key],
            "speed_mph": round(speed, 1),
            "fftt_min": length / (speed * 1609.344 / 60),
            "length_m": length,
            "oneway": oneway,
            "in_focus": bool(focus.contains(e.geometry.interpolate(0.5, normalized=True))),
            "geometry": e.geometry,
        })
    links = gpd.GeoDataFrame(rows, crs="EPSG:4326")
    node_df = gpd.GeoDataFrame(
        {"id": [f"n{n}" for n in nodes.index], "lon": nodes.geometry.x, "lat": nodes.geometry.y},
        geometry=nodes.geometry.values, crs="EPSG:4326")

    PROCESSED.mkdir(parents=True, exist_ok=True)
    out = PROCESSED / "network.gpkg"
    if out.exists():
        out.unlink()
    links.to_file(out, layer="links", driver="GPKG")
    node_df.to_file(out, layer="nodes", driver="GPKG")
    meta = write_meta(
        PROCESSED / "network_meta.json",
        osmnx_version=ox.__version__,
        links=len(links), nodes=len(node_df), links_in_focus=int(links.in_focus.sum()),
        skipped_edges_without_class=skipped, self_loops_dropped=self_loops,
        lanes_defaulted=lanes_defaulted, speed_defaulted=speed_defaulted,
        class_counts=links.road_class.value_counts().to_dict(),
        lanes_defaulted_note="lanes/speeds missing in OSM were filled from config defaults by class",
        config=net,
    )
    print(f"wrote {out}: {meta['links']} links, {meta['nodes']} nodes, {meta['links_in_focus']} in focus")


if __name__ == "__main__":
    main()
