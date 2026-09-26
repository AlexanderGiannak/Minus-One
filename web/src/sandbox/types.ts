// Shape of public/sandbox/neighborhoods.json (built by pipeline/sandbox/prepare_streets.py
// and web/scripts/build-presets.ts). Real street geometry, SYNTHETIC traffic costs.
import type { AffineNetwork, AffineResult } from '../solver/pathEquilibration'

export interface Segment {
  id: string
  name: string
  from: number
  to: number
  length: number // meters
  capacity: number // assumed veh/h, not measured
  path: [lat: number, lon: number][]
}

export interface Neighborhood extends AffineNetwork {
  name: string
  nodes: [lat: number, lon: number][]
  segments: Segment[]
  bounds: [[south: number, west: number], [north: number, east: number]]
  demo: { seed: number; segment: string; synthetic: true; closedMinutes: number; savedSeconds: number }
  baseline: AffineResult
}

export type Neighborhoods = Record<string, Neighborhood>
