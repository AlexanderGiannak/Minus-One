// Data contract for web/public/data/. Keep in sync with CLAUDE.md and
// pipeline/contract.py. Units: minutes, vehicles/hour, meters.
import type { FeatureCollection, LineString } from 'geojson'

export interface Meta {
  fake: boolean // true for fixtures: the app must show a banner
  generated_by: string
  generated_at: string
}

export interface LinkProps {
  id: string
  a_node: string
  b_node: string
  name: string
  road_class: string
  lanes: number
  capacity_vph: number
  fftt_min: number
  length_m: number
  in_focus: boolean
}

export type Network = FeatureCollection<LineString, LinkProps> & { meta: Meta }

export interface BaseLink {
  id: string
  ue_flow: number
  ue_vc: number
  so_flow: number
  so_vc: number
}

export interface Base {
  meta: Meta
  tstt_ue: number // vehicle-minutes per AM peak hour
  tstt_so: number
  price_of_anarchy: number
  relative_gap: number
  noise_floor_min: number
  total_trips: number
  links: BaseLink[]
}

export interface Candidate {
  link_id: string
  delta_tstt: number // TSTT(removed) - TSTT(base); negative = improvement
  delta_pct: number
  min_saved_per_trip: number
  snr: number // |delta_tstt| / noise_floor_min
  flagged: boolean
  evac_route: boolean
}

export interface Candidates {
  meta: Meta
  candidates: Candidate[]
}

// closures/<link_id>.json
export type Closure = [linkId: string, deltaFlow: number][]

export interface Assumptions {
  meta: Meta
  config: Record<string, unknown> // copy of pipeline/config.yaml
}
