# Tasks

Format: `- [ ] task (owner) — status / blocker`. Add requests for other lanes here.

## Open decisions (team)
- [x] Solver: our own numpy/scipy conjugate Frank-Wolfe, not AequilibraE (decided).
- [ ] **Demand factors (blocks 04_base):** commute_days_share, auto_mode_share,
      vehicle_occupancy, am_peak_hour_share in config.yaml. Until set, 02_demand.py writes
      od_jobs.csv but not od_am_peak.csv.
- [ ] Other config.yaml TODOs: focus polygon (still a rough bbox), lane/speed/capacity
      defaults (30% of links had no maxspeed tag and use the class default), connector
      settings, solver gap, top_n, snr_threshold (5-10), evac route source.

## Solver
- [x] lib/assign.py `solve()` passing pipeline/tests/test_braess.py (Solver)
- [ ] Speed up lib/assign.py (Solver). Benchmark on a FAKE 60x60 grid (14,160 links,
      700 zones, 489k OD pairs, M-series Mac): 0.9 s per iteration (1.1 s after the tree-order fix); gap 4.6e-3 after
      50 iterations (48 s), 5.9e-4 after 150 (143 s). A 1e-5 target is far off at this rate.
      ~70% of time is the Python tree-loading loop in _all_or_nothing (Dijkstra is small).
      Ideas in order: vectorize tree loading (depth levels + np.bincount), bi-conjugate FW,
      multiprocessing across closures, warm starts. Re-measure on the real network.
- [ ] Time one Miami solve → choose laptop vs droplet (Solver)

## Data
- [x] 01_network.py (Data): 5,706 links, 3,100 nodes, 2,244 links in focus
- [x] 02_demand.py (Data): LODES 2023, 702 zones, 178,432 OD pairs, 811,612 commuters;
      0.7% dropped (5 Everglades/bay/far-south tracts). Real network: ~1 s per iteration.
- [ ] 08_export.py (Data)

## Web
- [x] src/solver/frankWolfe.ts `solve()` passing braess.test.ts (Browser solver)
- [x] Paradox + Sandbox panels, ported from emma1 (Browser solver)
- [ ] Sandbox: keep raw GeoStreets pages in data/raw/geostreets/ so the data can be
      rebuilt (only the built JSON is in the repo) (Browser solver)
- [ ] Bundle is ~1.3 MB (MapLibre); lazy-load the map tabs if load time matters (App and map)
- [ ] LinkMap (MapLibre + PMTiles), Miami panel with diff view (App and map)
- [ ] Miami PMTiles extract in web/public (App and map)
