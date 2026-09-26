# Minus One: Braess simulator addition

Open `dist/index.html` in a browser. No install or network is needed. The left panel controls density (hourly demand) and shortcut access. The right panel shows route shares, road flows, and mean travel time. Motion is illustrative, with pause and reduced-motion support.

## Model

The directed network is S→A→T, S→B→T, and optional A→B. S→A and B→T cost flow/100 minutes. S→B and A→T cost 45 minutes. A→B has idealized zero cost. Demand is identical in open and closed comparisons.

For demand q with the shortcut open, each outer-only route carries min(q/2, max(0,q−4500)); the shortcut route carries the remainder. Without it, each outer route carries q/2. This is the exact static user equilibrium, not a system-optimal assignment. At q=4000, closing the shortcut reduces mean time from 80 to 65 minutes. At low demand it can worsen travel time; at q≥9000 the shortcut is unused. At zero demand the interface reports no trips.

The Simulator tab is schematic. The Miami Streets tab uses real Miami-Dade centerlines on an OpenStreetMap basemap, with synthetic two-way traffic scenarios for Downtown, Brickell, Overtown, and Wynwood. Neither tab forecasts real road closures.

## Verification

Run `node test-model.cjs`. It checks known numerical cases, flow conservation, Wardrop equilibrium, and total travel-time consistency across all nonzero slider values and both shortcut settings.

## Integration

`dist/model.js` exposes the pure function `Braess.equilibrium(demand, shortcut)` in the browser, and exports it through CommonJS for testing. `app.js` handles DOM updates and visual motion; `style.css` owns responsive layout.

## Miami Streets

For the full map, serve `dist` over HTTP: `python3 -m http.server 5173 --bind 127.0.0.1 --directory dist`. Open http://127.0.0.1:5173 and choose **Miami Streets**. Leaflet is bundled locally; OpenStreetMap basemap tiles require internet. If tiles fail, the downloaded street geometry and simulation still work. The direct-file version uses a synchronous solver fallback if workers are unavailable.

Choose a neighborhood, then click a colored street segment. The popup and left panel offer deletion/restoration. Multiple closures are supported. The initial estimate is fixed per neighborhood, computed from the same demand with all segments open. Closures persist while switching tabs or neighborhoods during the session. A reload resets them. Use **Locate an example Braess segment** for a known beneficial closure; it only selects the road, it does not close it automatically.

### Provenance and assumptions

Street geometry: [Miami-Dade GeoStreets layer 73](https://gisweb.miamidade.gov/arcgis/rest/services/MD_LandInformation/MapServer/73), retrieved September 26, 2026, using three ordered GeoJSON pages (1,000 + 1,000 + 956 records). Study envelope: longitude −80.211 to −80.182, latitude 25.752 to 25.815. Named local centerlines are filtered into four rectangular study areas, endpoints snapped at approximately one-meter precision, and each area's largest connected component retained. These are approximate study areas, not official neighborhood boundaries. Basemap © OpenStreetMap contributors; Leaflet 1.9.4 BSD-2-Clause.

All centerlines are modeled as **two-way**, ignoring real one-way rules and turn restrictions. Each area has one fixed origin/destination with 1,400 vehicles/hour. Capacity labels are assumed (650 veh/h for avenues/boulevards, otherwise 400), not measured. The red/yellow/green colors represent aggregate segment flow divided by this assumed capacity: red ≥1, yellow ≥0.5, otherwise green. Unused roads are low density.

`traffic-model.js` solves static user equilibrium with path equilibration and exact line minimization for nonnegative affine road costs `a + b*flow`. Flow is conserved, closed segments lose both directed edges, and disconnected trips produce **No route**, never a false time saving. A Web Worker keeps calculation off the UI thread. A relative equilibrium gap of 1e-6 is the interactive target; approximate results are labeled if this is not reached.

`scripts/build-presets.cjs` deliberately varies synthetic fixed delays and congestion sensitivity, using deterministic seeds chosen to exhibit Braess effects. These coefficients do **not** come from the county data. Benefits are computed by the solver, not hardcoded discounts. An overall 0.25 cost multiplier applies equally before and after closures. Baselines are precomputed at a tighter 1e-8 gap for fast loading. No live Google/OSM traffic observations are used.

Verified teaching examples (not real-world closure recommendations):

| Area | Segment | Baseline | Closed | Saving |
|---|---|---:|---:|---:|
| Downtown | SE 2ND ST #20728-0 | 25.2556 min | 24.8523 min | 24.19 sec |
| Brickell | SW 22ND RD #22865-0 | 23.8759 min | 23.6193 min | 15.40 sec |
| Overtown | NW 1ST PL #43107-0 | 29.7406 min | 29.6942 min | 2.78 sec |
| Wynwood | NW 26TH ST #24258-0 | 22.4865 min | 22.3351 min | 9.08 sec |

Run `node test-miami.cjs` for numerical Braess reference cases, conservation, stable baselines, restoration, disconnected trips, both requested density colors, and tighter-tolerance verification in all four neighborhoods. To regenerate data, run `scripts/prepare-streets.py` on the downloaded county GeoJSON pages, then `node scripts/build-presets.cjs`.
