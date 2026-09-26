# Tasks

Format: `- [ ] task (owner) — status / blocker`. Add requests for other lanes here.

## Open decisions (team)
- [x] Solver: our own numpy/scipy conjugate Frank-Wolfe, not AequilibraE (decided).
- [ ] config.yaml TODOs: focus polygon, LODES year, demand factors, lane/speed/capacity
      defaults, solver gap, top_n, snr_threshold (5-10), evac route source.

## Solver
- [x] lib/assign.py `solve()` passing pipeline/tests/test_braess.py (Solver)
- [ ] Speed up lib/assign.py (Solver). Benchmark on a FAKE 60x60 grid (14,160 links,
      700 zones, 489k OD pairs, M-series Mac): 0.9 s per iteration; gap 4.6e-3 after
      50 iterations (48 s), 5.9e-4 after 150 (143 s). A 1e-5 target is far off at this rate.
      ~70% of time is the Python tree-loading loop in _all_or_nothing (Dijkstra is small).
      Ideas in order: vectorize tree loading (depth levels + np.bincount), bi-conjugate FW,
      multiprocessing across closures, warm starts. Re-measure on the real network.
- [ ] Time one Miami solve → choose laptop vs droplet (Solver)

## Data
- [ ] 01_network.py (Data)
- [ ] 02_demand.py (Data)
- [ ] 08_export.py (Data)

## Web
- [ ] src/solver/frankWolfe.ts `solve()` passing braess.test.ts (Browser solver)
- [ ] Web Worker wrapper around the solver (Browser solver)
- [ ] Paradox + Sandbox panels (Browser solver)
- [ ] LinkMap (MapLibre + PMTiles), Miami panel with diff view (App and map)
- [ ] Miami PMTiles extract in web/public (App and map)
