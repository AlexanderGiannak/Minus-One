# Tasks

Format: `- [ ] task (owner) — status / blocker`. Add requests for other lanes here.

## Open decisions (team)
- [ ] AequilibraE on macOS: 1.7.0 has wheels for Linux/Windows only and fails to build from
      source on macOS (clang: no -fopenmp). Options: (a) run the solve steps on Linux
      (droplet or Docker), (b) pin 1.5.0 (last macOS arm64 wheel; older API, verify pandas 3
      compatibility), (c) our own numpy/scipy Frank-Wolfe in lib/assign.py. Note: the Braess
      test uses zero free-flow-time links (S-A, B-E), which BPR can't express exactly, so the
      Python Braess test needs our own solver or a tolerance change either way.
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
