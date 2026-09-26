# Minus One

Finds roads in Miami where Braess's paradox may apply: closing a road can lower
everyone's travel time, because drivers who each pick their own fastest route
overuse it. ShellHacks 2026 proof of concept, not a policy proposal.

- **The Paradox**: the classic 4-node network, live.
- **Sandbox**: close streets in four Miami neighborhoods. Real street geometry,
  synthetic traffic costs, teaching examples only.
- **Miami**: precomputed candidates for study from the offline pipeline
  (currently FAKE fixture data until the pipeline runs).
- **Assumptions**: every modeling assumption.

## Run

```
cd web && npm install && npm run dev      # app
npm test && npm run build                  # tests, production build
uv venv .venv --python 3.12 && uv pip install -r requirements.txt
.venv/bin/pytest                           # pipeline tests
```

See `CLAUDE.md` for architecture, the data contract and conventions.

## Sandbox data provenance

Street geometry: [Miami-Dade GeoStreets layer 73](https://gisweb.miamidade.gov/arcgis/rest/services/MD_LandInformation/MapServer/73),
retrieved September 26, 2026 (1,000 + 1,000 + 956 records). Study areas are
approximate rectangles, not official neighborhood boundaries; endpoints are
snapped at about one-meter precision and each area keeps its largest connected
component. All centerlines are treated as two-way. Each area has one
origin/destination pair with 1,400 vehicles/hour, and capacities are assumed
(650 veh/h for avenues/boulevards, otherwise 400). Costs are synthetic and were
deliberately varied with seeds chosen to exhibit Braess effects; they do not
come from county data or observed traffic.

| Area | Teaching closure | Baseline | Closed | Saving |
|---|---|---:|---:|---:|
| Downtown | SE 2ND ST #20728-0 | 25.2556 min | 24.8523 min | 24.19 sec |
| Brickell | SW 22ND RD #22865-0 | 23.8759 min | 23.6193 min | 15.40 sec |
| Overtown | NW 1ST PL #43107-0 | 29.7406 min | 29.6942 min | 2.78 sec |
| Wynwood | NW 26TH ST #24258-0 | 22.4865 min | 22.3351 min | 9.08 sec |

These are properties of the synthetic model, not recommendations to close
Miami streets.

## Credits

Paradox and Sandbox tabs (design, solvers, data preparation) by emmanguyen1.
Built with AI assistance, disclosed in our Devpost submission.
