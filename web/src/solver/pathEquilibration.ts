// Static user equilibrium for affine link costs a + b*flow (minutes), solved by
// path equilibration: repeatedly shift flow from the costliest used path to the
// current shortest path by the exact line-minimizing amount. Used by the Sandbox
// (small neighborhood networks). Flows are vehicles/hour; demand is never dropped:
// if a closure disconnects a trip, the result is `reachable: false`.

export interface AffineEdge {
  from: number
  to: number
  a: number // fixed minutes
  b: number // minutes per (vehicle/hour)
  segment: string // edges sharing a segment are closed together
}

export interface AffineNetwork {
  nodes: unknown[] // only the count is used here
  edges: AffineEdge[]
  demand: { from: number; to: number; flow: number }[]
}

export interface AffineResult {
  reachable: boolean
  time: number | null // average trip minutes
  flows: number[]
  costs?: number[]
  gap: number | null
  converged: boolean
  iterations: number
}

interface Route { path: number[]; flow: number }

export function solve(
  network: AffineNetwork,
  closedIds: Iterable<string> = [],
  options: { tolerance?: number; maxIterations?: number } = {},
): AffineResult {
  const closed = new Set(closedIds)
  const edges = network.edges
  const n = network.nodes.length
  const adjacency: number[][] = Array.from({ length: n }, () => [])
  edges.forEach((e, i) => { if (!closed.has(e.segment)) adjacency[e.from].push(i) })

  function assignment(costs: number[]) {
    const y = new Float64Array(edges.length)
    const paths: number[][] = []
    let shortestTotal = 0
    for (const od of network.demand) {
      // O(n^2) Dijkstra; fine for the few-hundred-node sandbox graphs.
      const dist = new Float64Array(n).fill(Infinity)
      const prev = new Int32Array(n).fill(-1)
      const done = new Uint8Array(n)
      dist[od.from] = 0
      for (let k = 0; k < n; k++) {
        let u = -1
        let best = Infinity
        for (let j = 0; j < n; j++) if (!done[j] && dist[j] < best) { best = dist[j]; u = j }
        if (u < 0 || u === od.to) break
        done[u] = 1
        for (const i of adjacency[u]) {
          const e = edges[i]
          const d = best + costs[i]
          if (d < dist[e.to]) { dist[e.to] = d; prev[e.to] = i }
        }
      }
      if (!Number.isFinite(dist[od.to])) return null
      shortestTotal += dist[od.to] * od.flow
      let v = od.to
      const path: number[] = []
      while (v !== od.from) {
        const i = prev[v]
        if (i < 0) return null
        y[i] += od.flow
        path.push(i)
        v = edges[i].from
      }
      paths.push(path)
    }
    return { y, shortestTotal, paths }
  }

  const initial = assignment(edges.map((e) => e.a))
  if (!initial) {
    return { reachable: false, time: null, flows: edges.map(() => 0), gap: null, converged: false, iterations: 0 }
  }
  const x = initial.y
  let gap = Infinity
  let iterations = 0
  const routes = initial.paths.map((path, i) => new Map<string, Route>([[path.join(','), { path, flow: network.demand[i].flow }]]))
  const tolerance = options.tolerance ?? 1e-6
  const maxIterations = options.maxIterations ?? 6000

  for (; iterations < maxIterations; iterations++) {
    const costs = edges.map((e, i) => e.a + e.b * x[i])
    const next = assignment(costs)!
    let total = 0
    for (let i = 0; i < edges.length; i++) total += x[i] * costs[i]
    gap = Math.max(0, (total - next.shortestTotal) / Math.max(total, 1e-12))
    if (gap < tolerance) break

    // Pick the used path with the largest cost advantage over its OD's shortest path.
    let chosen: { route: Route; set: Map<string, Route>; shortest: number[]; advantage: number } | null = null
    for (let odIndex = 0; odIndex < routes.length; odIndex++) {
      const set = routes[odIndex]
      const shortest = next.paths[odIndex]
      const shortestCost = shortest.reduce((s, i) => s + costs[i], 0)
      for (const route of set.values()) {
        if (route.flow > 1e-10) {
          const advantage = route.path.reduce((s, i) => s + costs[i], 0) - shortestCost
          if (advantage > 1e-10 && (!chosen || advantage > chosen.advantage)) chosen = { route, set, shortest, advantage }
        }
      }
    }
    if (!chosen) break

    const direction = new Map<number, number>()
    chosen.shortest.forEach((i) => direction.set(i, (direction.get(i) ?? 0) + 1))
    chosen.route.path.forEach((i) => direction.set(i, (direction.get(i) ?? 0) - 1))
    let curvature = 0
    direction.forEach((d, i) => { curvature += edges[i].b * d * d })
    const shift = Math.min(chosen.route.flow, curvature > 0 ? chosen.advantage / curvature : chosen.route.flow)
    direction.forEach((d, i) => { x[i] = Math.max(0, x[i] + shift * d) })
    chosen.route.flow -= shift
    const key = chosen.shortest.join(',')
    if (!chosen.set.has(key)) chosen.set.set(key, { path: chosen.shortest, flow: 0 })
    chosen.set.get(key)!.flow += shift
  }

  const costs = edges.map((e, i) => e.a + e.b * x[i])
  const total = x.reduce((s, f, i) => s + f * costs[i], 0)
  const demand = network.demand.reduce((s, d) => s + d.flow, 0)
  const finalAssignment = assignment(costs)!
  gap = Math.max(0, (total - finalAssignment.shortestTotal) / Math.max(total, 1e-12))
  return { reachable: true, time: total / demand, flows: Array.from(x), costs, gap, converged: gap < tolerance, iterations }
}
