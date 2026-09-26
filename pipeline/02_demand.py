"""Build AM-peak tract-to-tract vehicle trips and zone connectors.

Demand: LODES8 Florida OD (main file: home and work both in Florida), primary
jobs (JT01), all workers (S000). Keep workplace AND home in Miami-Dade (12086),
aggregate blocks to 2020 tracts, drop intrazonal pairs (they can't be assigned
on the network), then convert commuters to AM peak-hour vehicle trips:
    trips = jobs * commute_days_share * auto_mode_share / vehicle_occupancy
                 * am_peak_hour_share * demand_multiplier

Zones: each tract gets an origin node "o<GEOID>" (connectors out only) and a
destination node "d<GEOID>" (connectors in only), attached to the k nearest
network nodes that touch a non-motorway road. Connectors are uncongested.

Inputs:  data/processed/network.gpkg (from 01_network.py)
         data/raw/lodes/fl_od_main_JT01_<year>.csv.gz, data/raw/tiger/tl_2020_12_tract.zip
         (downloaded automatically if missing)
Outputs (data/processed/):
  zones.csv        geoid, lon, lat, origin_node, dest_node, n_connectors
  connectors.csv   id, a_node, b_node, length_m, fftt_min
  od_jobs.csv      h_tract, w_tract, origin_node, dest_node, jobs   (always)
  od_am_peak.csv   ... + trips   (only when all demand factors are set in config)
  demand_meta.json

Usage: python pipeline/02_demand.py
"""

import sys
import urllib.request
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline.lib.common import METRIC_CRS, PROCESSED, RAW, load_config, write_meta  # noqa: E402

LODES_URL = "https://lehd.ces.census.gov/data/lodes/LODES8/{state}/od/{name}"
TIGER_URL = "https://www2.census.gov/geo/tiger/TIGER2020/TRACT/tl_2020_12_tract.zip"
FACTORS = ["commute_days_share", "auto_mode_share", "vehicle_occupancy", "am_peak_hour_share"]


def fetch(url, path):
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        print(f"downloading {url}")
        urllib.request.urlretrieve(url, path)
    return path


def main():
    cfg = load_config()
    dem, con = cfg["demand"], cfg["connectors"]
    county = dem["workplace_county_fips"]
    if dem["origin_filter"] != "miami_dade_only":
        raise SystemExit(f"origin_filter {dem['origin_filter']!r} not supported (only miami_dade_only)")

    # --- LODES OD, blocks -> tracts -------------------------------------------------
    name = f"{dem['state']}_od_main_{dem['job_type']}_{dem['year']}.csv.gz"
    lodes = fetch(LODES_URL.format(state=dem["state"], name=name), RAW / "lodes" / name)
    od = pd.read_csv(lodes, usecols=["w_geocode", "h_geocode", dem["segment"]],
                     dtype={"w_geocode": str, "h_geocode": str})
    total_fl = int(od[dem["segment"]].sum())
    od = od[od.w_geocode.str[:5].eq(county)]
    jobs_in_county = int(od[dem["segment"]].sum())
    od = od[od.h_geocode.str[:5].eq(county)]
    jobs_both_in_county = int(od[dem["segment"]].sum())
    od = (od.assign(h_tract=od.h_geocode.str[:11], w_tract=od.w_geocode.str[:11])
            .groupby(["h_tract", "w_tract"], as_index=False)[dem["segment"]].sum()
            .rename(columns={dem["segment"]: "jobs"}))
    intrazonal = int(od.loc[od.h_tract == od.w_tract, "jobs"].sum())
    od = od[od.h_tract != od.w_tract]

    # --- Zones and connectors ------------------------------------------------------
    tiger = fetch(TIGER_URL, RAW / "tiger" / "tl_2020_12_tract.zip")
    tracts = gpd.read_file(tiger)
    tracts = tracts[tracts.COUNTYFP.eq(county[2:])]
    zones = pd.DataFrame({"geoid": tracts.GEOID.values,
                          "lon": tracts.INTPTLON.astype(float).values,
                          "lat": tracts.INTPTLAT.astype(float).values})

    links = gpd.read_file(PROCESSED / "network.gpkg", layer="links")
    nodes = gpd.read_file(PROCESSED / "network.gpkg", layer="nodes")
    excluded = set(con["exclude_classes"])
    eligible_ids = set(links.loc[~links.road_class.isin(excluded), "a_node"]) | \
        set(links.loc[~links.road_class.isin(excluded), "b_node"])
    eligible = nodes[nodes.id.isin(eligible_ids)].to_crs(METRIC_CRS)
    tree = cKDTree(np.column_stack([eligible.geometry.x, eligible.geometry.y]))
    zone_pts = gpd.GeoSeries(gpd.points_from_xy(zones.lon, zones.lat), crs="EPSG:4326").to_crs(METRIC_CRS)
    dist, idx = tree.query(np.column_stack([zone_pts.x, zone_pts.y]), k=con["nearest_nodes"])
    dist, idx = np.atleast_2d(dist), np.atleast_2d(idx)
    if dist.shape[0] != len(zones):  # k == 1 returns 1-D arrays
        dist, idx = dist.T, idx.T

    speed_m_per_min = con["speed_mph"] * 1609.344 / 60
    conn_rows, n_conn = [], []
    for z, geoid in enumerate(zones.geoid):
        o, d = f"o{geoid}", f"d{geoid}"
        k = 0
        for dm, i in zip(dist[z], idx[z]):
            if not np.isfinite(dm) or dm > con["max_distance_m"]:
                continue
            node = eligible.id.iloc[i]
            t = dm / speed_m_per_min
            conn_rows.append({"id": f"C{o}_{node}", "a_node": o, "b_node": node, "length_m": round(dm, 1), "fftt_min": t})
            conn_rows.append({"id": f"C{node}_{d}", "a_node": node, "b_node": d, "length_m": round(dm, 1), "fftt_min": t})
            k += 1
        n_conn.append(k)
    zones["origin_node"] = "o" + zones.geoid
    zones["dest_node"] = "d" + zones.geoid
    zones["n_connectors"] = n_conn
    connected = set(zones.loc[zones.n_connectors > 0, "geoid"])
    dropped_zones = sorted(set(zones.geoid) - connected)

    in_zones = od.h_tract.isin(connected) & od.w_tract.isin(connected)
    jobs_dropped_unconnected = int(od.loc[~in_zones, "jobs"].sum())
    od = od[in_zones].copy()
    od["origin_node"] = "o" + od.h_tract
    od["dest_node"] = "d" + od.w_tract

    PROCESSED.mkdir(parents=True, exist_ok=True)
    zones[zones.n_connectors > 0].to_csv(PROCESSED / "zones.csv", index=False)
    pd.DataFrame(conn_rows).to_csv(PROCESSED / "connectors.csv", index=False)
    od.to_csv(PROCESSED / "od_jobs.csv", index=False)

    # --- Commuters -> AM peak-hour vehicle trips ------------------------------------
    missing = [f for f in FACTORS if dem.get(f) is None]
    trips_total = None
    if missing:
        stale = PROCESSED / "od_am_peak.csv"
        if stale.exists():
            stale.unlink()  # never leave trips computed from old factors
        print(f"NOT writing od_am_peak.csv: set demand.{', demand.'.join(missing)} in config.yaml")
    else:
        scale = (dem["commute_days_share"] * dem["auto_mode_share"] / dem["vehicle_occupancy"]
                 * dem["am_peak_hour_share"] * dem["demand_multiplier"])
        od["trips"] = od.jobs * scale
        od.to_csv(PROCESSED / "od_am_peak.csv", index=False)
        trips_total = float(od.trips.sum())

    meta = write_meta(
        PROCESSED / "demand_meta.json",
        lodes_file=name, jobs_florida=total_fl, jobs_work_in_county=jobs_in_county,
        jobs_home_and_work_in_county=jobs_both_in_county, jobs_intrazonal_dropped=intrazonal,
        jobs_dropped_unconnected_zones=jobs_dropped_unconnected, jobs_assigned=int(od.jobs.sum()),
        zones=len(zones), zones_connected=len(connected), zones_dropped=dropped_zones,
        connectors=len(conn_rows), od_pairs=len(od), am_peak_trips=trips_total,
        missing_factors=missing, demand_config=dem, connector_config=con,
    )
    for k in ["jobs_work_in_county", "jobs_home_and_work_in_county", "jobs_intrazonal_dropped",
              "jobs_dropped_unconnected_zones", "jobs_assigned", "zones_connected", "od_pairs", "am_peak_trips"]:
        print(f"{k:32s} {meta[k]}")
    if dropped_zones:
        print(f"zones with no road node within {con['max_distance_m']} m: {dropped_zones}")


if __name__ == "__main__":
    main()
