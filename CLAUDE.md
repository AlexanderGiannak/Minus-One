# Minus One

Finds roads in Miami where Braess's paradox may apply: removing the road lowers
everyone's total travel time, because drivers who each pick their own fastest
route overuse it. We compute user equilibrium (UE, selfish routing) and system
optimum (SO, the coordinated best), report the price of anarchy
(TSTT_UE / TSTT_SO), and test candidate road removals.

This is a proof of concept / demo, not a policy proposal.

Event: ShellHacks 2026 (FIU). Submission (GitHub repo on Devpost) due Sunday
Sept 27, 11:00 a.m. ET. Feature freeze 9:00 a.m. Sponsor challenge: Waymo
("use publicly available data to create a hack that improves transportation").

## Framing rules (non-negotiable)
- Never present output as "close this road." Flagged roads are "candidates for
  study" under stated assumptions.
- Every assumption lives in `pipeline/config.yaml` and is shown in the app.
- A road is flagged only if its improvement exceeds `flagging.snr_threshold`
  times the measured solver noise floor. Solver noise must not look like a
  finding.
- If the analysis finds no flagged roads, that is a valid result. Do not
  loosen thresholds to manufacture one.
- The Sandbox uses real street geometry with SYNTHETIC costs tuned to show a
  Braess effect. It must stay labeled as a teaching example and never feed the
  Miami tab or be described as a finding about those streets.

## Scope (decided; no stretch goals)
In: the 4-node paradox demo, a sandbox, Miami base UE/SO, candidate screening
and removals with a diff view, an Assumptions tab.
Out: FDOT calibration, beta/demand sweeps and robust/fragile labels, a live
Miami subnetwork in the browser, Sioux Falls, Broward gateways, the fleet tab.

## Architecture
Offline pipeline → static JSON → static React app. **No backend server.** The
site is read-only; every viewer sees the same precomputed results.

1. **Pipeline** (Python 3.11+, `.venv`, deps pinned in `requirements.txt`;
   our own Frank-Wolfe solver, no AequilibraE).
   Numbered scripts, rerunnable end to end:
   | Script | Does |
   |---|---|
   | `01_network.py` | OSM roads: Miami-Dade motorway/trunk/primary, plus secondary/tertiary inside the focus polygon. Directed links, one-ways kept, nearby intersections consolidated, missing lanes/speeds defaulted by class |
   | `02_demand.py` | LODES8 FL OD, JT01, latest year; workplace in Miami-Dade (12086); blocks → tracts; AM-peak vehicle trips via config factors |
   | `04_base.py` | UE and SO (BPR, beta from config); TSTT, price of anarchy, relative gap; noise floor = base solved at two gap targets |
   | `05_screen.py` | Rank focus-area links by UE flow − SO flow; keep top N |
   | `06_closures.py` | Re-solve with each candidate removed; identical solver settings; one output file per solve; reruns skip finished ones |
   | `08_export.py` | Write the data contract; print file sizes; fail if over budget |
   Batch compute: time one Miami solve first. Laptops if fast, a DigitalOcean
   droplet if minutes per solve.

2. **Web app** (`web/`, Vite + React + TypeScript), static-hosted. MapLibre GL
   JS, one line layer (width = flow, color = v/c) updated via feature-state;
   self-hosted PMTiles basemap so the demo works offline (TODO). The Sandbox
   currently uses online OpenStreetMap raster tiles (needs internet; streets
   and closures still work if tiles fail). Import MapLibre only via `src/map/maplibre.ts`,
   which wires up its worker for Vite.
   Tabs:
   - **The Paradox**: 4-node network, demand slider, shortcut toggle,
     animated flow. Exact closed-form equilibrium (`solver/braessClosedForm.ts`).
   - **Sandbox**: close streets in four small Miami neighborhoods (Downtown,
     Brickell, Overtown, Wynwood). Miami-Dade GeoStreets geometry, all streets
     two-way, one S→T trip of 1,400 veh/h, synthetic affine costs.
     Solved by path equilibration (`solver/pathEquilibration.ts`) in a Web
     Worker. Data: `web/public/sandbox/neighborhoods.json`, built by
     `pipeline/sandbox/prepare_streets.py` + `web/scripts/build-presets.ts`.
   - **Miami**: candidate list + diff view (red = gained flow, blue = lost,
     dashed = removed), from the data contract.
   - **Assumptions**: config.yaml as shipped in `assumptions.json`.
   Paradox and Sandbox were originally built by emmanguyen1 (emma1 branch).

## Data contract (`web/public/data/`)
Types: `web/src/types/contract.ts`. Validator: `pipeline/contract.py`
(run by `pytest`). Change the contract only by editing CLAUDE.md, both of those
files and the fixtures in one commit, and tell the team.

- `network.geojson`: FeatureCollection of LineStrings. Properties: `id`,
  `a_node`, `b_node`, `name`, `road_class`, `lanes`, `capacity_vph`,
  `fftt_min`, `length_m`, `in_focus` (bool). Coordinates rounded to 5 decimals.
- `base.json`: `meta`, `tstt_ue`, `tstt_so`, `price_of_anarchy`,
  `relative_gap`, `noise_floor_min`, `total_trips`, `links: [{id, ue_flow,
  ue_vc, so_flow, so_vc}]`.
- `candidates.json`: `meta`, `candidates: [{link_id, delta_tstt, delta_pct,
  min_saved_per_trip, snr, flagged, evac_route}]`.
  `delta_tstt` = TSTT_UE(removed) − TSTT_UE(base), so negative = improvement.
  `min_saved_per_trip` = −delta_tstt / total_trips.
  `snr` = |delta_tstt| / noise_floor_min.
  `flagged` = delta_tstt < 0 and snr ≥ `flagging.snr_threshold`.
- `closures/<link_id>.json`: `[[link_id, delta_flow], ...]`, UE flow with the
  removal minus base UE flow, only where |delta| > 1% of base flow. Includes
  the removed link itself.
- `assumptions.json`: `meta` + a copy of config.yaml.
- `meta`: `{fake: bool, generated_by, generated_at}`. The app must show a
  banner when `meta.fake` is true.
Units: time in minutes, TSTT in vehicle-minutes per AM peak hour, flow in
vehicles per hour, length in meters.

## Solver interface (same shape in Python and TS)
Link cost: `t(x) = free_time + coef * x**power` (minutes). BPR maps to it as
`free_time = t0`, `coef = t0 * alpha / capacity**beta`, `power = beta`.
- Python: `pipeline/lib/assign.py`:
  `solve(links, od, mode="UE"|"SO", max_iter, rel_gap) -> dict` with keys
  `flow` ({link_id: vph}), `time`, `tstt`, `relative_gap`, `iterations`.
  `links` = list of dicts `{id, a_node, b_node, free_time, coef, power}`;
  `od` = list of `(origin, destination, demand)`.
- TS: `web/src/solver/frankWolfe.ts`: `solve({links, od, mode, maxIter,
  relGap})` returning `{flow, time, tstt, relativeGap, iterations}`. General
  (BPR-capable, UE and SO); not yet used by a tab.
- Tree loading must go children-before-parents by tree order (Dijkstra settle
  order in TS, depth in Python), never by distance alone: zero-cost links tie.
Decided: `assign.py` is our own conjugate Frank-Wolfe (numpy + scipy
`csgraph.dijkstra`), the same algorithm as the TS solver. No AequilibraE: 1.7.0
has no macOS wheels and its BPR can't express the Braess test's zero-cost links.
If a Miami solve is too slow, first coarsen zones / cut top_n; AequilibraE 1.7
on a Linux droplet is the last resort, swapped in behind the same `solve()`.

## Validation
- 4-node Braess: 4000 vehicles S→E. S-A = T/100, A-E = 45, S-B = 45,
  B-E = T/100. Without the shortcut: 2000 per route, 65 min, TSTT 260,000.
  With a zero-cost A-B: UE = 80 min for everyone, TSTT 320,000. SO with the
  shortcut: 1750 / 1750 / 500 on the three routes, TSTT 258,750 (derived, see
  the test). Tests: `pipeline/tests/test_braess.py`,
  `web/src/solver/braess.test.ts`.
- Paradox/Sandbox: `braessClosedForm.test.ts` (every slider value: conservation,
  Wardrop, totals) and `pathEquilibration.test.ts` (classic Braess, each
  neighborhood's baseline, teaching closure, disconnection, restoration).
- Essential metrics: TSTT_UE, TSTT_SO, price of anarchy; ΔTSTT and minutes
  saved per trip for each removal; relative gap + noise floor → SNR.

## Repo layout
```
pipeline/  config.yaml, 01_network.py … 08_export.py, lib/, contract.py,
           make_fixtures.py, tests/
web/       src/{solver,map,panels,sandbox,types}, public/data/,
           public/sandbox/, scripts/build-presets.ts
pipeline/sandbox/prepare_streets.py   Sandbox street graphs from GeoStreets
data/raw/  (gitignored) raw downloads
data/processed/, runs/  (gitignored) intermediates, one file per solve
```

## Ownership (stay in your lane; request changes elsewhere via TASKS.md)
| Workstream | Owns |
|---|---|
| Data | `01`, `02`, `08`, `contract.py`, `make_fixtures.py` |
| Solver | `lib/assign.py`, `04`–`06`, `pipeline/tests/` |
| App and map | App shell, tabs, styles, `src/map`, Miami + Assumptions panels, `src/types/contract.ts` |
| Browser solver | `src/solver`, `src/sandbox`, Paradox + Sandbox panels, sandbox data and scripts, Devpost/video |

## Commands
- Python: `source .venv/bin/activate && pytest`
- Fixtures: `python pipeline/make_fixtures.py`
- Web: `cd web && npm run dev` / `npm test` / `npm run lint` / `npm run build`
- Sandbox data: `python pipeline/sandbox/prepare_streets.py <GeoStreets pages>`
  then `node web/scripts/build-presets.ts`

## How to work with us
- Verify library APIs against installed packages or docs; don't guess
  signatures (osmnx 2.x removed or moved many 1.x functions). If
  something is uncertain, say so instead of silently picking an answer.
- Never fabricate data, numbers or file contents. Use clearly labeled fake
  fixtures when real data isn't ready.
- Prefer the simplest thing that works by the deadline. Flag scope risks early.
- Small commits with clear messages. Ask before adding dependencies.
- Tests must pass (except the known-failing solver tests until the solvers
  exist) before merging to `main`.
- We will disclose AI assistance in our Devpost submission.
