// Single entry point for MapLibre. Vite bundles MapLibre's worker as its own
// chunk; without this, pre-bundling moves maplibre-gl and it can't find the
// worker next to itself, so GeoJSON sources never render.
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'

maplibregl.setWorkerUrl(workerUrl)

export { maplibregl }
