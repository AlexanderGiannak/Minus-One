# Tasks

Format: `- [ ] task (owner) — status / blocker`. Add requests for other lanes here.

## Open decisions (team)
- [x] Solver: our own numpy/scipy conjugate Frank-Wolfe, not AequilibraE (decided).
- [ ] config.yaml TODOs: focus polygon, LODES year, demand factors, lane/speed/capacity
      defaults, solver gap, top_n, snr_threshold (5-10), evac route source.

## Solver
- [ ] lib/assign.py `solve()` passing pipeline/tests/test_braess.py (Solver)
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
